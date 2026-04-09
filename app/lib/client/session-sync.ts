"use client";

import type { SessionMode } from "../server/session-store";

const CLIENT_ID_KEY = "interview-lab.client-id";

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
  const clientId = getClientId();
  if (!clientId) return [] as T[];

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
