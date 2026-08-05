import "server-only";

import { getBetaRedisClient } from "./redis-client";
import { RedisBetaAccessStore } from "./redis-store";
import { BetaAccessService } from "./service";
import { currentPolicyVersion } from "../compliance/config";

function readSessionDays() {
  const value = Number(process.env.BETA_SESSION_DAYS || "14");
  if (!Number.isSafeInteger(value) || value < 1 || value > 90) return 14;
  return value;
}

const globalForBetaAccess = globalThis as typeof globalThis & {
  betaAccessService?: BetaAccessService;
};

export function getBetaAccessService() {
  if (!globalForBetaAccess.betaAccessService) {
    globalForBetaAccess.betaAccessService = new BetaAccessService({
      store: new RedisBetaAccessStore(getBetaRedisClient),
      sessionDays: readSessionDays(),
      currentPolicyVersion: currentPolicyVersion()
    });
  }
  return globalForBetaAccess.betaAccessService;
}
