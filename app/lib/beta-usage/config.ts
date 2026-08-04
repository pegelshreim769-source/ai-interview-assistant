import "server-only";

import type { BetaUsageConfig } from "./types";

const DEFAULTS = {
  BETA_USER_AI_RPM: 5,
  BETA_IP_AI_RPM: 20,
  BETA_USER_DAILY_UNITS: 60,
  BETA_GLOBAL_AI_CONCURRENCY: 8,
  BETA_ESTIMATED_CNY_PER_UNIT: "0.20",
  BETA_DAILY_AI_BUDGET_CNY: "20",
  BETA_MONTHLY_AI_BUDGET_CNY: "300",
  BETA_BUDGET_TIMEZONE: "Asia/Shanghai"
} as const;

const LOCAL_IP_HASH_SECRET = "local-development-only-ip-hash-secret-change-me";

export class BetaUsageConfigError extends Error {
  constructor() {
    super("Invalid beta usage configuration.");
    this.name = "BetaUsageConfigError";
  }
}

function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  key: keyof typeof DEFAULTS,
  fallback: number,
  maximum: number
) {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new BetaUsageConfigError();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new BetaUsageConfigError();
  return value;
}

export function parseCnyToCents(raw: string) {
  const normalized = raw.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) throw new BetaUsageConfigError();
  const [yuan, fraction = ""] = normalized.split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1) throw new BetaUsageConfigError();
  return cents;
}

function readMoney(env: NodeJS.ProcessEnv, key: keyof typeof DEFAULTS, fallback: string) {
  const raw = env[key];
  return parseCnyToCents(raw === undefined || raw.trim() === "" ? fallback : raw);
}

function validateTimezone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new BetaUsageConfigError();
  }
}

export function readBetaUsageConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { production?: boolean } = {}
): BetaUsageConfig {
  const production = options.production ?? env.NODE_ENV === "production";
  const configuredSecret = env.BETA_IP_HASH_SECRET?.trim() || "";
  const invalidProductionSecret =
    !configuredSecret || configuredSecret.length < 32 || configuredSecret.startsWith("replace_");
  if (production && invalidProductionSecret) throw new BetaUsageConfigError();
  const ipHashSecret = invalidProductionSecret ? LOCAL_IP_HASH_SECRET : configuredSecret;

  const timezoneRaw = env.BETA_BUDGET_TIMEZONE?.trim() || DEFAULTS.BETA_BUDGET_TIMEZONE;
  return {
    userAiRpm: readPositiveInteger(env, "BETA_USER_AI_RPM", DEFAULTS.BETA_USER_AI_RPM, 10_000),
    ipAiRpm: readPositiveInteger(env, "BETA_IP_AI_RPM", DEFAULTS.BETA_IP_AI_RPM, 100_000),
    userDailyUnits: readPositiveInteger(
      env,
      "BETA_USER_DAILY_UNITS",
      DEFAULTS.BETA_USER_DAILY_UNITS,
      10_000_000
    ),
    globalAiConcurrency: readPositiveInteger(
      env,
      "BETA_GLOBAL_AI_CONCURRENCY",
      DEFAULTS.BETA_GLOBAL_AI_CONCURRENCY,
      10_000
    ),
    estimatedCentsPerUnit: readMoney(
      env,
      "BETA_ESTIMATED_CNY_PER_UNIT",
      DEFAULTS.BETA_ESTIMATED_CNY_PER_UNIT
    ),
    dailyBudgetCents: readMoney(env, "BETA_DAILY_AI_BUDGET_CNY", DEFAULTS.BETA_DAILY_AI_BUDGET_CNY),
    monthlyBudgetCents: readMoney(
      env,
      "BETA_MONTHLY_AI_BUDGET_CNY",
      DEFAULTS.BETA_MONTHLY_AI_BUDGET_CNY
    ),
    budgetTimezone: validateTimezone(timezoneRaw),
    ipHashSecret,
    production,
    rateWindowMs: 60_000,
    invitationWindowMs: 10 * 60_000,
    invitationMaxAttempts: 5,
    concurrencyLeaseTtlMs: 10 * 60_000
  };
}
