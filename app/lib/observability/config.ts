import "server-only";

import type { MetricsConfig } from "./types";

export class MetricsConfigError extends Error {
  constructor() {
    super("Invalid observability configuration.");
    this.name = "MetricsConfigError";
  }
}

function boundedPositiveInteger(raw: string | undefined, fallback: number, maximum: number) {
  const normalized = raw?.trim();
  if (!normalized) return fallback;
  if (!/^\d+$/.test(normalized)) throw new MetricsConfigError();
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new MetricsConfigError();
  return value;
}

export function readMetricsConfig(env: NodeJS.ProcessEnv = process.env): MetricsConfig {
  const secret = env.BETA_IP_HASH_SECRET?.trim();
  if (!secret || secret.length < 32 || secret.startsWith("replace_")) {
    if (env.NODE_ENV === "production") throw new MetricsConfigError();
  }
  return {
    hourlyRetentionHours: boundedPositiveInteger(env.BETA_METRICS_HOURLY_RETENTION_HOURS, 168, 2160),
    dailyRetentionDays: boundedPositiveInteger(env.BETA_METRICS_DAILY_RETENTION_DAYS, 90, 730),
    timezone: "Asia/Shanghai",
    activeSessionHmacSecret: secret || "local-observability-secret-change-before-production"
  };
}
