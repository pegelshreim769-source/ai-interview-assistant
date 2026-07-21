"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, CopySimple, FileDoc, FilePdf, FileText, ImageSquare, UploadSimple } from "@phosphor-icons/react";
import { BetaPrivacyNotice } from "../components/beta-privacy-notice";
import { PracticeLayout } from "../components/practice-layout";
import { ResumeDocument } from "../components/resume-document";
import { WorkflowSteps } from "../components/workflow-steps";
import { LIMITS } from "../lib/shared/limits";
import { downloadResumeDocx, downloadResumePdf } from "../lib/resume-studio/export";
import { RESUME_METHODOLOGY_VERSION } from "../lib/resume-studio/methodology";
import {
  clearResumeStudioSession,
  readResumeStudioSession,
  writeResumeStudioInterviewHandoff,
  writeResumeStudioSession
} from "../lib/resume-studio/storage";
import type {
  ClaimsValidation,
  FactLedger,
  FinalResume,
  ResumePlan,
  ResumeStudioInputMeta,
  ResumeStudioSession,
  ResumeStudioStep,
  RewrittenExperience
} from "../lib/resume-studio/types";

type ExtractResponse = {
  extracted_text: string;
  original_file_name: string;
  parse_source: string;
  error?: string;
};

type ApiResponse = {
  fact_ledger?: FactLedger;
  resume_plan?: ResumePlan;
  rewrite?: RewrittenExperience;
  claims_validation?: ClaimsValidation;
  final_resume?: FinalResume;
  error?: string;
};

type BusyAction = "" | "extract_resume" | "extract_jd" | "facts" | "plan" | "rewrite" | "finalize";
type WorkflowStatus = "complete" | "current" | "upcoming";

const SAMPLE_RESUME = `样例候选人（完全虚构）｜产品方向

2024.03 - 2025.02｜虚构组织 A｜产品专员
面向内容运营人员参与智能检索工具改版，负责需求梳理、PRD、低保真原型和验收用例。
基于 120 条合成查询建立回归测试集，按意图识别、召回和答案组织三类归因，支持两轮灰度验证。

2023.05 - 2024.01｜虚构组织 B｜数据产品助理
参与设备巡检流程设计，梳理填报、复核、整改、验收和归档五个环节。
整理巡检员、复核员和管理员三类角色权限，输出指标口径表和 48 条合成验收用例。`;

const SAMPLE_JD = `AI 产品经理（虚构岗位）
负责大模型应用场景拆解、评测闭环和跨团队交付。
要求具备测试集建设、Badcase 归因、用户需求分析和产品文档能力。
有 Agent 工作流、RAG 或内容工具经验优先。`;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createInputMeta(type: ResumeStudioInputMeta["input_type"] = "text"): ResumeStudioInputMeta {
  return {
    input_type: type,
    original_file_name: "",
    extracted_text: "",
    edited_text: "",
    parse_source: "manual_text",
    confirmed: false
  };
}

function workflowStatusLabel(status: WorkflowStatus) {
  if (status === "complete") return "已完成";
  if (status === "current") return "当前步骤";
  return "待开始";
}

function strengthLabel(value: string) {
  if (value === "strong") return "强匹配";
  if (value === "transferable") return "可迁移匹配";
  if (value === "supporting") return "辅助证据";
  return "不相关";
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    identity: "身份",
    contact: "联系信息",
    education: "教育",
    certification: "证书",
    employer: "组织",
    role: "岗位",
    date: "日期",
    experience: "经历",
    project: "项目",
    skill: "技能",
    metric: "指标",
    publication: "论文",
    link: "链接",
    other: "其他"
  };
  return labels[value] || value;
}

function currentStepFromState(
  ledger: FactLedger | null,
  plan: ResumePlan | null,
  rewrites: RewrittenExperience[],
  finalResume: FinalResume | null
): ResumeStudioStep {
  if (finalResume) return "finalize";
  if (rewrites.length) return "rewrite";
  if (plan) return "plan";
  if (ledger) return "facts";
  return "materials";
}

async function postJson(payload: unknown) {
  const response = await fetch("/api/resume-studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as ApiResponse;
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后再试。");
  return data;
}

export default function ResumeStudioPage() {
  const router = useRouter();
  const resumeExportRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [resumeInput, setResumeInput] = useState<ResumeStudioInputMeta>(createInputMeta("text"));
  const [jdInput, setJdInput] = useState<ResumeStudioInputMeta>(createInputMeta("text"));
  const [factLedger, setFactLedger] = useState<FactLedger | null>(null);
  const [resumePlan, setResumePlan] = useState<ResumePlan | null>(null);
  const [rewrites, setRewrites] = useState<RewrittenExperience[]>([]);
  const [claimsValidation, setClaimsValidation] = useState<ClaimsValidation | null>(null);
  const [finalResume, setFinalResume] = useState<FinalResume | null>(null);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("先上传或粘贴简历与岗位 JD，再从事实台账开始。 ");
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<"" | "pdf" | "docx">("");
  const [showAllFacts, setShowAllFacts] = useState(false);

  const confirmedFacts = factLedger?.items.filter((item) => item.verification_status === "confirmed").length || 0;
  const acceptedBullets = rewrites.flatMap((item) => item.bullets).filter((item) => item.decision === "accepted").length;
  const visibleFactItems = showAllFacts ? factLedger?.items || [] : factLedger?.items.slice(0, 6) || [];
  const currentStep = currentStepFromState(factLedger, resumePlan, rewrites, finalResume);

  useEffect(() => {
    const stored = readResumeStudioSession();
    if (stored) {
      const restoredLedger = stored.fact_ledger ? {
        ...stored.fact_ledger,
        items: stored.fact_ledger.items.map((item) => ({ ...item, verification_status: "confirmed" as const }))
      } : null;
      setSessionId(stored.session_id);
      setResumeText(stored.resume_text);
      setJdText(stored.jd_text);
      setResumeInput(stored.resume_input);
      setJdInput(stored.jd_input);
      setFactLedger(restoredLedger);
      setResumePlan(stored.resume_plan);
      setRewrites(stored.rewrites || []);
      setClaimsValidation(stored.claims_validation);
      setFinalResume(stored.final_resume);
      setFinalConfirmed(stored.final_confirmed || false);
      setStatusMessage("已恢复上次保存在当前浏览器的简历工作台进度。");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!sessionId && !resumeText.trim() && !jdText.trim()) return;

    const now = new Date().toISOString();
    const nextSessionId = sessionId || createId("resume-studio");
    if (!sessionId) setSessionId(nextSessionId);
    const existing = readResumeStudioSession();
    const session: ResumeStudioSession = {
      session_id: nextSessionId,
      created_at: existing?.created_at || now,
      updated_at: now,
      methodology_version: RESUME_METHODOLOGY_VERSION,
      current_step: currentStep,
      resume_text: resumeText,
      jd_text: jdText,
      resume_input: resumeInput,
      jd_input: jdInput,
      fact_ledger: factLedger,
      resume_plan: resumePlan,
      rewrites,
      claims_validation: claimsValidation,
      final_resume: finalResume,
      final_confirmed: finalConfirmed
    };
    writeResumeStudioSession(session);
  }, [
    hydrated,
    sessionId,
    currentStep,
    resumeText,
    jdText,
    resumeInput,
    jdInput,
    factLedger,
    resumePlan,
    rewrites,
    claimsValidation,
    finalResume,
    finalConfirmed
  ]);

  const workflowSteps = useMemo(() => {
    const completed = {
      materials: !!factLedger,
      facts: !!resumePlan,
      plan: rewrites.length > 0,
      rewrite: !!finalResume,
      finalize: !!finalResume && finalConfirmed
    };
    const order: ResumeStudioStep[] = ["materials", "facts", "plan", "rewrite", "finalize"];
    const statusFor = (step: ResumeStudioStep): WorkflowStatus => {
      if (completed[step as keyof typeof completed]) return "complete";
      return currentStep === step ? "current" : order.indexOf(step) < order.indexOf(currentStep) ? "complete" : "upcoming";
    };

    return [
      { label: "材料上传与解析", description: "简历与 JD", status: statusFor("materials") },
      { label: "事实台账", description: factLedger ? `${confirmedFacts} 条证据` : "自动生成证据", status: statusFor("facts") },
      { label: "简历撰写规划", description: resumePlan?.target_role || "经历选择与排序", status: statusFor("plan") },
      { label: "改写策略确认", description: claimsValidation?.valid ? "事实校验通过" : `${acceptedBullets} 条已接受`, status: statusFor("rewrite") },
      { label: "生成并下载", description: finalConfirmed ? "PDF / DOCX" : "核对后下载", status: statusFor("finalize") }
    ];
  }, [acceptedBullets, claimsValidation, confirmedFacts, currentStep, factLedger, finalConfirmed, finalResume, resumePlan, rewrites.length]);

  const currentInstruction = useMemo(() => {
    if (currentStep === "facts") return "事实台账已根据确认材料生成，可直接进入简历撰写规划。";
    if (currentStep === "plan") return "确认经历的选择和优先级，再生成分段改写策略。";
    if (currentStep === "rewrite") return "逐条接受或暂不采用，确认后系统会自动完成事实校验。";
    if (currentStep === "finalize") return "核对最终简历，确认后可下载 PDF 或 DOCX。";
    return "上传简历与岗位 JD，校正文本后只需确认一次材料。";
  }, [currentStep]);

  function invalidateFromMaterials() {
    setShowAllFacts(false);
    setFactLedger(null);
    setResumePlan(null);
    setRewrites([]);
    setClaimsValidation(null);
    setFinalResume(null);
    setFinalConfirmed(false);
  }

  function invalidateFromPlan() {
    setRewrites([]);
    setClaimsValidation(null);
    setFinalResume(null);
    setFinalConfirmed(false);
  }

  function invalidateFromRewrite() {
    setClaimsValidation(null);
    setFinalResume(null);
    setFinalConfirmed(false);
  }

  async function extractInput(kind: "resume" | "jd_image", file: File) {
    const formData = new FormData();
    formData.append("kind", kind);
    formData.append("file", file);
    const response = await fetch("/api/resume-studio/extract", { method: "POST", body: formData });
    const payload = (await response.json()) as ExtractResponse;
    if (!response.ok) throw new Error(payload.error || "材料提取失败。");
    return payload;
  }

  async function handleResumeUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > LIMITS.UPLOAD_FILE_MAX_BYTES) {
      setError("简历文件不能超过 4MB。");
      event.target.value = "";
      return;
    }

    setBusyAction("extract_resume");
    setError("");
    try {
      const payload = await extractInput("resume", file);
      invalidateFromMaterials();
      setResumeText(payload.extracted_text);
      setResumeInput({
        input_type: "file",
        original_file_name: payload.original_file_name,
        extracted_text: payload.extracted_text,
        edited_text: payload.extracted_text,
        parse_source: payload.parse_source,
        confirmed: false
      });
      setStatusMessage("简历文本已提取，请先检查原文，再生成事实台账。");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "简历提取失败。");
    } finally {
      setBusyAction("");
      event.target.value = "";
    }
  }

  async function handleJdUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > LIMITS.UPLOAD_FILE_MAX_BYTES) {
      setError("JD 图片不能超过 4MB。");
      event.target.value = "";
      return;
    }

    setBusyAction("extract_jd");
    setError("");
    try {
      const payload = await extractInput("jd_image", file);
      invalidateFromMaterials();
      setJdText(payload.extracted_text);
      setJdInput({
        input_type: "image",
        original_file_name: payload.original_file_name,
        extracted_text: payload.extracted_text,
        edited_text: payload.extracted_text,
        parse_source: payload.parse_source,
        confirmed: false
      });
      setStatusMessage("JD 图片文字已提取，请检查识别结果后继续。");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "JD 图片识别失败。");
    } finally {
      setBusyAction("");
      event.target.value = "";
    }
  }

  function handleTryExample() {
    clearResumeStudioSession();
    setSessionId(createId("resume-studio"));
    setResumeText(SAMPLE_RESUME);
    setJdText(SAMPLE_JD);
    setResumeInput({ ...createInputMeta("text"), extracted_text: SAMPLE_RESUME, edited_text: SAMPLE_RESUME, parse_source: "synthetic_example", confirmed: false });
    setJdInput({ ...createInputMeta("text"), extracted_text: SAMPLE_JD, edited_text: SAMPLE_JD, parse_source: "synthetic_example", confirmed: false });
    invalidateFromMaterials();
    setStatusMessage("完全虚构的脱敏样例已填入，可以直接生成事实台账。");
    setError("");
  }

  function handleNewRound() {
    clearResumeStudioSession();
    setSessionId("");
    setResumeText("");
    setJdText("");
    setResumeInput(createInputMeta("text"));
    setJdInput(createInputMeta("text"));
    invalidateFromMaterials();
    setStatusMessage("已新建简历工作台，请先准备简历和岗位 JD。");
    setError("");
  }

  async function handleBuildFactLedger() {
    if (!resumeText.trim() || !jdText.trim()) {
      setError("请先补齐简历和岗位 JD。");
      return;
    }
    if (resumeText.length > LIMITS.CUSTOM_TEXT_MAX_CHARS || jdText.length > LIMITS.CUSTOM_TEXT_MAX_CHARS) {
      setError(`简历和 JD 都请控制在 ${LIMITS.CUSTOM_TEXT_MAX_CHARS} 字以内。`);
      return;
    }

    setBusyAction("facts");
    setError("");
    setStatusMessage("正在逐条定位原始证据、日期、指标和固定事实。");
    try {
      const result = await postJson({ action: "build_fact_ledger", resume_text: resumeText });
      if (!result.fact_ledger) throw new Error("事实台账返回为空。");
      const confirmedLedger: FactLedger = {
        ...result.fact_ledger,
        items: result.fact_ledger.items.map((item) => ({ ...item, verification_status: "confirmed" }))
      };
      setFactLedger(confirmedLedger);
      setShowAllFacts(false);
      setResumeInput((current) => ({ ...current, edited_text: resumeText, extracted_text: current.extracted_text || resumeText, confirmed: true }));
      setJdInput((current) => ({ ...current, edited_text: jdText, extracted_text: current.extracted_text || jdText, confirmed: true }));
      setResumePlan(null);
      setRewrites([]);
      setClaimsValidation(null);
      setFinalResume(null);
      setStatusMessage("材料已确认，事实台账已自动生成，可以继续规划简历。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "事实台账生成失败。");
      setStatusMessage("事实台账尚未生成，请检查材料后重试。");
    } finally {
      setBusyAction("");
    }
  }

  async function handleBuildPlan() {
    if (!factLedger || !confirmedFacts) {
      setError("请先确认材料并生成事实台账。");
      return;
    }
    setBusyAction("plan");
    setError("");
    setStatusMessage("正在把 JD 要求映射到已确认事实，并排序经历。");
    try {
      const result = await postJson({ action: "build_resume_plan", fact_ledger: factLedger, jd_text: jdText });
      if (!result.resume_plan) throw new Error("岗位规划返回为空。");
      invalidateFromPlan();
      setResumePlan(result.resume_plan);
      setStatusMessage("岗位匹配规划已生成。请确认经历选择，再分段改写。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "岗位规划生成失败。");
    } finally {
      setBusyAction("");
    }
  }

  function togglePlanExperience(experienceId: string) {
    if (!resumePlan) return;
    setResumePlan({
      ...resumePlan,
      experiences: resumePlan.experiences.map((item) => item.experience_id === experienceId ? { ...item, selected: !item.selected } : item)
    });
    invalidateFromPlan();
  }

  async function handleRewriteExperiences() {
    if (!factLedger || !resumePlan) return;
    const selected = resumePlan.experiences.filter((item) => item.selected && item.match_strength !== "irrelevant");
    if (!selected.length) {
      setError("请至少选择一段匹配经历。");
      return;
    }

    setBusyAction("rewrite");
    setError("");
    setStatusMessage(`正在分段改写 ${selected.length} 段经历，并校验每条证据编号。`);
    try {
      const results = await Promise.all(selected.map((item) => postJson({
        action: "rewrite_experience",
        fact_ledger: factLedger,
        resume_plan: resumePlan,
        experience_id: item.experience_id
      })));
      const nextRewrites = results.map((result) => result.rewrite).filter((item): item is RewrittenExperience => !!item);
      setRewrites(nextRewrites);
      setClaimsValidation(null);
      setFinalResume(null);
      setFinalConfirmed(false);
      setStatusMessage("改写已完成。请对照原文，逐条接受、暂不采用或撤销选择。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "经历改写失败。");
    } finally {
      setBusyAction("");
    }
  }

  function setBulletDecision(experienceId: string, bulletId: string, decision: "pending" | "accepted" | "rejected") {
    setRewrites((current) => current.map((rewrite) => rewrite.experience_id === experienceId
      ? { ...rewrite, bullets: rewrite.bullets.map((bullet) => bullet.bullet_id === bulletId ? { ...bullet, decision } : bullet) }
      : rewrite));
    invalidateFromRewrite();
  }

  async function handleConfirmRewriteStrategy() {
    if (!factLedger || !resumePlan || !rewrites.length) return;
    if (!acceptedBullets) {
      setError("请至少接受一条改写后再生成简历。");
      return;
    }
    setBusyAction("finalize");
    setError("");
    setStatusMessage("正在校验改写策略，并组合通过校验的简历内容。");
    try {
      const validationResult = await postJson({ action: "validate_resume_claims", fact_ledger: factLedger, rewrites });
      const validation = validationResult.claims_validation;
      if (!validation) throw new Error("校验结果返回为空。");
      setClaimsValidation(validation);

      if (!validation.valid) {
        setFinalResume(null);
        setFinalConfirmed(false);
        setStatusMessage("发现阻断问题，请在当前步骤调整改写或返回事实台账处理。");
        return;
      }

      const finalResult = await postJson({
        action: "finalize_resume",
        fact_ledger: factLedger,
        resume_plan: resumePlan,
        rewrites,
        claims_validation: validation
      });
      if (!finalResult.final_resume) throw new Error("完整简历返回为空。");
      setFinalResume(finalResult.final_resume);
      setFinalConfirmed(false);
      setStatusMessage("改写策略和事实校验均已通过。请核对简历后下载 PDF 或 DOCX。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "简历生成失败。");
    } finally {
      setBusyAction("");
    }
  }

  async function copyFinalResume() {
    if (!finalResume) return;
    await navigator.clipboard.writeText(finalResume.full_text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function downloadFinalResume(format: "pdf" | "docx") {
    if (!finalResume || !finalConfirmed) return;
    if (format === "pdf" && !resumeExportRef.current) return;
    setExporting(format);
    setError("");
    try {
      if (format === "docx") await downloadResumeDocx(finalResume);
      else await downloadResumePdf(finalResume, resumeExportRef.current as HTMLDivElement);
      setStatusMessage(`简历 ${format.toUpperCase()} 已生成并开始下载。`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "简历下载失败，请稍后重试。");
    } finally {
      setExporting("");
    }
  }

  function startCustomInterview() {
    if (!finalResume || !finalConfirmed) return;
    writeResumeStudioInterviewHandoff({
      source: "resume_studio",
      created_at: new Date().toISOString(),
      methodology_version: RESUME_METHODOLOGY_VERSION,
      resume_text: finalResume.full_text,
      jd_text: jdText
    });
    router.push("/custom-interview?source=resume-studio");
  }

  return (
    <PracticeLayout
      mode="resume"
      onTryExample={handleTryExample}
      onNewRound={handleNewRound}
      onContinueLatest={hydrated && sessionId ? () => window.location.reload() : undefined}
      shortcutsDisabled={!!busyAction}
    >
      <div className="resume-studio-shell">
        <header className="page-hero page-hero-resume resume-studio-hero">
          <div className="page-hero-main resume-studio-hero-copy">
            <p className="resume-studio-eyebrow">简历工作台</p>
            <h1 className="page-title">根据岗位 JD 重构你的简历，<br />把经历做一次优先级排序</h1>
            <p className="mock-subtitle">从原始证据、岗位规划到逐条改写，每一步都留下证据编号；<br />没有证据的内容只会进入缺口清单。</p>
          </div>
          <aside className="resume-studio-method-card">
            <div>
              <p className="resume-studio-method-label">方法论版本</p>
              <strong>{RESUME_METHODOLOGY_VERSION}</strong>
              <p>事实校验通过后，可下载 PDF 与 DOCX 简历。</p>
              <small>状态：方法论与导出能力已载入</small>
            </div>
            <Image src="/resume-studio/methodology-folder.png" alt="简历方法论文件夹插画" width={116} height={116} priority unoptimized />
          </aside>
        </header>

        <BetaPrivacyNotice mode="custom" />
        <WorkflowSteps steps={workflowSteps} className="resume-studio-workflow" />

        <section className="resume-studio-status">
          <span className="resume-studio-status-label">当前步骤</span>
          <p>{currentInstruction}</p>
          <span className="resume-studio-live-status" aria-live="polite">{statusMessage}</span>
        </section>

        <section className={`custom-card resume-studio-section is-${currentStep === "materials" ? "current" : "complete"}`}>
          <div className="custom-card-head">
            <div>
              <p className="section-tag">第 1 步</p>
              <h2>材料上传与解析</h2>
            </div>
            <button className="primary-button" onClick={() => void handleBuildFactLedger()} disabled={!!busyAction || !resumeText.trim() || !jdText.trim()}>
              <span>{busyAction === "facts" ? "确认并生成中…" : factLedger ? "重新确认材料" : "确认材料并生成事实台账"}</span>
              <ArrowRight size={17} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <div className="custom-input-grid resume-studio-input-grid">
            <div className="resume-studio-input-panel">
              <div className="resume-studio-panel-head">
                <div className="resume-studio-panel-title">
                  <span className="resume-studio-upload-icon" aria-hidden="true">
                    <FileText size={21} weight="regular" />
                  </span>
                  <div>
                    <p className="custom-field-label">原始简历</p>
                    <p className="custom-helper">支持 PDF、DOCX、TXT，提取后可人工校正。</p>
                  </div>
                </div>
                <label className="custom-upload-button">
                  {busyAction === "extract_resume" ? "提取中…" : "选择文件"}
                  <input id="resume-studio-resume-file" type="file" accept=".pdf,.docx,.txt" hidden onChange={handleResumeUpload} disabled={!!busyAction} />
                </label>
              </div>
              {resumeInput.original_file_name ? <p className="resume-studio-file-name">{resumeInput.original_file_name}</p> : null}
              <div className={`resume-studio-upload-editor ${resumeText.trim() ? "has-content" : "is-empty"}`}>
                {!resumeText.trim() ? (
                  <div className="resume-studio-empty-upload" aria-hidden="true">
                    <UploadSimple size={29} weight="regular" />
                    <strong>选择文件或直接粘贴简历</strong>
                    <span>文件大小不超过 4MB</span>
                  </div>
                ) : null}
                <textarea
                  className="custom-textarea"
                  value={resumeText}
                  onChange={(event) => {
                    invalidateFromMaterials();
                    setResumeText(event.target.value);
                    setResumeInput((current) => ({ ...current, edited_text: event.target.value, confirmed: false }));
                  }}
                  maxLength={LIMITS.CUSTOM_TEXT_MAX_CHARS}
                  rows={12}
                  aria-label="原始简历文本"
                  placeholder="粘贴原始简历，保留日期、指标和项目上下文。"
                />
              </div>
            </div>
            <div className="resume-studio-input-panel">
              <div className="resume-studio-panel-head">
                <div className="resume-studio-panel-title">
                  <span className="resume-studio-upload-icon" aria-hidden="true">
                    <ImageSquare size={21} weight="regular" />
                  </span>
                  <div>
                    <p className="custom-field-label">目标岗位 JD</p>
                    <p className="custom-helper">可粘贴文本或上传 PNG、JPG、WEBP 截图。</p>
                  </div>
                </div>
                <label className="custom-upload-button">
                  {busyAction === "extract_jd" ? "识别中…" : "上传截图"}
                  <input id="resume-studio-jd-file" type="file" accept=".png,.jpg,.jpeg,.webp" hidden onChange={handleJdUpload} disabled={!!busyAction} />
                </label>
              </div>
              {jdInput.original_file_name ? <p className="resume-studio-file-name">{jdInput.original_file_name}</p> : null}
              <div className={`resume-studio-upload-editor ${jdText.trim() ? "has-content" : "is-empty"}`}>
                {!jdText.trim() ? (
                  <div className="resume-studio-empty-upload" aria-hidden="true">
                    <UploadSimple size={29} weight="regular" />
                    <strong>上传截图或直接粘贴 JD</strong>
                    <span>图片大小不超过 4MB</span>
                  </div>
                ) : null}
                <textarea
                  className="custom-textarea"
                  value={jdText}
                  onChange={(event) => {
                    invalidateFromMaterials();
                    setJdText(event.target.value);
                    setJdInput((current) => ({ ...current, edited_text: event.target.value, confirmed: false }));
                  }}
                  maxLength={LIMITS.CUSTOM_TEXT_MAX_CHARS}
                  rows={12}
                  aria-label="目标岗位 JD 文本"
                  placeholder="粘贴岗位职责、任职要求与加分项。"
                />
              </div>
            </div>
          </div>
        </section>

        {factLedger ? (
          <section className={`custom-card resume-studio-section is-${currentStep === "facts" ? "current" : "complete"}`}>
            <div className="custom-card-head">
              <div>
                <p className="section-tag">第 2 步</p>
                <h2>事实台账</h2>
                <p className="custom-helper">台账根据已确认材料自动生成，用于保留证据编号和固定事实，不再重复确认。</p>
              </div>
              <button className="primary-button" onClick={() => void handleBuildPlan()} disabled={!!busyAction || confirmedFacts === 0}>
                {busyAction === "plan" ? "规划中…" : resumePlan ? "重新生成撰写规划" : "生成简历撰写规划"}
              </button>
            </div>
            <div className="resume-studio-summary-row">
              <span>事实 {factLedger.items.length}</span>
              <span className="is-confirmed">材料已确认</span>
              <span>证据缺口 {factLedger.evidence_gaps.length}</span>
            </div>
            <div className="resume-studio-ledger-list is-compact">
              {visibleFactItems.map((item) => (
                <details key={item.evidence_id} className="resume-studio-fact-row">
                  <summary>
                    <span className="custom-tag">{item.evidence_id}</span>
                    <span className="resume-studio-mini-pill">{categoryLabel(item.category)}</span>
                    <strong>{item.fact}</strong>
                    {item.fixed ? <span className="resume-studio-mini-pill is-fixed">固定</span> : null}
                  </summary>
                  <div className="resume-studio-fact-detail">
                    <blockquote>{item.source_excerpt}</blockquote>
                    <div className="resume-studio-fact-meta">
                      <span>{item.experience_title}</span>
                      {item.date?.raw ? <span>日期：{item.date.raw}</span> : null}
                      {item.metrics.map((metric) => <span key={`${item.evidence_id}-${metric.raw}`}>指标：{metric.raw}</span>)}
                    </div>
                    {item.risk_note ? <p className="resume-studio-warning">{item.risk_note}</p> : null}
                  </div>
                </details>
              ))}
            </div>
            {factLedger.items.length > 6 ? (
              <button className="resume-studio-ledger-toggle secondary-button" onClick={() => setShowAllFacts((current) => !current)}>
                {showAllFacts ? "收起事实台账" : `查看全部 ${factLedger.items.length} 条事实`}
              </button>
            ) : null}
            {factLedger.evidence_gaps.length ? (
              <div className="resume-studio-gap-box">
                <p className="custom-field-label">事实阶段证据缺口</p>
                <ul>{factLedger.evidence_gaps.map((gap) => <li key={gap.gap_id}>{gap.description}</li>)}</ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {resumePlan ? (
          <section className={`custom-card resume-studio-section is-${currentStep === "plan" ? "current" : "complete"}`}>
            <div className="custom-card-head">
              <div>
                <p className="section-tag">第 3 步</p>
                <h2>简历撰写规划</h2>
                <p className="custom-helper">目标：{resumePlan.target_role} · {resumePlan.narrative}</p>
              </div>
              <button className="primary-button" onClick={() => void handleRewriteExperiences()} disabled={!!busyAction || !resumePlan.experiences.some((item) => item.selected)}>
                {busyAction === "rewrite" ? "生成策略中…" : rewrites.length ? "重新生成改写策略" : "生成分段改写策略"}
              </button>
            </div>
            <div className="custom-tag-row">
              {resumePlan.target_keywords.map((keyword) => <span key={keyword} className="custom-tag">{keyword}</span>)}
            </div>
            <div className="resume-studio-plan-grid">
              {resumePlan.experiences.map((experience) => (
                <button
                  type="button"
                  key={experience.experience_id}
                  className={`resume-studio-plan-card ${experience.selected ? "is-selected" : ""}`}
                  onClick={() => togglePlanExperience(experience.experience_id)}
                  aria-pressed={experience.selected}
                >
                  <span className="resume-studio-plan-order">{experience.order}</span>
                  <span className="resume-studio-plan-copy">
                    <strong>{experience.title}</strong>
                    <span>{strengthLabel(experience.match_strength)} · {experience.reason}</span>
                    <small>证据：{experience.evidence_ids.join("、") || "无"}</small>
                  </span>
                  <span className="resume-studio-plan-check">{experience.selected ? "已选择" : "未选择"}</span>
                </button>
              ))}
            </div>
            <div className="resume-studio-signal-grid">
              {resumePlan.jd_signals.map((signal) => (
                <div key={signal.signal} className="custom-summary-block">
                  <p className="custom-summary-label">{signal.importance === "must" ? "必须" : signal.importance === "bonus" ? "加分" : "重要"}</p>
                  <strong>{signal.signal}</strong>
                  <p>证据：{signal.evidence_ids.join("、") || "暂无"}</p>
                  {signal.gap ? <p className="resume-studio-warning">{signal.gap}</p> : null}
                </div>
              ))}
            </div>
            {resumePlan.evidence_gaps.length ? (
              <div className="resume-studio-gap-box">
                <p className="custom-field-label">岗位要求证据缺口</p>
                <ul>{resumePlan.evidence_gaps.map((gap) => <li key={gap.gap_id}>{gap.description}</li>)}</ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {rewrites.length ? (
          <section className={`custom-card resume-studio-section is-${currentStep === "rewrite" ? "current" : "complete"}`}>
            <div className="custom-card-head">
              <div>
                <p className="section-tag">第 4 步</p>
                <h2>分段改写策略确认</h2>
                <p className="custom-helper">对照原文逐条确认。提交时会自动校验事实、指标和证据编号。</p>
              </div>
              <button className="primary-button" onClick={() => void handleConfirmRewriteStrategy()} disabled={!!busyAction || acceptedBullets === 0}>
                {busyAction === "finalize" ? "校验并生成中…" : "确认策略并生成简历"}
              </button>
            </div>
            <div className="resume-studio-rewrite-list">
              {rewrites.map((rewrite) => (
                <article key={rewrite.experience_id} className="resume-studio-rewrite-card">
                  <div className="resume-studio-rewrite-title">
                    <div>
                      <span className="custom-tag">{rewrite.experience_id}</span>
                      <h3>{rewrite.title}</h3>
                    </div>
                    <span>{rewrite.bullets.filter((item) => item.decision === "accepted").length}/{rewrite.bullets.length} 已接受</span>
                  </div>
                  <div className="resume-studio-compare-grid">
                    <div className="resume-studio-original-panel">
                      <p className="custom-summary-label">原始证据</p>
                      <p>{rewrite.original_text}</p>
                    </div>
                    <div className="resume-studio-rewritten-panel">
                      <p className="custom-summary-label">场景摘要</p>
                      <p>{rewrite.scene_summary || "当前证据不足以生成场景摘要。"}</p>
                      <small>证据：{rewrite.scene_summary_evidence_ids.join("、") || "证据缺口"}</small>
                    </div>
                  </div>
                  <div className="resume-studio-bullet-list">
                    {rewrite.bullets.map((bullet) => (
                      <div key={bullet.bullet_id} className={`resume-studio-bullet is-${bullet.decision}`}>
                        <div>
                          <p><strong>{bullet.label}：</strong>{bullet.text}</p>
                          <small>证据：{bullet.evidence_ids.join("、") || "无"}</small>
                        </div>
                        <div className="custom-answer-actions">
                          {bullet.decision === "pending" ? (
                            <>
                              <button className="secondary-button" onClick={() => setBulletDecision(rewrite.experience_id, bullet.bullet_id, "accepted")}>接受</button>
                              <button className="secondary-button" onClick={() => setBulletDecision(rewrite.experience_id, bullet.bullet_id, "rejected")}>暂不采用</button>
                            </>
                          ) : (
                            <button className="secondary-button" onClick={() => setBulletDecision(rewrite.experience_id, bullet.bullet_id, "pending")}>撤销</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {rewrite.evidence_gaps.length ? (
                    <div className="resume-studio-gap-box">
                      <p className="custom-field-label">这段经历的证据缺口</p>
                      <ul>{rewrite.evidence_gaps.map((gap) => <li key={gap.gap_id}>{gap.description}</li>)}</ul>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {claimsValidation ? (
              <div className={`resume-studio-validation-banner is-${claimsValidation.valid ? "pass" : "fail"}`}>
                <div>
                  <strong>{claimsValidation.valid ? "事实校验通过" : `发现 ${claimsValidation.issues.length} 个阻断问题`}</strong>
                  <span>{claimsValidation.valid ? `已检查 ${claimsValidation.checked_claims} 条正文声明。` : "请处理后重新确认改写策略。"}</span>
                </div>
                {claimsValidation.issues.length ? (
                  <div className="resume-studio-issue-list">
                    {claimsValidation.issues.map((issue) => (
                      <article key={issue.issue_id}>
                        <span>{issue.code}</span>
                        <strong>{issue.message}</strong>
                        <p>{issue.claim}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {finalResume ? (
          <section className="custom-card resume-studio-section is-current">
            <div className="custom-card-head">
              <div>
                <p className="section-tag">第 5 步</p>
                <h2>生成并下载简历</h2>
                <p className="custom-helper">正文只包含已接受且通过事实校验的内容。</p>
              </div>
              <div className="custom-answer-actions resume-studio-export-actions">
                <button className="secondary-button" onClick={() => void copyFinalResume()}>
                  <CopySimple size={17} aria-hidden="true" />
                  {copied ? "已复制" : "复制全文"}
                </button>
                <button className="secondary-button" onClick={() => void downloadFinalResume("pdf")} disabled={!finalConfirmed || !!exporting}>
                  <FilePdf size={18} aria-hidden="true" />
                  {exporting === "pdf" ? "生成 PDF 中…" : "下载 PDF"}
                </button>
                <button className="primary-button" onClick={() => void downloadFinalResume("docx")} disabled={!finalConfirmed || !!exporting}>
                  <FileDoc size={18} aria-hidden="true" />
                  {exporting === "docx" ? "生成 DOCX 中…" : "下载 DOCX"}
                </button>
              </div>
            </div>
            <ResumeDocument ref={resumeExportRef} resume={finalResume} />
            {finalResume.validation.evidence_gaps.length ? (
              <div className="resume-studio-gap-box">
                <p className="custom-field-label">未写入正文的证据缺口</p>
                <ul>{finalResume.validation.evidence_gaps.map((gap) => <li key={gap.gap_id}>{gap.description}</li>)}</ul>
              </div>
            ) : null}
            <label className="resume-studio-confirm-row">
              <input type="checkbox" checked={finalConfirmed} onChange={(event) => setFinalConfirmed(event.target.checked)} />
              <span>我已核对完整简历，确认日期、指标、组织、岗位和经历表述可以作为面试材料。</span>
            </label>
            <div className="resume-studio-interview-cta">
              <div>
                <p className="section-tag">下一步</p>
                <h3>基于此简历开始模拟面试</h3>
                <p>将已确认的完整简历和当前 JD 带入现有定制面试 briefing，不需要重复粘贴。</p>
              </div>
              <button className="primary-button" onClick={startCustomInterview} disabled={!finalConfirmed}>进入定制模拟面试</button>
            </div>
          </section>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </PracticeLayout>
  );
}
