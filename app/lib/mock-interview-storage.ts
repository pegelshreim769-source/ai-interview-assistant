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

export function readMockSessions() {
  if (!canUseStorage()) return [] as MockInterviewSession[];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [] as MockInterviewSession[];
    const parsed = JSON.parse(raw) as MockInterviewSession[];
    return Array.isArray(parsed) ? parsed : [];
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
