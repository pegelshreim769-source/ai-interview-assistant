"use client";

import type { SessionMode } from "../server/session-store";

const CLIENT_ID_KEY = "interview-lab.client-id";
const ENABLE_SERVER_SESSION_SYNC = process.env.NEXT_PUBLIC_ENABLE_SERVER_SESSION_SYNC === "true";

function createClientId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId() {
  if (typeof window === "undefined" || !window.localStorage) return "";

  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const nextId = createClientId();
  window.localStorage.setItem(CLIENT_ID_KEY, nextId);
  return nextId;
}

export async function fetchSyncedSessions<T>(mode: SessionMode) {
  if (!ENABLE_SERVER_SESSION_SYNC) {
    return [] as T[];
  }

  const clientId = getClientId();
  if (!clientId) return [] as T[];

  const response = await fetch(`/api/sessions/${mode}?client_id=${clientId}`, {
    method: "GET",
    cache: "no-store"
  });

  const payload = (await response.json()) as { sessions?: T[]; error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "读取历史记录失败，请稍后再试。");
  }

  return payload.sessions || [];
}

export async function upsertSyncedSession<T>(mode: SessionMode, session: T) {
  if (!ENABLE_SERVER_SESSION_SYNC) {
    throw new Error("Server session sync is disabled.");
  }

  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Missing client id for session sync.");
  }

  const response = await fetch(`/api/sessions/${mode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      session
    })
  });

  const payload = (await response.json()) as { sessions?: T[]; error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "保存历史记录失败，请稍后再试。");
  }

  return payload.sessions || [];
}
