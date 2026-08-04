import "server-only";

import { getBetaRedisClient } from "../beta-access/redis-client";
import { readBetaUsageConfig } from "./config";
import { RedisBetaUsageStore } from "./redis-store";
import { BetaUsageService } from "./service";

const globalForBetaUsage = globalThis as typeof globalThis & {
  betaUsageService?: BetaUsageService;
};

export function getBetaUsageService() {
  if (!globalForBetaUsage.betaUsageService) {
    globalForBetaUsage.betaUsageService = new BetaUsageService({
      store: new RedisBetaUsageStore(getBetaRedisClient),
      config: readBetaUsageConfig()
    });
  }
  return globalForBetaUsage.betaUsageService;
}
