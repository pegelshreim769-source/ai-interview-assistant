import { RESUME_METHODOLOGY_VERSION } from "../methodology";
import type { FactLedger, FactLedgerItem, RewrittenExperience } from "../types";

function fact(overrides: Partial<FactLedgerItem> & Pick<FactLedgerItem, "evidence_id" | "fact" | "source_excerpt" | "experience_id" | "experience_title">): FactLedgerItem {
  return {
    source: "resume",
    category: "experience",
    change_policy: "selectable",
    fixed: false,
    verification_status: "confirmed",
    date: null,
    metrics: [],
    risk_note: "",
    ...overrides
  };
}

export const SYNTHETIC_LEDGER: FactLedger = {
  methodology_version: RESUME_METHODOLOGY_VERSION,
  generated_at: "2026-01-01T00:00:00.000Z",
  source_resume_text: "完全虚构的测试简历，不对应真实个人或组织。",
  items: [
    fact({
      evidence_id: "E001",
      fact: "基于 120 条合成查询构建回归测试集",
      source_excerpt: "基于 120 条合成查询构建回归测试集，按意图识别、召回和答案组织归因。",
      experience_id: "exp-ai",
      experience_title: "虚构组织 A｜AI 产品经历",
      category: "metric",
      fixed: true,
      change_policy: "fixed",
      metrics: [{ raw: "120 条", context: "合成查询回归测试集" }]
    }),
    fact({
      evidence_id: "E002",
      fact: "按意图识别、召回和答案组织开展 Badcase 归因",
      source_excerpt: "按意图识别、召回和答案组织开展 Badcase 归因，并用于 Prompt 回归。",
      experience_id: "exp-ai",
      experience_title: "虚构组织 A｜AI 产品经历"
    }),
    fact({
      evidence_id: "E003",
      fact: "梳理三类角色权限和五个巡检环节",
      source_excerpt: "梳理巡检员、复核员和管理员三类角色权限，覆盖填报、复核、整改、验收和归档。",
      experience_id: "exp-soe",
      experience_title: "虚构组织 B｜数字化经历"
    }),
    fact({
      evidence_id: "E004",
      fact: "输出指标口径表和 48 条合成验收用例",
      source_excerpt: "输出指标口径表和 48 条合成验收用例，支持一次虚构试点验收。",
      experience_id: "exp-soe",
      experience_title: "虚构组织 B｜数字化经历",
      category: "metric",
      fixed: true,
      change_policy: "fixed",
      metrics: [{ raw: "48 条", context: "合成验收用例" }]
    }),
    fact({
      evidence_id: "E005",
      fact: "经历日期为 2024.03 - 2025.02",
      source_excerpt: "2024.03 - 2025.02｜虚构组织 A｜产品专员",
      experience_id: "exp-ai",
      experience_title: "虚构组织 A｜AI 产品经历",
      category: "date",
      fixed: true,
      change_policy: "fixed",
      date: { raw: "2024.03 - 2025.02", start: "2024.03", end: "2025.02" }
    })
  ],
  evidence_gaps: []
};

export function acceptedRewrite(text: string, evidenceIds: string[]): RewrittenExperience {
  return {
    experience_id: "exp-ai",
    title: "虚构组织 A｜AI 产品经历",
    original_text: "完全虚构的原始经历片段。",
    scene_summary: "",
    scene_summary_evidence_ids: [],
    bullets: [
      {
        bullet_id: "exp-ai-b01",
        label: "评测体系",
        text,
        evidence_ids: evidenceIds,
        decision: "accepted"
      }
    ],
    evidence_gaps: []
  };
}

export const SYNTHETIC_AI_JD = "负责大模型应用、Prompt 回归、测试集建设与 Badcase 归因。";
export const SYNTHETIC_SOE_JD = "负责央国企数字化项目，强调多角色权限、流程留痕、指标口径与验收。";
