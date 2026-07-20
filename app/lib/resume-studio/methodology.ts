import type {
  EvidenceGap,
  FactCategory,
  FactChangePolicy,
  FactLedger,
  FactLedgerItem,
  MatchStrength,
  ResumePlanExperience
} from "./types";

export const RESUME_METHODOLOGY_VERSION = "tailor-chinese-resumes-ts@0.1.0";

export const RESUME_METHODOLOGY = {
  version: RESUME_METHODOLOGY_VERSION,
  source: "tailor-chinese-resumes",
  principles: [
    "只使用简历、用户确认信息和目标 JD 中可核验的内容",
    "不新增雇主、项目、职责、工具、指标、日期、证书、论文、奖项或链接",
    "数值、日期、组织、岗位、教育和证书作为固定事实处理",
    "每条改写必须关联证据编号；无证据内容只能进入证据缺口",
    "跨行业定制只改变机制表达和信息顺序，不改变经历实际所属领域"
  ],
  bulletPattern: "证据标签：动作 + 方法/机制 + 结果/价值",
  scenePattern: "负责/参与 [具体场景]，面向 [用户]，围绕 [流程或任务]，解决 [具体问题]。"
} as const;

export const FIXED_FACT_CATEGORIES: FactCategory[] = [
  "identity",
  "contact",
  "education",
  "certification",
  "employer",
  "role",
  "date",
  "metric",
  "publication",
  "link"
];

export const ROLE_STRATEGIES = [
  {
    id: "internet-ai",
    label: "互联网 AI / Agent",
    jdKeywords: ["ai", "大模型", "llm", "agent", "智能", "模型评测", "prompt", "rag", "对话"],
    evidenceKeywords: ["评测", "测试集", "badcase", "回归", "prompt", "rag", "状态", "工具调用", "人机", "demo"],
    targetTitles: ["AI产品经理", "大模型应用产品经理", "模型评测产品", "Agent产品"]
  },
  {
    id: "government-soe",
    label: "政企 / 央国企数字化",
    jdKeywords: ["政企", "央企", "国企", "数字化", "解决方案", "数据治理", "验收", "权限", "审计"],
    evidenceKeywords: ["流程", "状态", "角色", "权限", "留痕", "口径", "规格说明", "验收", "试点"],
    targetTitles: ["政企产品经理", "数据产品经理", "解决方案产品经理"]
  },
  {
    id: "education-tech",
    label: "教育科技",
    jdKeywords: ["教育", "学习", "教师", "学生", "课程", "题库", "教学"],
    evidenceKeywords: ["教师", "学生", "学习", "作业", "课程", "内容", "讲评", "批改", "班级"],
    targetTitles: ["AI教育产品经理", "教育科技产品经理", "学习产品经理"]
  },
  {
    id: "software-hardware",
    label: "软件 / 智能硬件",
    jdKeywords: ["软件", "硬件", "设备", "交互", "语音", "终端"],
    evidenceKeywords: ["需求分析", "原型", "版本", "状态", "设备", "语音", "异常", "验收", "软硬件"],
    targetTitles: ["软件产品经理", "智能硬件产品经理", "AI交互产品经理"]
  }
] as const;

const METRIC_REGEX = /\d+(?:\.\d+)?\s*(?:%|倍|天|周|月|年|万|亿|人|次|条|场|个|家|小时|分钟)/gi;
const DATE_REGEX = /(?:19|20)\d{2}(?:[./年-](?:0?[1-9]|1[0-2]))?(?:\s*(?:-|—|–|至|~)\s*(?:(?:19|20)\d{2}(?:[./年-](?:0?[1-9]|1[0-2]))?|至今))?/g;

export function normalizeResumeText(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeComparableText(value: string) {
  return value.replace(/\s+/g, "").replace(/[，。；：、,.%;:()（）\[\]【】]/g, "").toLowerCase();
}

export function extractMetricTokens(value: string) {
  return Array.from(new Set(value.match(METRIC_REGEX) || []));
}

export function extractDateTokens(value: string) {
  return Array.from(new Set(value.match(DATE_REGEX) || []));
}

export function isFixedCategory(category: FactCategory) {
  return FIXED_FACT_CATEGORIES.includes(category);
}

export function changePolicyForCategory(category: FactCategory): FactChangePolicy {
  if (isFixedCategory(category)) return "fixed";
  if (category === "experience" || category === "project" || category === "skill") return "selectable";
  return "paraphrase";
}

export function classifyRoleStrategy(jdText: string) {
  const lower = jdText.toLowerCase();
  return [...ROLE_STRATEGIES]
    .map((strategy) => ({
      strategy,
      score: strategy.jdKeywords.reduce((sum, keyword) => sum + (lower.includes(keyword.toLowerCase()) ? 1 : 0), 0)
    }))
    .sort((left, right) => right.score - left.score)[0]?.strategy || ROLE_STRATEGIES[0];
}

export function scoreEvidenceForJd(item: FactLedgerItem, jdText: string) {
  const strategy = classifyRoleStrategy(jdText);
  const combined = `${item.fact}\n${item.source_excerpt}`.toLowerCase();
  const jdLower = jdText.toLowerCase();
  const mechanismHits = strategy.evidenceKeywords.filter((keyword) => combined.includes(keyword.toLowerCase())).length;
  const directHits = jdText
    .split(/[\s，。；、/]+/)
    .filter((token) => token.length >= 2)
    .reduce((sum, token) => sum + (combined.includes(token.toLowerCase()) ? 1 : 0), 0);
  const evidenceMatch = mechanismHits * 3 + Math.min(directHits, 5) + (jdLower.includes(item.fact.toLowerCase()) ? 2 : 0);
  const confirmedBonus = item.verification_status === "confirmed" ? (evidenceMatch > 0 ? 1 : 0) : -4;
  const metricBonus = evidenceMatch > 0 && (item.metrics.length || extractMetricTokens(item.fact).length) ? 1 : 0;
  const fixedPenalty = item.category === "contact" || item.category === "identity" ? -3 : 0;
  return evidenceMatch + confirmedBonus + metricBonus + fixedPenalty;
}

export function matchStrengthFromScore(score: number): MatchStrength {
  if (score >= 7) return "strong";
  if (score >= 4) return "transferable";
  if (score >= 1) return "supporting";
  return "irrelevant";
}

export function rankExperiencesForJd(ledger: FactLedger, jdText: string): ResumePlanExperience[] {
  const groups = new Map<string, FactLedgerItem[]>();

  ledger.items
    .filter((item) => item.verification_status === "confirmed" && item.experience_id && item.experience_id !== "general" && item.category !== "identity" && item.category !== "contact")
    .forEach((item) => {
      groups.set(item.experience_id, [...(groups.get(item.experience_id) || []), item]);
    });

  return Array.from(groups.entries())
    .map(([experienceId, items]) => {
      const score = items.reduce((sum, item) => sum + Math.max(scoreEvidenceForJd(item, jdText), 0), 0);
      return {
        experience_id: experienceId,
        title: items.find((item) => item.experience_title)?.experience_title || experienceId,
        match_strength: matchStrengthFromScore(score),
        reason: `基于 ${items.length} 条已确认事实与目标 JD 的场景、方法和交付物匹配度排序。`,
        evidence_ids: items.map((item) => item.evidence_id),
        selected: score > 0,
        order: 0,
        score
      };
    })
    .sort((left, right) => right.score - left.score)
    .map(({ score: _score, ...item }, index) => ({ ...item, order: index + 1 }));
}

function categoryForLine(line: string, index: number): FactCategory {
  if (index === 0 && line.length <= 60) return "identity";
  if (extractDateTokens(line).length) return "date";
  if (extractMetricTokens(line).length) return "metric";
  if (/证书|资格|认证/.test(line)) return "certification";
  if (/学校|大学|学院|学历|学位|专业/.test(line)) return "education";
  if (/技能|工具|熟悉|掌握/.test(line)) return "skill";
  if (/项目|产品|系统|平台|工具/.test(line)) return "project";
  return "experience";
}

export function buildFactLedgerFromText(resumeText: string): FactLedger {
  const normalized = normalizeResumeText(resumeText);
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let experienceIndex = 0;
  let experienceId = "general";
  let experienceTitle = "基础信息";

  const items = lines.map((line, index) => {
    const dates = extractDateTokens(line);
    const metrics = extractMetricTokens(line);
    if (dates.length || /(?:19|20)\d{2}.*[|｜]/.test(line)) {
      experienceIndex += 1;
      experienceId = `exp-${String(experienceIndex).padStart(2, "0")}`;
      experienceTitle = line.slice(0, 80);
    }

    const category = categoryForLine(line, index);
    const fixed = isFixedCategory(category) || dates.length > 0 || metrics.length > 0;
    return {
      evidence_id: `E${String(index + 1).padStart(3, "0")}`,
      source: "resume",
      source_excerpt: line,
      fact: line,
      category,
      change_policy: fixed ? "fixed" : changePolicyForCategory(category),
      fixed,
      verification_status: "pending",
      date: dates.length ? { raw: dates.join("；"), start: "", end: "" } : null,
      metrics: metrics.map((metric) => ({ raw: metric, context: line })),
      experience_id: experienceId,
      experience_title: experienceTitle,
      risk_note: ""
    } satisfies FactLedgerItem;
  });

  return {
    methodology_version: RESUME_METHODOLOGY_VERSION,
    generated_at: new Date().toISOString(),
    source_resume_text: normalized,
    items,
    evidence_gaps: []
  };
}

export function buildResumePlanFromLedger(ledger: FactLedger, jdText: string) {
  const strategy = classifyRoleStrategy(jdText);
  const ranked = rankExperiencesForJd(ledger, jdText);
  const confirmedItems = ledger.items.filter((item) => item.verification_status === "confirmed");
  const jdLines = normalizeResumeText(jdText).split(/\n+|[。；]/).map((line) => line.trim()).filter((line) => line.length >= 4).slice(0, 8);
  const gaps: EvidenceGap[] = [];

  const jdSignals = jdLines.map((signal, index) => {
    const evidence = confirmedItems
      .map((item) => ({ item, score: scoreEvidenceForJd(item, signal) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map(({ item }) => item.evidence_id);
    if (!evidence.length) {
      gaps.push({
        gap_id: `GAP-${String(gaps.length + 1).padStart(3, "0")}`,
        scope: "plan",
        description: `JD 要求“${signal}”暂时没有已确认事实支撑。`,
        required_for: signal,
        related_evidence_ids: [],
        resolved: false
      });
    }
    return {
      signal,
      importance: /要求|必须|负责|任职/.test(signal) ? "must" as const : /优先|加分/.test(signal) ? "bonus" as const : "important" as const,
      evidence_ids: evidence,
      gap: evidence.length ? "" : "缺少已确认经历证据"
    };
  });

  const targetKeywords = strategy.jdKeywords.filter((keyword) => jdText.toLowerCase().includes(keyword.toLowerCase())).slice(0, 10);
  const confirmedEvidenceText = confirmedItems.map((item) => `${item.fact}\n${item.source_excerpt}`).join("\n").toLowerCase();
  targetKeywords.forEach((keyword) => {
    if (confirmedEvidenceText.includes(keyword.toLowerCase())) return;
    gaps.push({
      gap_id: `GAP-${String(gaps.length + 1).padStart(3, "0")}`,
      scope: "plan",
      description: `JD 关键词“${keyword}”暂时没有已确认经历证据。`,
      required_for: keyword,
      related_evidence_ids: [],
      resolved: false
    });
  });
  const capabilityGroups = strategy.evidenceKeywords
    .map((keyword) => ({
      label: keyword,
      evidence_ids: confirmedItems
        .filter((item) => `${item.fact}\n${item.source_excerpt}`.toLowerCase().includes(keyword.toLowerCase()))
        .map((item) => item.evidence_id)
    }))
    .filter((item) => item.evidence_ids.length)
    .slice(0, 4);

  return {
    methodology_version: RESUME_METHODOLOGY_VERSION,
    target_role: strategy.targetTitles[0],
    narrative: `${strategy.label}所需机制与已确认经历证据的匹配`,
    target_keywords: targetKeywords,
    jd_signals: jdSignals,
    experiences: ranked,
    capability_groups: capabilityGroups,
    evidence_gaps: gaps
  };
}
