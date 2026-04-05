import { NextResponse } from "next/server";
import type {
  CustomInterviewDebugTrace,
  CustomInterviewDifficulty,
  CustomInterviewReview,
  CustomInterviewStyle,
  JdParsed,
  LikelyFollowupItem,
  MatchFocusItem,
  MatchSummary,
  RecommendedExperienceItem,
  ResumeParsed
} from "../../lib/custom-interview-storage";

type ParseResumeAction = {
  action: "parse_resume";
  resume_text: string;
};

type ParseJdAction = {
  action: "parse_jd";
  jd_text: string;
};

type BuildMatchSummaryAction = {
  action: "build_match_summary";
  resume_parsed: ResumeParsed;
  jd_parsed: JdParsed;
};

type RunCustomInterviewAction = {
  action: "run_custom_interview";
  stage: "start" | "answer" | "finish";
  match_summary: MatchSummary;
  resume_parsed: ResumeParsed;
  jd_parsed: JdParsed;
  selected_style: CustomInterviewStyle;
  selected_difficulty: CustomInterviewDifficulty;
  current_question?: string;
  current_question_index?: number;
  answers?: string[];
  latest_answer?: string;
};

type RequestBody = ParseResumeAction | ParseJdAction | BuildMatchSummaryAction | RunCustomInterviewAction;

type RunCustomInterviewResult = {
  next_question_or_followup: string;
  weak_point: string;
  round_review: CustomInterviewReview | null;
  should_finish: boolean;
  question_index: number;
  total_questions: number;
  debug_trace: CustomInterviewDebugTrace;
};

type FocusLens = "data" | "user_insight" | "business" | "structured" | "ai" | "collaboration" | "tob" | "general";

type FocusProfile = {
  point: string;
  lens: FocusLens;
  styleLabel: string;
  keywords: string[];
  followupPoint: string;
};

type DomainProfile = {
  label: string;
  keywords: string[];
};

type FocusCandidate = {
  profile: FocusProfile;
  score: number;
  evidenceLines: string[];
};

const FOCUS_PROFILES: FocusProfile[] = [
  {
    point: "数据驱动判断",
    lens: "data",
    styleLabel: "强数据驱动",
    keywords: ["数据", "指标", "漏斗", "sql", "实验", "a/b", "ab", "转化", "留存", "分析", "验证", "归因"],
    followupPoint: "结果验证方式"
  },
  {
    point: "用户洞察深度",
    lens: "user_insight",
    styleLabel: "强用户洞察",
    keywords: ["用户", "访谈", "调研", "反馈", "画像", "洞察", "需求", "可用性", "痛点"],
    followupPoint: "用户证据"
  },
  {
    point: "业务判断与取舍",
    lens: "business",
    styleLabel: "业务判断型",
    keywords: ["业务", "商业化", "roi", "成本", "收益", "营收", "优先级", "取舍", "增长", "gmv"],
    followupPoint: "方案取舍逻辑"
  },
  {
    point: "结构化拆解能力",
    lens: "structured",
    styleLabel: "结构推演型",
    keywords: ["拆解", "结构", "框架", "路径", "推演", "优先级", "方案", "分析路径"],
    followupPoint: "问题拆解路径"
  },
  {
    point: "AI 产品理解",
    lens: "ai",
    styleLabel: "标准面试官",
    keywords: ["ai", "大模型", "模型", "agent", "copilot", "智能", "llm", "生成式", "prompt", "rag"],
    followupPoint: "AI 方案判断"
  },
  {
    point: "跨团队推进",
    lens: "collaboration",
    styleLabel: "标准面试官",
    keywords: ["协同", "推进", "推动", "研发", "设计", "运营", "销售", "跨团队", "落地"],
    followupPoint: "推进阻力处理"
  },
  {
    point: "ToB 抽象能力",
    lens: "tob",
    styleLabel: "业务判断型",
    keywords: ["b端", "to b", "企业", "客户", "商家", "saas", "行业方案", "配置化", "抽象"],
    followupPoint: "需求抽象方式"
  }
];

const DOMAIN_PROFILES: DomainProfile[] = [
  { label: "AI 应用", keywords: ["ai", "大模型", "agent", "copilot", "智能", "llm"] },
  { label: "效率工具", keywords: ["工具", "效率", "协作", "工作台", "编辑器"] },
  { label: "平台产品", keywords: ["平台", "中台", "系统", "后台"] },
  { label: "内容产品", keywords: ["内容", "推荐", "创作", "社区", "feed"] },
  { label: "企业服务", keywords: ["企业", "商家", "客户", "saas", "管理后台"] },
  { label: "教育场景", keywords: ["教育", "课程", "学习", "题库", "教学"] }
];

const EXPERIENCE_HINTS = ["负责", "主导", "推动", "优化", "设计", "搭建", "上线", "增长", "分析", "改版", "项目"];
const METRIC_REGEX = /(\d+(?:\.\d+)?\s?(?:%|倍|天|周|月|年|万|亿|人|次))/g;

function normalizeText(input: string) {
  return input.replace(/\r/g, "").trim();
}

function splitUnits(input: string) {
  return normalizeText(input)
    .split(/\n+|[。！？]/)
    .map((line) => line.trim().replace(/^[-*•\d.\s]+/, ""))
    .filter((line) => line.length >= 6);
}

function uniqueItems(items: string[], limit = items.length) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit);
}

function countKeywordHits(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.reduce((count, keyword) => count + (lower.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function detectLabels(text: string, profiles: Array<{ label: string; keywords: string[] }>) {
  const lower = text.toLowerCase();
  return profiles.filter((profile) => profile.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))).map((profile) => profile.label);
}

function extractMetrics(text: string) {
  return uniqueItems(Array.from(text.matchAll(METRIC_REGEX)).map((match) => match[0]), 8);
}

function extractCandidateExperiences(lines: string[]) {
  const strongLines = lines.filter((line) => EXPERIENCE_HINTS.some((hint) => line.includes(hint)));
  return uniqueItems(strongLines.length ? strongLines : lines, 5);
}

function extractResponsibilities(lines: string[]) {
  const responsibilityHints = ["负责", "推动", "协同", "设计", "搭建", "分析", "策略", "增长", "优化"];
  const matched = lines.filter((line) => responsibilityHints.some((hint) => line.includes(hint)));
  return uniqueItems(matched.length ? matched : lines, 5);
}

function extractRequirementLines(lines: string[], kind: "must" | "bonus") {
  const hints = kind === "must" ? ["要求", "熟悉", "具备", "能力", "经验", "负责"] : ["加分", "优先", "bonus", "优先考虑"];
  const matched = lines.filter((line) => hints.some((hint) => line.toLowerCase().includes(hint.toLowerCase())));
  return uniqueItems(matched, 4);
}

function styleLabelFromValue(style: CustomInterviewStyle) {
  if (style === "data") return "强数据驱动";
  if (style === "user_insight") return "强用户洞察";
  if (style === "structured") return "结构推演型";
  if (style === "business") return "业务判断型";
  if (style === "pressure") return "压力追问型";
  return "标准面试官";
}

function styleValueFromLabel(label: string): CustomInterviewStyle {
  if (label.includes("数据")) return "data";
  if (label.includes("用户")) return "user_insight";
  if (label.includes("结构")) return "structured";
  if (label.includes("业务")) return "business";
  if (label.includes("压力")) return "pressure";
  return "standard";
}

function lensFromText(text: string): FocusLens {
  const profile = FOCUS_PROFILES.find((item) => text.includes(item.point) || text.includes(item.followupPoint) || countKeywordHits(text, item.keywords) > 0);
  return profile?.lens || "general";
}

function evidenceReason(point: string, evidenceLine: string) {
  return evidenceLine
    ? `JD 里直接提到“${evidenceLine}”，说明这个岗位会重点看你在${point}上的真实判断和做法。`
    : `这份 JD 会重点考察你在${point}上的真实经验。`;
}

function buildExperienceReason(title: string, matchedFocuses: MatchFocusItem[], matchedDomains: string[], resumeParsed: ResumeParsed) {
  const fragments = [] as string[];

  if (matchedFocuses.length) {
    fragments.push(`这段经历能直接回应岗位最看重的“${matchedFocuses.map((item) => item.point).join(" / ")}”`);
  }

  if (matchedDomains.length) {
    fragments.push(`场景上也和 JD 里的 ${matchedDomains.join(" / ")} 更接近`);
  }

  if (extractMetrics(title).length || resumeParsed.metrics.length) {
    fragments.push("而且自带结果或指标，便于在面试里把验证过程讲具体");
  }

  return fragments.length ? `${fragments.join("，")}。` : "这段经历和岗位重点最容易建立直接对应关系。";
}

function findFocusCandidates(jdParsed: JdParsed) {
  const jdLines = splitUnits(jdParsed.raw_text);

  return FOCUS_PROFILES.map((profile) => {
    const evidenceLines = jdLines.filter((line) => countKeywordHits(line, profile.keywords) > 0).slice(0, 2);
    const score =
      evidenceLines.length * 4 +
      jdParsed.must_have_skills.reduce((count, item) => count + countKeywordHits(item, profile.keywords), 0) * 2 +
      jdParsed.core_responsibilities.reduce((count, item) => count + countKeywordHits(item, profile.keywords), 0) * 2 +
      jdParsed.interview_focus.reduce((count, item) => count + countKeywordHits(item, profile.keywords), 0);

    return {
      profile,
      score,
      evidenceLines
    } satisfies FocusCandidate;
  })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
}

async function parseResumeNode(resumeText: string): Promise<ResumeParsed> {
  const rawText = normalizeText(resumeText);
  const lines = splitUnits(rawText);
  const focusTags = detectLabels(rawText, FOCUS_PROFILES.map((profile) => ({ label: profile.point, keywords: profile.keywords })));
  const domainTags = detectLabels(rawText, DOMAIN_PROFILES);

  return {
    raw_text: rawText,
    experiences: extractCandidateExperiences(lines),
    projects: uniqueItems(lines.filter((line) => line.includes("项目") || line.includes("改版") || line.includes("上线")), 4),
    skills: uniqueItems([...focusTags, ...domainTags], 8),
    metrics: extractMetrics(rawText),
    product_domains: uniqueItems(domainTags, 4),
    candidate_style_tags: uniqueItems(
      [
        ...focusTags,
        ...(extractMetrics(rawText).length ? ["结果导向"] : [])
      ],
      6
    )
  };
}

async function parseJdNode(jdText: string): Promise<JdParsed> {
  const rawText = normalizeText(jdText);
  const lines = splitUnits(rawText);
  const focusTags = detectLabels(rawText, FOCUS_PROFILES.map((profile) => ({ label: profile.point, keywords: profile.keywords })));
  const domainTags = detectLabels(rawText, DOMAIN_PROFILES);

  return {
    raw_text: rawText,
    core_responsibilities: extractResponsibilities(lines),
    must_have_skills: uniqueItems([...extractRequirementLines(lines, "must"), ...focusTags], 6),
    bonus_skills: uniqueItems(extractRequirementLines(lines, "bonus"), 4),
    product_style_tags: uniqueItems(domainTags, 6),
    interview_focus: uniqueItems([...focusTags, ...extractRequirementLines(lines, "must").slice(0, 3)], 5)
  };
}

function scoreExperience(text: string, focusItems: MatchFocusItem[], jdParsed: JdParsed, resumeParsed: ResumeParsed) {
  const lower = text.toLowerCase();
  const matchedFocuses = focusItems.filter((item) => lensFromText(item.point) === lensFromText(text) || lower.includes(item.point.toLowerCase()) || countKeywordHits(text, FOCUS_PROFILES.find((profile) => profile.point === item.point)?.keywords || []) > 0);
  const matchedDomains = jdParsed.product_style_tags.filter((tag) => resumeParsed.product_domains.includes(tag) || lower.includes(tag.toLowerCase()));
  const hasMetrics = extractMetrics(text).length > 0 || /\d/.test(text);
  const score = matchedFocuses.length * 4 + matchedDomains.length * 2 + (hasMetrics ? 1 : 0);

  return {
    score,
    matchedFocuses,
    matchedDomains
  };
}

function buildGapSummary(focusCandidate: FocusCandidate | undefined, resumeParsed: ResumeParsed) {
  if (!focusCandidate) {
    return "简历和 JD 的主线已经比较接近，真正容易失分的还是结果、证据和个人判断讲得不够硬。";
  }

  const evidenceLine = focusCandidate.evidenceLines[0] || focusCandidate.profile.point;
  return `JD 明确强调“${evidenceLine}”，但你的简历里对“${focusCandidate.profile.point}”的证据还不够强，面试时很容易被继续追问。`;
}

function buildLikelyFollowups(focusItems: MatchFocusItem[], recommendedExperience: RecommendedExperienceItem | undefined, biggestGap: string) {
  return focusItems.slice(0, 3).map((item) => ({
    point: FOCUS_PROFILES.find((profile) => profile.point === item.point)?.followupPoint || item.point,
    reason:
      biggestGap.includes(item.point) && recommendedExperience
        ? `因为 JD 很看重${item.point}，而你当前最匹配的经历“${recommendedExperience.title}”里这块还没天然讲透，面试官大概率会继续压这一个点。`
        : recommendedExperience
          ? `你最适合主讲的经历是“${recommendedExperience.title}”，但如果不把${item.point}讲得更具体，后续就会追到这一层。`
          : `这个岗位本身很看重${item.point}，所以很容易被往下追问。`
  }));
}

async function buildMatchSummaryNode(resumeParsed: ResumeParsed, jdParsed: JdParsed): Promise<MatchSummary> {
  const focusCandidates = findFocusCandidates(jdParsed).slice(0, 4);
  const focusItems = (focusCandidates.length ? focusCandidates : [{ profile: FOCUS_PROFILES[0], score: 1, evidenceLines: [] }]).map((item) => ({
    point: item.profile.point,
    reason: evidenceReason(item.profile.point, item.evidenceLines[0] || jdParsed.must_have_skills[0] || jdParsed.core_responsibilities[0] || "")
  }));

  const candidatePool = uniqueItems([...resumeParsed.experiences, ...resumeParsed.projects, ...splitUnits(resumeParsed.raw_text).slice(0, 3)], 7);
  const recommendedExperiences = candidatePool
    .map((item) => {
      const match = scoreExperience(item, focusItems, jdParsed, resumeParsed);
      return {
        title: item,
        why_match: buildExperienceReason(item, match.matchedFocuses.length ? match.matchedFocuses : focusItems.slice(0, 2), match.matchedDomains, resumeParsed),
        score: match.score
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map(({ title, why_match }) => ({ title, why_match })) satisfies RecommendedExperienceItem[];

  const gapCandidate = focusCandidates.find((candidate) => countKeywordHits(resumeParsed.raw_text, candidate.profile.keywords) === 0);
  const biggestGap = buildGapSummary(gapCandidate, resumeParsed);
  const likelyFollowups = buildLikelyFollowups(focusItems, recommendedExperiences[0], biggestGap);
  const suggestedStyle = focusCandidates[0]?.profile.styleLabel || "标准面试官";

  return {
    job_focus: focusItems.length ? focusItems : [{ point: "数据驱动判断", reason: "这类岗位通常会先看你怎么识别问题并验证结果。" }],
    recommended_experiences: recommendedExperiences.length ? recommendedExperiences : [{ title: resumeParsed.experiences[0] || "最相关的一段经历", why_match: "这是你当前最容易展开的一段经历。" }],
    likely_followups: likelyFollowups.length ? likelyFollowups : [{ point: "个人动作边界", reason: "如果你的动作和判断不够清楚，面试官会继续往下追问。" }],
    biggest_gap: biggestGap,
    suggested_style: suggestedStyle
  };
}

function difficultyToQuestionCount(difficulty: CustomInterviewDifficulty) {
  if (difficulty === "basic") return 2;
  if (difficulty === "advanced") return 4;
  return 3;
}

function resolveEffectiveStyle(selectedStyle: CustomInterviewStyle, suggestedStyle: string) {
  return selectedStyle === "standard" ? styleValueFromLabel(suggestedStyle) : selectedStyle;
}

function detectWeakPoint(answer: string, activeFocus: MatchFocusItem, style: CustomInterviewStyle, likelyFollowups: LikelyFollowupItem[]) {
  const lower = answer.toLowerCase();
  const hasMetric = /\d/.test(answer) || ["%", "提升", "下降", "增长", "留存", "转化"].some((token) => answer.includes(token));
  const hasOwnership = ["我", "主导", "负责", "推动", "判断", "分析", "设计", "拍板"].some((token) => answer.includes(token));
  const hasUserEvidence = ["用户", "访谈", "反馈", "调研", "证据", "画像", "可用性"].some((token) => answer.includes(token));
  const hasBusinessSense = ["业务", "收益", "roi", "成本", "优先级", "取舍", "营收"].some((token) => lower.includes(token));
  const hasMethod = ["分析", "实验", "方案", "验证", "漏斗", "sql", "拆解", "路径"].some((token) => answer.includes(token));
  const hasWhyAi = ["模型", "规则", "ai", "大模型", "prompt", "rag"].some((token) => lower.includes(token));
  const lens = lensFromText(activeFocus.point);

  if (lens === "data" && !hasMetric) return "结果验证方式";
  if (lens === "user_insight" && !hasUserEvidence) return "用户证据";
  if (lens === "business" && !hasBusinessSense) return "方案取舍逻辑";
  if (lens === "structured" && !hasMethod) return "问题拆解路径";
  if (lens === "ai" && !hasWhyAi) return "AI 方案判断";
  if (!hasOwnership) return "个人动作边界";
  if (style === "pressure") return "关键取舍依据";
  return likelyFollowups[0]?.point || "关键判断细节";
}

function pickFollowupTarget(matchSummary: MatchSummary, weakPoint: string, currentQuestionIndex: number) {
  const weakLens = lensFromText(weakPoint);

  return (
    matchSummary.likely_followups.find((item) => item.point.includes(weakPoint) || weakPoint.includes(item.point) || lensFromText(item.point) === weakLens) ||
    matchSummary.likely_followups[Math.min(Math.max(currentQuestionIndex - 1, 0), Math.max(matchSummary.likely_followups.length - 1, 0))] ||
    {
      point: weakPoint,
      reason: `${weakPoint} 会直接影响这一轮的岗位匹配感。`
    }
  );
}

function buildOpeningQuestion(matchSummary: MatchSummary, selectedStyle: CustomInterviewStyle) {
  const recommendedExperience = matchSummary.recommended_experiences[0] || { title: "最相关的一段经历", why_match: "" };
  const primaryFocus = matchSummary.job_focus[0] || { point: "岗位重点", reason: "" };
  const secondaryFocus = matchSummary.job_focus[1];
  const effectiveStyle = resolveEffectiveStyle(selectedStyle, matchSummary.suggested_style);
  const focusPair = secondaryFocus ? `${primaryFocus.point}和${secondaryFocus.point}` : primaryFocus.point;

  if (effectiveStyle === "data" || lensFromText(primaryFocus.point) === "data") {
    return `这个岗位会重点看你是不是能用数据做判断。就拿你简历里的“${recommendedExperience.title}”来说，当时你最早是从哪些数据或异常信号发现问题的，后来又是怎么验证这个判断是对的？`;
  }

  if (effectiveStyle === "user_insight" || lensFromText(primaryFocus.point) === "user_insight") {
    return `这个岗位很看重用户洞察。你就围绕“${recommendedExperience.title}”讲讲，你当时是怎么确认用户问题真实存在的，以及为什么判断这件事值得优先做？`;
  }

  if (effectiveStyle === "business" || lensFromText(primaryFocus.point) === "business") {
    return `这个岗位不只看执行，还会看业务判断。你就从“${recommendedExperience.title}”开始讲，当时你为什么判断这件事值得做，又是基于什么做了方案取舍？`;
  }

  if (effectiveStyle === "structured" || lensFromText(primaryFocus.point) === "structured") {
    return `这个岗位会比较看重你怎么拆复杂问题。你讲讲“${recommendedExperience.title}”这段经历里，你当时是怎么把问题拆开、再决定先做什么的？`;
  }

  if (effectiveStyle === "pressure") {
    return `你简历里写到“${recommendedExperience.title}”，这段和岗位相关，但我更想听清楚你的判断。你具体讲讲，当时为什么要做这件事，关键取舍是谁做的，最后又怎么证明它真的有效？`;
  }

  return `这个岗位最看重“${focusPair}”。你就从“${recommendedExperience.title}”开始讲讲，当时为什么是你来推进这件事，你自己做了哪些关键判断，最后结果是怎么拿到的？`;
}

function buildFollowupQuestion(target: LikelyFollowupItem, activeFocus: MatchFocusItem, selectedStyle: CustomInterviewStyle, currentQuestionIndex: number) {
  const effectiveStyle = resolveEffectiveStyle(selectedStyle, activeFocus.point);
  const lens = lensFromText(target.point || activeFocus.point);

  if (lens === "data") {
    return currentQuestionIndex === 2 || effectiveStyle !== "pressure"
      ? "你刚才讲了动作，但判断链路还不够清楚。你当时先看了哪些数据，为什么最后会把问题定位到这里？"
      : "你提到了结果，但我还没听到能站住脚的归因。如果只允许你拿一个证据证明这次优化真的有效，你会拿什么？";
  }

  if (lens === "user_insight") {
    return currentQuestionIndex === 2 || effectiveStyle !== "pressure"
      ? "你怎么确认这不是个别反馈，而是足够值得做的用户问题？你当时最关键的用户证据是什么？"
      : "如果我质疑你的判断只是拍脑袋，你会拿哪一条用户证据来证明自己没有误判？";
  }

  if (lens === "business") {
    return currentQuestionIndex === 2 || effectiveStyle !== "pressure"
      ? "你当时为什么优先这个方案？如果资源再紧一点，你会砍掉哪部分，保留哪部分？"
      : "我还是没听到这件事最值钱的业务判断。为什么不是另一个方案，真正决定你拍板的依据是什么？";
  }

  if (lens === "structured") {
    return currentQuestionIndex === 2 || effectiveStyle !== "pressure"
      ? "你当时先拆了哪些变量？是哪一步分析让你改变了原来的判断，决定先做这件事？"
      : "如果把这件事重新做一遍，你会保留哪条分析路径，又会放弃哪条路径？为什么？";
  }

  if (lens === "ai") {
    return currentQuestionIndex === 2 || effectiveStyle !== "pressure"
      ? "你为什么判断这个场景适合用 AI 来做，而不是靠规则或普通功能就够了？"
      : "如果面试官质疑这其实不是 AI 问题，而只是流程问题，你会怎么证明你的方案判断是成立的？";
  }

  if (lens === "collaboration") {
    return currentQuestionIndex === 2 || effectiveStyle !== "pressure"
      ? "这件事里最难拉齐的是哪一方？如果没有你来推进，这个方案最可能卡在哪一步？"
      : "你说自己推动了落地，但我还没听到真正的阻力点。最难协调的人是谁，你具体是怎么让他改变判断的？";
  }

  if (lens === "tob") {
    return currentQuestionIndex === 2 || effectiveStyle !== "pressure"
      ? "这件事里你是怎么把单个客户需求抽象成可复用方案的？你怎么判断哪些要共性化、哪些要保留差异？"
      : "如果换一个客户场景，你这套方案还能成立吗？你当时是怎么判断抽象边界的？";
  }

  return currentQuestionIndex === 2
    ? `这个岗位很看重“${activeFocus.point}”。你刚才的回答里，最容易继续失分的是“${target.point}”，你会怎么把这一点讲得更硬？`
    : `如果面试官继续往下压一层，“${target.point}”就是最关键的点。你会怎么把它讲到让人信服？`;
}

function buildDebugTrace(matchSummary: MatchSummary, selectedStyle: CustomInterviewStyle, activeFocus: MatchFocusItem, recommendedExperience: RecommendedExperienceItem, summary: string) {
  return {
    job_focus: matchSummary.job_focus.map((item) => item.point),
    recommended_experience: recommendedExperience.title,
    selected_style: styleLabelFromValue(selectedStyle),
    suggested_style: matchSummary.suggested_style,
    active_focus: activeFocus.point,
    generation_input_summary: summary
  } satisfies CustomInterviewDebugTrace;
}

function buildRoundReview(
  matchSummary: MatchSummary,
  answers: string[],
  weakPoint: string,
  selectedStyle: CustomInterviewStyle
): CustomInterviewReview {
  const combined = answers.join("\n");
  const strongestFocus = matchSummary.job_focus[0]?.point || "岗位重点";
  const hasOwnership = ["我", "主导", "负责", "推动", "判断"].some((token) => combined.includes(token));
  const recommendedExperience = matchSummary.recommended_experiences[0]?.title || "最相关的一段经历";

  return {
    overall_match: hasOwnership
      ? `你这轮回答已经能把“${strongestFocus}”和自己的真实经历挂上钩，但还需要再把判断依据讲得更稳，岗位匹配感才会更强。`
      : `你选的经历方向是对的，但个人动作边界还不够清楚，所以岗位匹配感还没有完全立住。`,
    biggest_loss_risk: matchSummary.likely_followups[0]
      ? `最容易失分的是“${matchSummary.likely_followups[0].point}”。${matchSummary.likely_followups[0].reason}`
      : "最容易失分的是结果、证据和个人判断没有形成闭环。",
    mismatch_gap: matchSummary.biggest_gap || "这轮里和岗位最不匹配的地方，是重点能力还没有讲到让人信服。",
    best_experience_to_retrain: `最值得继续补练的是“${recommendedExperience}”。这段最贴岗位，但你还可以把岗位重点和你的动作、证据、结果再压得更扎实。`,
    next_step:
      selectedStyle === "pressure"
        ? "下一步建议先回到文字练习，把这段经历的判断依据和结果验证写顺，再回来做一轮压力追问。"
        : "下一步建议先回到文字练习，把这段经历补成更完整的一版；如果已经能讲顺，再回到模拟面试继续压问答节奏。"
  };
}

async function runCustomInterviewNode(payload: RunCustomInterviewAction): Promise<RunCustomInterviewResult> {
  const totalQuestions = difficultyToQuestionCount(payload.selected_difficulty);
  const currentQuestionIndex = payload.current_question_index ?? 0;
  const recommendedExperience = payload.match_summary.recommended_experiences[0] || { title: "最相关的一段经历", why_match: "" };
  const activeFocus = payload.match_summary.job_focus[Math.min(Math.max(currentQuestionIndex, 0), Math.max(payload.match_summary.job_focus.length - 1, 0))] || {
    point: "岗位重点",
    reason: "这是当前这轮最需要压实的能力点。"
  };

  if (payload.stage === "start") {
    const openingQuestion = buildOpeningQuestion(payload.match_summary, payload.selected_style);
    const debugSummary = `首题基于主讲经历“${recommendedExperience.title}”、岗位重点“${payload.match_summary.job_focus
      .slice(0, 2)
      .map((item) => item.point)
      .join(" / ")}”，并结合当前面试风格“${styleLabelFromValue(payload.selected_style)}”生成。`;

    return {
      next_question_or_followup: openingQuestion,
      weak_point: activeFocus.point,
      round_review: null,
      should_finish: false,
      question_index: 1,
      total_questions: totalQuestions,
      debug_trace: buildDebugTrace(payload.match_summary, payload.selected_style, activeFocus, recommendedExperience, debugSummary)
    };
  }

  const answers = payload.answers ?? [];
  const latestAnswer = payload.latest_answer?.trim() || "";
  const weakPoint = detectWeakPoint(latestAnswer, activeFocus, payload.selected_style, payload.match_summary.likely_followups);

  if (payload.stage === "finish" || currentQuestionIndex >= totalQuestions) {
    const debugSummary = `整轮复盘基于岗位重点“${payload.match_summary.job_focus
      .map((item) => item.point)
      .join(" / ")}”、当前最薄弱点“${weakPoint}”，以及你整轮回答生成。`;

    return {
      next_question_or_followup: "",
      weak_point: weakPoint,
      round_review: buildRoundReview(payload.match_summary, answers, weakPoint, payload.selected_style),
      should_finish: true,
      question_index: currentQuestionIndex,
      total_questions: totalQuestions,
      debug_trace: buildDebugTrace(payload.match_summary, payload.selected_style, activeFocus, recommendedExperience, debugSummary)
    };
  }

  const nextIndex = currentQuestionIndex + 1;
  const followupTarget = pickFollowupTarget(payload.match_summary, weakPoint, currentQuestionIndex);
  const followupQuestion = buildFollowupQuestion(followupTarget, activeFocus, payload.selected_style, nextIndex);
  const debugSummary = `追问基于当前薄弱点“${weakPoint}”、岗位重点“${activeFocus.point}”，以及预判追问“${followupTarget.point}”生成。`;

  return {
    next_question_or_followup: followupQuestion,
    weak_point: weakPoint,
    round_review: nextIndex >= totalQuestions ? buildRoundReview(payload.match_summary, answers, weakPoint, payload.selected_style) : null,
    should_finish: nextIndex >= totalQuestions,
    question_index: nextIndex,
    total_questions: totalQuestions,
    debug_trace: buildDebugTrace(payload.match_summary, payload.selected_style, activeFocus, recommendedExperience, debugSummary)
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    if (body.action === "parse_resume") {
      if (!body.resume_text?.trim()) {
        return NextResponse.json({ error: "请先提供简历内容。" }, { status: 400 });
      }

      return NextResponse.json({ resume_parsed: await parseResumeNode(body.resume_text) });
    }

    if (body.action === "parse_jd") {
      if (!body.jd_text?.trim()) {
        return NextResponse.json({ error: "请先粘贴岗位 JD。" }, { status: 400 });
      }

      return NextResponse.json({ jd_parsed: await parseJdNode(body.jd_text) });
    }

    if (body.action === "build_match_summary") {
      return NextResponse.json({
        match_summary: await buildMatchSummaryNode(body.resume_parsed, body.jd_parsed)
      });
    }

    if (body.action === "run_custom_interview") {
      return NextResponse.json(await runCustomInterviewNode(body));
    }

    return NextResponse.json({ error: "不支持的定制面试动作。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "定制面试暂时不可用，请稍后再试。"
      },
      { status: 500 }
    );
  }
}
