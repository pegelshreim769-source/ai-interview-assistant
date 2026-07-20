"use client";

import { RESUME_METHODOLOGY_VERSION } from "./methodology";
import type { ResumeStudioInterviewHandoff, ResumeStudioSession } from "./types";

const SESSION_STORAGE_KEY = "interview-lab.resume-studio.session";
const HANDOFF_STORAGE_KEY = "interview-lab.resume-studio.interview-handoff";

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function readResumeStudioSession() {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeStudioSession;
    if (!parsed?.session_id || parsed.methodology_version !== RESUME_METHODOLOGY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeResumeStudioSession(session: ResumeStudioSession) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearResumeStudioSession() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function writeResumeStudioInterviewHandoff(handoff: ResumeStudioInterviewHandoff) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
}

export function consumeResumeStudioInterviewHandoff() {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(HANDOFF_STORAGE_KEY);
    window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeStudioInterviewHandoff;
    return parsed?.source === "resume_studio" && parsed.resume_text && parsed.jd_text ? parsed : null;
  } catch {
    window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
    return null;
  }
}
