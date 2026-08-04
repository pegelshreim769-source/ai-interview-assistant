import { NextResponse } from "next/server";
import { withBetaAccess } from "../../lib/beta-access/api-auth";
import { getChatProviderConfig, requestChatCompletion } from "../../lib/server/ai-provider";
import { parseJsonObject, readAssistantTextContent } from "../../lib/server/json-output";
import { LIMITS } from "../../lib/shared/limits";
import {
  RESUME_METHODOLOGY_VERSION,
  buildFactLedgerFromText,
  buildResumePlanFromLedger
} from "../../lib/resume-studio/methodology";
import {
  RESUME_STUDIO_SYSTEM_PROMPT,
  rewriteExperiencePrompt
} from "../../lib/resume-studio/prompts";
import type {
  EvidenceGap,
  FactLedger,
  FinalResume,
  ResumePlan,
  ResumeStudioRequest,
  RewrittenExperience
} from "../../lib/resume-studio/types";
import {
  normalizeFactLedger,
  validateRewrites
} from "../../lib/resume-studio/validators";

export const runtime = "nodejs";

type ProviderPayload = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
};

type ModelGap = {
  description?: string;
  required_for?: string;
  related_evidence_ids?: string[];
};

type ModelRewrite = Partial<RewrittenExperience> & {
  evidence_gaps?: ModelGap[];
};

function createGap(index: number, scope: EvidenceGap["scope"], gap: ModelGap): EvidenceGap {
  return {
    gap_id: `GAP-${String(index + 1).padStart(3, "0")}`,
    scope,
    description: gap.description?.trim() || "存在需要用户补充的证据。",
    required_for: gap.required_for?.trim() || "简历事实",
    related_evidence_ids: Array.isArray(gap.related_evidence_ids) ? gap.related_evidence_ids.filter((item): item is string => typeof item === "string") : [],
    resolved: false
  };
}

function normalizeGaps(gaps: ModelGap[] | undefined, scope: EvidenceGap["scope"]) {
  return (Array.isArray(gaps) ? gaps : []).map((gap, index) => createGap(index, scope, gap));
}

function dedupeGaps(gaps: EvidenceGap[]) {
  const seen = new Set<string>();
  return gaps
    .filter((gap) => {
      const key = `${gap.scope}:${gap.description.trim()}:${gap.required_for.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((gap, index) => ({ ...gap, gap_id: `GAP-${String(index + 1).padStart(3, "0")}` }));
}

function ensureTextLength(value: string, label: string) {
  if (!value.trim()) throw new Error(`请先提供${label}。`);
  if (value.length > LIMITS.CUSTOM_TEXT_MAX_CHARS) {
    throw new Error(`${label}最多支持 ${LIMITS.CUSTOM_TEXT_MAX_CHARS} 个字符，请删减后再试。`);
  }
}

function assertMethodologyVersion(value: { methodology_version?: string }, label: string) {
  if (value.methodology_version !== RESUME_METHODOLOGY_VERSION) {
    throw new Error(`${label}的方法论版本与当前工作台不一致，请重新生成。`);
  }
}

async function requestJson<T>(prompt: string) {
  const config = getChatProviderConfig();
  if (!config.apiKey) throw new Error("缺少 OPENAI_API_KEY，暂时无法生成简历工作台内容。");

  const response = await requestChatCompletion({
    config,
    messages: [
      { role: "system", content: RESUME_STUDIO_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "resume_studio_response",
        strict: false,
        schema: { type: "object" }
      }
    }
  });

  const payload = (await response.json().catch(() => ({}))) as ProviderPayload;
  if (!response.ok) throw new Error(payload.error?.message || "模型暂时无法处理这一步，请稍后再试。");

  const content = readAssistantTextContent(payload.choices?.[0]?.message?.content);
  const parsed = parseJsonObject<T>(content);
  if (!parsed) throw new Error("模型返回的结构无法校验，请重试这一步。");
  return parsed;
}

function allowedEvidenceIds(ledger: FactLedger, experienceId?: string) {
  return new Set(
    ledger.items
      .filter((item) => item.verification_status === "confirmed" && (!experienceId || item.experience_id === experienceId))
      .map((item) => item.evidence_id)
  );
}

function sanitizeIds(ids: unknown, allowed: Set<string>) {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && allowed.has(id))));
}

async function buildFactLedger(resumeText: string) {
  ensureTextLength(resumeText, "简历文本");
  const factLedger = normalizeFactLedger(buildFactLedgerFromText(resumeText), resumeText);
  if (!factLedger.items.length) throw new Error("暂时没能从简历中定位出可核对事实，请检查文本后重试。");
  return factLedger;
}

async function buildResumePlan(factLedger: FactLedger, jdText: string) {
  assertMethodologyVersion(factLedger, "事实台账");
  ensureTextLength(jdText, "岗位 JD");

  const resumePlan = buildResumePlanFromLedger(factLedger, jdText);
  if (!resumePlan.experiences.length) throw new Error("请先确认至少一组经历事实，再生成岗位匹配规划。");
  return resumePlan;
}

async function rewriteExperience(factLedger: FactLedger, resumePlan: ResumePlan, experienceId: string) {
  assertMethodologyVersion(factLedger, "事实台账");
  assertMethodologyVersion(resumePlan, "岗位规划");
  const allowed = allowedEvidenceIds(factLedger, experienceId);
  const items = factLedger.items.filter((item) => allowed.has(item.evidence_id));
  if (!items.length) throw new Error("这段经历还没有已确认事实，不能开始改写。");

  const model = await requestJson<ModelRewrite>(rewriteExperiencePrompt(factLedger, resumePlan, experienceId));
  const title = model.title?.trim() || resumePlan.experiences.find((item) => item.experience_id === experienceId)?.title || experienceId;
  const originalText = items.map((item) => item.source_excerpt).join("\n");
  const gaps = normalizeGaps(model.evidence_gaps, "rewrite");
  const sceneSummary = model.scene_summary?.trim() || "";
  const sceneIds = sanitizeIds(model.scene_summary_evidence_ids, allowed);

  const candidateBullets = (Array.isArray(model.bullets) ? model.bullets : []).slice(0, 6).map((bullet, index) => ({
    bullet_id: `${experienceId}-b${String(index + 1).padStart(2, "0")}`,
    label: bullet.label?.trim() || "经历证据",
    text: bullet.text?.trim() || "",
    evidence_ids: sanitizeIds(bullet.evidence_ids, allowed),
    decision: "accepted" as const
  })).filter((bullet) => bullet.text);

  const validBullets = candidateBullets.filter((bullet) => {
    const candidate: RewrittenExperience = {
      experience_id: experienceId,
      title,
      original_text: originalText,
      scene_summary: "",
      scene_summary_evidence_ids: [],
      bullets: [bullet],
      evidence_gaps: []
    };
    const validation = validateRewrites(factLedger, [candidate]);
    if (validation.valid) return true;
    gaps.push(...validation.evidence_gaps.map((gap) => ({ ...gap, gap_id: `GAP-${String(gaps.length + 1).padStart(3, "0")}` })));
    return false;
  });

  let validScene = sceneSummary;
  if (sceneSummary) {
    const sceneValidation = validateRewrites(factLedger, [{
      experience_id: experienceId,
      title,
      original_text: originalText,
      scene_summary: sceneSummary,
      scene_summary_evidence_ids: sceneIds,
      bullets: [],
      evidence_gaps: []
    }]);
    if (!sceneValidation.valid) {
      validScene = "";
      gaps.push(...sceneValidation.evidence_gaps);
    }
  }

  return {
    experience_id: experienceId,
    title,
    original_text: originalText,
    scene_summary: validScene,
    scene_summary_evidence_ids: validScene ? sceneIds : [],
    bullets: validBullets.map((bullet) => ({ ...bullet, decision: "pending" as const })),
    evidence_gaps: gaps
  } satisfies RewrittenExperience;
}

function renderFinalText(final: Omit<FinalResume, "full_text" | "validation" | "evidence_ids">) {
  const sections: string[] = [final.target_title];
  if (final.summary.length) sections.push(`个人摘要\n${final.summary.map((line) => line.text).join("\n")}`);
  if (final.capabilities.length) {
    sections.push(`核心能力\n${final.capabilities.map((item) => `${item.label}：${item.content}`).join("\n")}`);
  }
  if (final.experiences.length) {
    sections.push(`经历\n${final.experiences.map((experience) => [experience.title, experience.scene_summary.text, ...experience.bullets.map((line) => `• ${line.text}`)].filter(Boolean).join("\n")).join("\n\n")}`);
  }
  return sections.filter(Boolean).join("\n\n");
}

async function finalizeResume(factLedger: FactLedger, resumePlan: ResumePlan, rewrites: RewrittenExperience[], clientValidationValid: boolean) {
  assertMethodologyVersion(factLedger, "事实台账");
  assertMethodologyVersion(resumePlan, "岗位规划");
  const validation = validateRewrites(factLedger, rewrites);
  if (!clientValidationValid || !validation.valid) throw new Error("事实与指标校验尚未通过，请先处理阻断问题。");

  const acceptedRewrites = rewrites.filter((rewrite) => rewrite.bullets.some((bullet) => bullet.decision === "accepted"));
  if (!acceptedRewrites.length) throw new Error("请至少接受一条经历改写，再生成完整简历。");

  const summary = acceptedRewrites
    .filter((rewrite) => rewrite.scene_summary.trim())
    .map((rewrite) => ({ text: rewrite.scene_summary, evidence_ids: rewrite.scene_summary_evidence_ids }))
    .slice(0, 3);

  const capabilities = acceptedRewrites
    .flatMap((rewrite) => rewrite.bullets)
    .filter((bullet) => bullet.decision === "accepted")
    .map((bullet) => ({ label: bullet.label, content: bullet.text, evidence_ids: bullet.evidence_ids }))
    .slice(0, 4);

  const orderMap = new Map(resumePlan.experiences.map((item) => [item.experience_id, item.order]));
  const experiences = acceptedRewrites
    .map((rewrite) => ({
      experience_id: rewrite.experience_id,
      title: rewrite.title,
      scene_summary: { text: rewrite.scene_summary, evidence_ids: rewrite.scene_summary_evidence_ids },
      bullets: rewrite.bullets
        .filter((bullet) => bullet.decision === "accepted")
        .map((bullet) => ({ text: bullet.text, evidence_ids: bullet.evidence_ids }))
    }))
    .sort((left, right) => (orderMap.get(left.experience_id) || 99) - (orderMap.get(right.experience_id) || 99));

  const partial = {
    methodology_version: RESUME_METHODOLOGY_VERSION,
    target_title: resumePlan.target_role,
    summary,
    capabilities,
    experiences
  };
  const evidenceIds = Array.from(new Set([
    ...summary.flatMap((line) => line.evidence_ids),
    ...capabilities.flatMap((item) => item.evidence_ids),
    ...experiences.flatMap((experience) => [
      ...experience.scene_summary.evidence_ids,
      ...experience.bullets.flatMap((line) => line.evidence_ids)
    ])
  ]));

  return {
    ...partial,
    full_text: renderFinalText(partial),
    evidence_ids: evidenceIds,
    validation: {
      ...validation,
      evidence_gaps: dedupeGaps([...validation.evidence_gaps, ...resumePlan.evidence_gaps])
    }
  } satisfies FinalResume;
}

async function handlePost(request: Request) {
  try {
    const body = (await request.json()) as ResumeStudioRequest;

    if (body.action === "build_fact_ledger") {
      return NextResponse.json({ fact_ledger: await buildFactLedger(body.resume_text) });
    }
    if (body.action === "build_resume_plan") {
      return NextResponse.json({ resume_plan: await buildResumePlan(body.fact_ledger, body.jd_text) });
    }
    if (body.action === "rewrite_experience") {
      return NextResponse.json({ rewrite: await rewriteExperience(body.fact_ledger, body.resume_plan, body.experience_id) });
    }
    if (body.action === "validate_resume_claims") {
      assertMethodologyVersion(body.fact_ledger, "事实台账");
      return NextResponse.json({ claims_validation: validateRewrites(body.fact_ledger, body.rewrites) });
    }
    if (body.action === "finalize_resume") {
      return NextResponse.json({
        final_resume: await finalizeResume(
          body.fact_ledger,
          body.resume_plan,
          body.rewrites,
          body.claims_validation?.valid === true
        )
      });
    }

    return NextResponse.json({ error: "不支持的简历工作台动作。" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "简历工作台暂时不可用，请稍后再试。";
    const status = /请先|缺少|最多支持|版本|不能|尚未/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export const POST = withBetaAccess(handlePost);
