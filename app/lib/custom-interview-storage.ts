export type CustomInterviewStyle = "standard" | "data" | "user_insight" | "structured" | "business" | "pressure";

export type CustomInterviewDifficulty = "basic" | "normal" | "advanced";

export type CustomInterviewAnswerMethod = "text" | "voice";

export type CustomInputType = "text" | "file" | "image";

export type CustomInputMeta = {
  input_type: CustomInputType;
  original_file_name: string;
  extracted_text: string;
  edited_text: string;
  parse_source: string;
  confirmed: boolean;
};

export type ResumeParsed = {
  raw_text: string;
  experiences: string[];
  projects: string[];
  skills: string[];
  metrics: string[];
  product_domains: string[];
  candidate_style_tags: string[];
};

export type JdParsed = {
  raw_text: string;
  core_responsibilities: string[];
  must_have_skills: string[];
  bonus_skills: string[];
  product_style_tags: string[];
  interview_focus: string[];
};

export type MatchFocusItem = {
  point: string;
  reason: string;
};

export type RecommendedExperienceItem = {
  title: string;
  why_match: string;
};

export type LikelyFollowupItem = {
  point: string;
  reason: string;
};

export type MatchSummary = {
  job_focus: MatchFocusItem[];
  recommended_experiences: RecommendedExperienceItem[];
  likely_followups: LikelyFollowupItem[];
  biggest_gap: string;
  suggested_style: string;
};

export type CustomInterviewDebugTrace = {
  job_focus: string[];
  recommended_experience: string;
  selected_style: string;
  suggested_style: string;
  active_focus: string;
  generation_input_summary: string;
};

export type CustomInterviewQuestion = {
  id: string;
  index: number;
  kind: "opening" | "followup";
  content: string;
  weak_point: string;
};

export type CustomInterviewAnswer = {
  id: string;
  question_id: string;
  content: string;
  created_at: string;
};

export type CustomInterviewReview = {
  overall_match: string;
  biggest_loss_risk: string;
  mismatch_gap: string;
  best_experience_to_retrain: string;
  next_step: string;
};

export type CustomInterviewState = "draft" | "brief_ready" | "interviewing" | "thinking" | "completed";

export type CustomInterviewSessionStatus = "in_progress" | "completed" | "interrupted";

export type CustomInterviewSession = {
  session_id: string;
  mode: "custom_interview";
  created_at: string;
  updated_at: string;
  status: CustomInterviewSessionStatus;
  title: string;
  interview_state: CustomInterviewState;
  selected_style: CustomInterviewStyle;
  selected_difficulty: CustomInterviewDifficulty;
  answer_method: CustomInterviewAnswerMethod;
  resume_input: CustomInputMeta;
  jd_input: CustomInputMeta;
  resume_text: string;
  jd_text: string;
  resume_parsed: ResumeParsed | null;
  jd_parsed: JdParsed | null;
  match_summary: MatchSummary | null;
  questions: CustomInterviewQuestion[];
  answers: CustomInterviewAnswer[];
  followups: string[];
  current_question: CustomInterviewQuestion | null;
  final_review: CustomInterviewReview | null;
  debug_trace: CustomInterviewDebugTrace | null;
};

const STORAGE_KEY = "interview-lab.custom-interview.sessions";

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeFocusItems(value: unknown) {
  if (!Array.isArray(value)) return [] as MatchFocusItem[];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { point: item, reason: `${item} 是历史版本里保留下来的岗位重点。` };
      }

      if (item && typeof item === "object") {
        const point = typeof item.point === "string" ? item.point : "";
        const reason = typeof item.reason === "string" ? item.reason : "";
        if (point) {
          return {
            point,
            reason: reason || `${point} 是当前岗位重点之一。`
          };
        }
      }

      return null;
    })
    .filter((item): item is MatchFocusItem => !!item);
}

function normalizeExperienceItems(value: unknown) {
  if (!Array.isArray(value)) return [] as RecommendedExperienceItem[];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { title: item, why_match: "这是历史版本里推荐保留下来的主讲经历。" };
      }

      if (item && typeof item === "object") {
        const title = typeof item.title === "string" ? item.title : "";
        const whyMatch = typeof item.why_match === "string" ? item.why_match : "";
        if (title) {
          return {
            title,
            why_match: whyMatch || "这段经历和岗位重点有直接对应关系。"
          };
        }
      }

      return null;
    })
    .filter((item): item is RecommendedExperienceItem => !!item);
}

function normalizeFollowupItems(value: unknown, legacyRisks: unknown) {
  const nextItems = Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === "string") {
            return { point: item, reason: "这是历史版本里保留下来的追问重点。" };
          }

          if (item && typeof item === "object") {
            const point = typeof item.point === "string" ? item.point : "";
            const reason = typeof item.reason === "string" ? item.reason : "";
            if (point) {
              return {
                point,
                reason: reason || `${point} 很可能会被继续追问。`
              };
            }
          }

          return null;
        })
        .filter((item): item is LikelyFollowupItem => !!item)
    : [];

  if (nextItems.length) return nextItems;

  return normalizeStringArray(legacyRisks).map((item) => ({
    point: item,
    reason: "这是历史版本里保留下来的风险提示。"
  }));
}

function normalizeMatchSummary(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;

  return {
    job_focus: normalizeFocusItems(raw.job_focus),
    recommended_experiences: normalizeExperienceItems(raw.recommended_experiences),
    likely_followups: normalizeFollowupItems(raw.likely_followups, raw.key_risks),
    biggest_gap: typeof raw.biggest_gap === "string" ? raw.biggest_gap : "",
    suggested_style:
      typeof raw.suggested_style === "string"
        ? raw.suggested_style
        : typeof raw.suggested_interview_style === "string"
          ? raw.suggested_interview_style
          : "标准面试官"
  } satisfies MatchSummary;
}

function normalizeDebugTrace(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  return {
    job_focus: normalizeStringArray(raw.job_focus),
    recommended_experience: typeof raw.recommended_experience === "string" ? raw.recommended_experience : "",
    selected_style: typeof raw.selected_style === "string" ? raw.selected_style : "",
    suggested_style: typeof raw.suggested_style === "string" ? raw.suggested_style : "",
    active_focus: typeof raw.active_focus === "string" ? raw.active_focus : "",
    generation_input_summary: typeof raw.generation_input_summary === "string" ? raw.generation_input_summary : ""
  } satisfies CustomInterviewDebugTrace;
}

function normalizeSession(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  return {
    session_id: typeof raw.session_id === "string" ? raw.session_id : "",
    mode: "custom_interview",
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
    status:
      raw.status === "completed" || raw.status === "interrupted" || raw.status === "in_progress" ? raw.status : "in_progress",
    title: typeof raw.title === "string" ? raw.title : "定制面试",
    interview_state:
      raw.interview_state === "brief_ready" ||
      raw.interview_state === "interviewing" ||
      raw.interview_state === "thinking" ||
      raw.interview_state === "completed" ||
      raw.interview_state === "draft"
        ? raw.interview_state
        : "draft",
    selected_style:
      raw.selected_style === "data" ||
      raw.selected_style === "user_insight" ||
      raw.selected_style === "structured" ||
      raw.selected_style === "business" ||
      raw.selected_style === "pressure" ||
      raw.selected_style === "standard"
        ? raw.selected_style
        : "standard",
    selected_difficulty:
      raw.selected_difficulty === "basic" || raw.selected_difficulty === "advanced" || raw.selected_difficulty === "normal"
        ? raw.selected_difficulty
        : "normal",
    answer_method: raw.answer_method === "voice" ? "voice" : "text",
    resume_input: (raw.resume_input as CustomInputMeta) || {
      input_type: "text",
      original_file_name: "",
      extracted_text: "",
      edited_text: "",
      parse_source: "manual_text",
      confirmed: false
    },
    jd_input: (raw.jd_input as CustomInputMeta) || {
      input_type: "text",
      original_file_name: "",
      extracted_text: "",
      edited_text: "",
      parse_source: "manual_text",
      confirmed: false
    },
    resume_text: typeof raw.resume_text === "string" ? raw.resume_text : "",
    jd_text: typeof raw.jd_text === "string" ? raw.jd_text : "",
    resume_parsed: (raw.resume_parsed as ResumeParsed | null) || null,
    jd_parsed: (raw.jd_parsed as JdParsed | null) || null,
    match_summary: normalizeMatchSummary(raw.match_summary),
    questions: Array.isArray(raw.questions) ? (raw.questions as CustomInterviewQuestion[]) : [],
    answers: Array.isArray(raw.answers) ? (raw.answers as CustomInterviewAnswer[]) : [],
    followups: normalizeStringArray(raw.followups),
    current_question: (raw.current_question as CustomInterviewQuestion | null) || null,
    final_review: (raw.final_review as CustomInterviewReview | null) || null,
    debug_trace: normalizeDebugTrace(raw.debug_trace)
  } satisfies CustomInterviewSession;
}

export function readCustomSessions() {
  if (!canUseStorage()) return [] as CustomInterviewSession[];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [] as CustomInterviewSession[];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.map((item) => normalizeSession(item)).filter((item): item is CustomInterviewSession => !!item && !!item.session_id) : [];
  } catch {
    return [] as CustomInterviewSession[];
  }
}

export function writeCustomSessions(sessions: CustomInterviewSession[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function upsertCustomSession(session: CustomInterviewSession) {
  const sessions = readCustomSessions();
  const nextSessions = [session, ...sessions.filter((item) => item.session_id !== session.session_id)]
    .sort((left, right) => {
      if (left.status === "in_progress" && right.status !== "in_progress") return -1;
      if (left.status !== "in_progress" && right.status === "in_progress") return 1;
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    })
    .slice(0, 12);

  writeCustomSessions(nextSessions);
  return nextSessions;
}

export function getLatestInProgressCustomSession() {
  return readCustomSessions().find((session) => session.status === "in_progress") ?? null;
}

export function getCustomSessionById(sessionId: string) {
  return readCustomSessions().find((session) => session.session_id === sessionId) ?? null;
}
