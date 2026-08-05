import "server-only";

import { getBetaRedisClient } from "../beta-access/redis-client";
import { readMetricsConfig } from "./config";
import { MetricsService } from "./metrics-service";
import { RedisMetricsStore } from "./redis-metrics-store";

const globalForMetrics = globalThis as typeof globalThis & { metricsService?: MetricsService };

export function getMetricsService() {
  if (!globalForMetrics.metricsService) {
    globalForMetrics.metricsService = new MetricsService(
      new RedisMetricsStore(getBetaRedisClient),
      readMetricsConfig()
    );
  }
  return globalForMetrics.metricsService;
}
