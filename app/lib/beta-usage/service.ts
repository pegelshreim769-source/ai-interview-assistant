import "server-only";

import { randomBytes } from "node:crypto";

import { getUsagePeriods } from "./periods";
import type {
  AnonymousUsageIdentity,
  BetaUsageConfig,
  BetaUsageStore,
  ConcurrencyLeaseResult,
  InvitationRateLimitResult,
  RateLimitResult,
  UsageReservationResult
} from "./types";
import type { BetaAiEndpointPolicy } from "./costs";

type BetaUsageServiceOptions = {
  store: BetaUsageStore;
  config: BetaUsageConfig;
  now?: () => number;
  idFactory?: () => string;
  warningLogger?: (message: string) => void;
};

export class BetaUsageService {
  readonly config: BetaUsageConfig;
  private readonly store: BetaUsageStore;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly warningLogger: (message: string) => void;

  constructor(options: BetaUsageServiceOptions) {
    this.store = options.store;
    this.config = options.config;
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => randomBytes(16).toString("hex"));
    this.warningLogger = options.warningLogger ?? ((message) => console.warn(message));
  }

  recordAiAttempt(identity: AnonymousUsageIdentity): Promise<RateLimitResult> {
    const nowMs = this.now();
    return this.store.recordAiAttempt({
      sessionHash: identity.sessionHash,
      ipHash: identity.ipHash,
      requestId: this.idFactory(),
      nowMs,
      windowMs: this.config.rateWindowMs,
      userLimit: this.config.userAiRpm,
      ipLimit: this.config.ipAiRpm
    });
  }

  recordInvitationAttempt(ipHash: string): Promise<InvitationRateLimitResult> {
    return this.store.recordInvitationAttempt({
      ipHash,
      requestId: this.idFactory(),
      nowMs: this.now(),
      windowMs: this.config.invitationWindowMs,
      maxAttempts: this.config.invitationMaxAttempts
    });
  }

  acquireConcurrencyLease(): Promise<ConcurrencyLeaseResult> {
    const leaseId = this.idFactory();
    return this.store.acquireConcurrencyLease({
      leaseId,
      nowMs: this.now(),
      maxConcurrency: this.config.globalAiConcurrency,
      leaseTtlMs: this.config.concurrencyLeaseTtlMs
    });
  }

  async reserveUsage(
    identity: AnonymousUsageIdentity,
    policy: BetaAiEndpointPolicy
  ): Promise<UsageReservationResult> {
    const periods = getUsagePeriods(this.now(), this.config.budgetTimezone);
    const result = await this.store.reserveUsage({
      sessionHash: identity.sessionHash,
      units: policy.units,
      expensive: policy.expensive,
      config: this.config,
      periods
    });

    if (result.status === "reserved") {
      if (result.warnedDay) {
        this.warningLogger(`[beta-usage] 日预算进入 warning 状态：${periods.dayKey}`);
      }
      if (result.warnedMonth) {
        this.warningLogger(`[beta-usage] 月预算进入 warning 状态：${periods.monthKey}`);
      }
    }
    return result;
  }

  async releaseConcurrencyLease(leaseId: string) {
    await this.store.releaseConcurrencyLease(leaseId);
  }
}
