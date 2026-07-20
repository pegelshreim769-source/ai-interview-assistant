import { RESUME_METHODOLOGY, RESUME_METHODOLOGY_VERSION } from "./methodology";
import type { FactLedger, ResumePlan, RewrittenExperience } from "./types";

export const RESUME_STUDIO_SYSTEM_PROMPT = `你是一个严谨的中文简历事实编辑器，执行方法论版本 ${RESUME_METHODOLOGY_VERSION}。
你只能基于输入中的原始简历、用户已确认事实和目标 JD 工作。
禁止编造或推断雇主、项目、职责、工具、指标、日期、证书、论文、奖项、链接、上线状态和个人贡献边界。
任何输出事实都必须引用输入中真实存在的证据编号。没有证据的内容只能进入 evidence_gaps。
你必须只输出合法 JSON，不要输出 Markdown 或额外解释。`;

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function buildFactLedgerPrompt(resumeText: string) {
  return `任务：build_fact_ledger

把原始简历拆成原子事实，每条事实都必须能用 source_excerpt 在原文中逐字定位。

规则：
1. evidence_id 使用 E001、E002 递增编号。
2. identity/contact/education/certification/employer/role/date/metric/publication/link 的 fixed 必须为 true，change_policy 必须为 fixed。
3. 日期写入 date.raw；能拆分时写 start/end，不能拆分则保留空字符串。
4. 指标写入 metrics，每项保留原始 raw 与上下文 context，不改口径。
5. 相关事实用稳定的 experience_id 分组，并提供 experience_title。
6. 模糊、冲突或缺少上下文的事实仍可记录，但 risk_note 要说明，verification_status 固定输出 pending。
7. 不要输出原文中不存在的事实；需要补充的内容放入 evidence_gaps。

输出结构：
{
  "items": [{
    "evidence_id": "E001",
    "source": "resume",
    "source_excerpt": "原文逐字片段",
    "fact": "原子事实",
    "category": "identity|contact|education|certification|employer|role|date|experience|project|skill|metric|publication|link|other",
    "change_policy": "fixed|paraphrase|selectable|optional",
    "fixed": true,
    "verification_status": "pending",
    "date": { "raw": "", "start": "", "end": "" } 或 null,
    "metrics": [{ "raw": "", "context": "" }],
    "experience_id": "exp-01",
    "experience_title": "组织 / 项目 / 岗位",
    "risk_note": ""
  }],
  "evidence_gaps": [{
    "description": "",
    "required_for": "",
    "related_evidence_ids": []
  }]
}

原始简历：
${resumeText}`;
}

export function buildResumePlanPrompt(ledger: FactLedger, jdText: string) {
  const confirmedItems = ledger.items.filter((item) => item.verification_status === "confirmed");
  return `任务：build_resume_plan

根据目标 JD 对已确认事实做证据匹配和经历选择。按机制匹配，不按公司名气；待确认事实不能用于规划。

方法论原则：${RESUME_METHODOLOGY.principles.join("；")}

输出结构：
{
  "target_role": "精确目标岗位",
  "narrative": "该版本的一句主线",
  "target_keywords": [""],
  "jd_signals": [{
    "signal": "",
    "importance": "must|important|bonus",
    "evidence_ids": ["E001"],
    "gap": "没有证据时说明缺口"
  }],
  "experiences": [{
    "experience_id": "exp-01",
    "title": "",
    "match_strength": "strong|transferable|supporting|irrelevant",
    "reason": "",
    "evidence_ids": ["E001"],
    "selected": true,
    "order": 1
  }],
  "capability_groups": [{ "label": "", "evidence_ids": ["E001"] }],
  "evidence_gaps": [{ "description": "", "required_for": "", "related_evidence_ids": [] }]
}

已确认事实：
${stringify(confirmedItems)}

目标 JD：
${jdText}`;
}

export function rewriteExperiencePrompt(ledger: FactLedger, plan: ResumePlan, experienceId: string) {
  const allowedEvidence = ledger.items.filter(
    (item) => item.experience_id === experienceId && item.verification_status === "confirmed"
  );
  const experiencePlan = plan.experiences.find((item) => item.experience_id === experienceId);

  return `任务：rewrite_experience

只改写指定经历。每条 scene_summary 和 bullet 都必须引用 supporting evidence_ids；引用编号之外的事实一律不能写入正文。
保持日期、组织、岗位、项目名、数值、证书和链接原样。区分 PRD、原型、可运行 Demo、测试集、报告和验收用例，不得互换。
bullet 使用“证据标签：动作 + 方法/机制 + 结果/价值”，共享贡献使用“参与、推动、支撑”，不要改成独立主导。

输出结构：
{
  "experience_id": "${experienceId}",
  "title": "",
  "original_text": "",
  "scene_summary": "",
  "scene_summary_evidence_ids": ["E001"],
  "bullets": [{
    "bullet_id": "${experienceId}-b01",
    "label": "",
    "text": "",
    "evidence_ids": ["E001"],
    "decision": "pending"
  }],
  "evidence_gaps": [{ "description": "", "required_for": "", "related_evidence_ids": [] }]
}

岗位规划：
${stringify(experiencePlan)}

该经历允许使用的已确认事实：
${stringify(allowedEvidence)}`;
}

export function validateResumeClaimsPrompt(ledger: FactLedger, rewrites: RewrittenExperience[]) {
  return `任务：validate_resume_claims

逐条检查已接受改写是否引用存在且已确认的证据，指标和日期是否保持原始口径，固定事实是否漂移。
发现问题只输出 issue 和 evidence_gaps，不要代写修复后的事实。

事实台账：${stringify(ledger.items)}
改写结果：${stringify(rewrites)}`;
}

export function finalizeResumePrompt(ledger: FactLedger, plan: ResumePlan, rewrites: RewrittenExperience[]) {
  const confirmedItems = ledger.items.filter((item) => item.verification_status === "confirmed");
  const acceptedRewrites = rewrites.map((rewrite) => ({
    ...rewrite,
    bullets: rewrite.bullets.filter((bullet) => bullet.decision === "accepted")
  }));

  return `任务：finalize_resume

只生成目标标题、2-3 条摘要和最多 4 组核心能力。经历正文将由系统直接使用用户已接受的改写，不要重复生成经历。
摘要和能力每一行都必须关联 evidence_ids；没有证据的内容不要输出。

输出结构：
{
  "target_title": "",
  "summary": [{ "text": "", "evidence_ids": ["E001"] }],
  "capabilities": [{ "label": "", "content": "", "evidence_ids": ["E001"] }],
  "evidence_gaps": [{ "description": "", "required_for": "", "related_evidence_ids": [] }]
}

岗位规划：${stringify(plan)}
已确认事实：${stringify(confirmedItems)}
已接受改写：${stringify(acceptedRewrites)}`;
}
