import "server-only";

import type { AdminConfig } from "./types";

export class AdminConfigError extends Error {
  constructor() {
    super("Admin access is not configured.");
    this.name = "AdminConfigError";
  }
}

export function readAdminConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
  const accessTokenHash = env.ADMIN_ACCESS_TOKEN_HASH?.trim().toLowerCase() || "";
  if (!/^[a-f0-9]{64}$/.test(accessTokenHash) || accessTokenHash.startsWith("replace")) {
    throw new AdminConfigError();
  }
  const rawHours = env.ADMIN_SESSION_HOURS?.trim() || "8";
  if (!/^\d+$/.test(rawHours)) throw new AdminConfigError();
  const sessionHours = Number(rawHours);
  if (!Number.isSafeInteger(sessionHours) || sessionHours < 1 || sessionHours > 168) {
    throw new AdminConfigError();
  }
  const production = env.NODE_ENV === "production";
  const ipHashSecret = env.BETA_IP_HASH_SECRET?.trim() || "";
  if (!ipHashSecret || ipHashSecret.length < 32 || (production && ipHashSecret.startsWith("replace_"))) {
    throw new AdminConfigError();
  }
  return {
    accessTokenHash,
    sessionHours,
    ipHashSecret,
    production,
    loginWindowMs: 15 * 60_000,
    loginMaxAttempts: 5
  };
}
