import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SessionMode = "mock-interview" | "custom-interview";

const SESSION_ROOT = path.join(process.cwd(), ".data", "sessions");

type PersistedSession = {
  session_id: string;
  updated_at?: string;
  status?: string;
};

function sanitizeClientId(clientId: string) {
  return clientId.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 64);
}

function sessionFilePath(mode: SessionMode, clientId: string) {
  return path.join(SESSION_ROOT, mode, `${sanitizeClientId(clientId)}.json`);
}

async function ensureSessionDirectory(mode: SessionMode) {
  await mkdir(path.join(SESSION_ROOT, mode), { recursive: true });
}

function sortSessions<T extends PersistedSession>(mode: SessionMode, sessions: T[]) {
  return [...sessions]
    .sort((left, right) => {
      if (mode === "custom-interview") {
        if (left.status === "in_progress" && right.status !== "in_progress") return -1;
        if (left.status !== "in_progress" && right.status === "in_progress") return 1;
      }

      return new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime();
    })
    .slice(0, 12);
}

export async function readServerSessions<T extends PersistedSession>(mode: SessionMode, clientId: string) {
  await ensureSessionDirectory(mode);

  try {
    const raw = await readFile(sessionFilePath(mode, clientId), "utf8");
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? sortSessions(mode, parsed) : [];
  } catch {
    return [];
  }
}

export async function writeServerSessions<T extends PersistedSession>(mode: SessionMode, clientId: string, sessions: T[]) {
  await ensureSessionDirectory(mode);
  const nextSessions = sortSessions(mode, sessions);
  await writeFile(sessionFilePath(mode, clientId), JSON.stringify(nextSessions, null, 2), "utf8");
  return nextSessions;
}

export async function upsertServerSession<T extends PersistedSession>(mode: SessionMode, clientId: string, session: T) {
  const sessions = await readServerSessions<T>(mode, clientId);
  return writeServerSessions(
    mode,
    clientId,
    [session, ...sessions.filter((item) => item.session_id !== session.session_id)]
  );
}
