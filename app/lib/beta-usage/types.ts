import type { BetaAiEndpoint } from "./costs";

export type BetaUsageConfig = {
  userAiRpm: number;
  ipAiRpm: number;
  userDailyUnits: number;
  globalAiConcurrency: number;
  estimatedCentsPerUnit: number;
  dailyBudgetCents: number;
  monthlyBudgetCents: number;
  budgetTimezone: string;
  ipHashSecret: string;
  production: boolean;
  rateWindowMs: number;
  invitationWindowMs: number;
  invitationMaxAttempts: number;
  concurrencyLeaseTtlMs: number;
};

export type UsagePeriods = {
  dayKey: string;
  monthKey: string;
  dayTtlSeconds: number;
  monthTtlSeconds: number;
  dailyRetryAfterSeconds: number;
};

export type AnonymousUsageIdentity = {
  sessionHash: string;
  inviteId: string;
  ipHash: string;
};

export type RateLimitResult =
  | { status: "allowed" }
  | { status: "user_limited" | "ip_limited"; retryAfterSeconds: number };

export type InvitationRateLimitResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number };

export type UsageReservationResult =
  | { status: "reserved"; warnedDay: boolean; warnedMonth: boolean }
  | { status: "daily_quota_exhausted"; retryAfterSeconds: number }
  | { status: "budget_reduced" | "budget_exhausted" };

export type ConcurrencyLeaseResult =
  | { status: "acquired"; leaseId: string }
  | { status: "busy"; retryAfterSeconds: number };

export interface BetaUsageStore {
  recordAiAttempt(input: {
    sessionHash: string;
    ipHash: string;
    requestId: string;
    nowMs: number;
    windowMs: number;
    userLimit: number;
    ipLimit: number;
  }): Promise<RateLimitResult>;
  recordInvitationAttempt(input: {
    ipHash: string;
    requestId: string;
    nowMs: number;
    windowMs: number;
    maxAttempts: number;
  }): Promise<InvitationRateLimitResult>;
  reserveUsage(input: {
    sessionHash: string;
    units: number;
    expensive: boolean;
    config: BetaUsageConfig;
    periods: UsagePeriods;
  }): Promise<UsageReservationResult>;
  acquireConcurrencyLease(input: {
    leaseId: string;
    nowMs: number;
    maxConcurrency: number;
    leaseTtlMs: number;
  }): Promise<ConcurrencyLeaseResult>;
  releaseConcurrencyLease(leaseId: string): Promise<void>;
  readBudgetUsage?(input: {
    dayKey: string;
    monthKey: string;
  }): Promise<{ dayCents: number; monthCents: number }>;
}

export type MeteredRequestContext = {
  endpoint: BetaAiEndpoint;
  identity: AnonymousUsageIdentity;
};
