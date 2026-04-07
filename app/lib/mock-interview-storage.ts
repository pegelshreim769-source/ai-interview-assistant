export type InterviewState =
  | "idle"
  | "ai_asking"
  | "waiting_for_answer"
  | "user_recording"
  | "transcribing"
  | "reviewing_answer"
  | "ai_thinking"
  | "ai_followup"
  | "round_summary";

export type InterviewMessage = {
  id: string;
  role: "assistant" | "user";
  kind: "question" | "answer" | "feedback" | "summary";
  content: string;
};

export type RoundSummary = {
  overview: string;
  biggest_issue: string;
  next_suggestion: string;
  practice_version: string;
};

export type RecognitionLanguage = "zh-CN" | "zh-TW" | "auto";

export type MockInterviewSessionStatus = "in_progress" | "completed" | "interrupted";

export type MockInterviewSession = {
  session_id: string;
  mode: "mock_interview";
  created_at: string;
  updated_at: string;
  status: MockInterviewSessionStatus;
  title: string;
  current_question: string;
  messages: InterviewMessage[];
  summary: RoundSummary | null;
  interview_state: InterviewState;
  followup_count: number;
  voice_status: string;
  live_transcript: string;
  duration_seconds: number;
  recognition_language: RecognitionLanguage;
};

const STORAGE_KEY = "interview-lab.mock-interview.sessions";
const LANGUAGE_KEY = "interview-lab.mock-interview.language";

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function normalizeInterviewMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const role = raw.role === "assistant" || raw.role === "user" ? raw.role : null;
  const kind =
    raw.kind === "question" || raw.kind === "answer" || raw.kind === "feedback" || raw.kind === "summary"
      ? raw.kind
      : null;
  const content = typeof raw.content === "string" ? raw.content : "";

  if (!role || !kind || !content) return null;

  return {
    id: typeof raw.id === "string" ? raw.id : `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    kind,
    content
  } satisfies InterviewMessage;
}

function normalizeRoundSummary(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    overview: typeof raw.overview === "string" ? raw.overview : "",
    biggest_issue: typeof raw.biggest_issue === "string" ? raw.biggest_issue : "",
    next_suggestion: typeof raw.next_suggestion === "string" ? raw.next_suggestion : "",
    practice_version: typeof raw.practice_version === "string" ? raw.practice_version : ""
  } satisfies RoundSummary;
}

function normalizeInterviewState(value: unknown): InterviewState {
  return value === "ai_asking" ||
    value === "waiting_for_answer" ||
    value === "user_recording" ||
    value === "transcribing" ||
    value === "reviewing_answer" ||
    value === "ai_thinking" ||
    value === "ai_followup" ||
    value === "round_summary" ||
    value === "idle"
    ? value
    : "idle";
}

function normalizeRecognitionLanguage(value: unknown): RecognitionLanguage {
  return value === "zh-TW" || value === "auto" ? value : "zh-CN";
}

function normalizeMockSession(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const sessionId = typeof raw.session_id === "string" ? raw.session_id : "";
  if (!sessionId) return null;

  const messages = Array.isArray(raw.messages)
    ? raw.messages.map((item) => normalizeInterviewMessage(item)).filter((item): item is InterviewMessage => !!item)
    : [];

  return {
    session_id: sessionId,
    mode: "mock_interview",
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
    status: raw.status === "completed" || raw.status === "interrupted" || raw.status === "in_progress" ? raw.status : "in_progress",
    title: typeof raw.title === "string" ? raw.title : "产品经理模拟面试",
    current_question: typeof raw.current_question === "string" ? raw.current_question : "",
    messages,
    summary: normalizeRoundSummary(raw.summary),
    interview_state: normalizeInterviewState(raw.interview_state),
    followup_count: typeof raw.followup_count === "number" ? raw.followup_count : 0,
    voice_status: typeof raw.voice_status === "string" ? raw.voice_status : "",
    live_transcript: typeof raw.live_transcript === "string" ? raw.live_transcript : "",
    duration_seconds: typeof raw.duration_seconds === "number" ? raw.duration_seconds : 0,
    recognition_language: normalizeRecognitionLanguage(raw.recognition_language)
  } satisfies MockInterviewSession;
}

export function readMockSessions() {
  if (!canUseStorage()) return [] as MockInterviewSession[];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [] as MockInterviewSession[];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeMockSession(item)).filter((item): item is MockInterviewSession => !!item)
      : [];
  } catch {
    return [] as MockInterviewSession[];
  }
}

export function writeMockSessions(sessions: MockInterviewSession[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function upsertMockSession(session: MockInterviewSession) {
  const sessions = readMockSessions();
  const nextSessions = [session, ...sessions.filter((item) => item.session_id !== session.session_id)]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 12);
  writeMockSessions(nextSessions);
  return nextSessions;
}

export function getLatestInProgressSession() {
  return readMockSessions().find((session) => session.status === "in_progress") ?? null;
}

export function getMockSessionById(sessionId: string) {
  return readMockSessions().find((session) => session.session_id === sessionId) ?? null;
}

export function readRecognitionLanguage(): RecognitionLanguage {
  if (!canUseStorage()) return "zh-CN";

  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === "zh-TW" || value === "auto" ? value : "zh-CN";
}

export function writeRecognitionLanguage(language: RecognitionLanguage) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LANGUAGE_KEY, language);
}
