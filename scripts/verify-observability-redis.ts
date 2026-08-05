import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

import { closeBetaRedisClient, getBetaRedisClient } from "../app/lib/beta-access/redis-client";
import { RedisAdminStore } from "../app/lib/admin/redis-store";
import { AdminService } from "../app/lib/admin/service";
import { hashAdminSecret } from "../app/lib/admin/tokens";
import { MetricsService } from "../app/lib/observability/metrics-service";
import { metricPeriodKeys } from "../app/lib/observability/periods";
import { RedisMetricsStore } from "../app/lib/observability/redis-metrics-store";
import type { AiRequestEvent } from "../app/lib/observability/types";

loadEnvConfig(process.cwd());

const nowMs = Date.now();
const suffix = randomUUID();
const metricsPrefix = `interview-studio:metrics:test:${suffix}`;
const adminPrefix = `interview-studio:admin:test:${suffix}`;
const accessToken = "admin_CANARY_ADMIN_TOKEN_SECRET_redis_test";
const accessTokenHash = hashAdminSecret(accessToken);

async function main() {
  const client = await getBetaRedisClient();
  const metrics = new MetricsService(
    new RedisMetricsStore(getBetaRedisClient, metricsPrefix),
    {
      hourlyRetentionHours: 2,
      dailyRetentionDays: 2,
      timezone: "Asia/Shanghai",
      activeSessionHmacSecret: "redis-test-observability-secret-value"
    },
    () => nowMs
  );
  const event: AiRequestEvent = {
    event: "ai_request_completed",
    request_id: randomUUID(),
    timestamp: new Date(nowMs).toISOString(),
    endpoint: "analyze",
    provider_kind: "chat",
    model: "redis-test-model",
    status: 200,
    status_class: "2xx",
    outcome: "success",
    duration_ms: 750,
    units: 1,
    estimated_cost_cents: 20,
    stream_state: "completed",
    retryable: false
  };
  await Promise.all([metrics.record(event, "session-one"), metrics.record(event, "session-one")]);
  const snapshot = await metrics.snapshot("today");
  assert.equal(snapshot.totals.requests, 2);
  assert.equal(snapshot.activeAnonymousSessions, 1);

  const periods = metricPeriodKeys(nowMs, "Asia/Shanghai");
  const metricKeys = [
    `${metricsPrefix}:hour:${periods.hourKey}`,
    `${metricsPrefix}:day:${periods.dayKey}`,
    `${metricsPrefix}:active:hour:${periods.hourKey}`,
    `${metricsPrefix}:active:day:${periods.dayKey}`
  ];
  assert.ok((await client.ttl(metricKeys[0])) > 0);
  assert.ok((await client.ttl(metricKeys[1])) > 0);
  const metricData = JSON.stringify(await client.hGetAll(metricKeys[1]));
  for (const marker of ["CANARY_RESUME_SECRET", "CANARY_RAW_IP", "session-one"]) {
    assert.equal(metricData.includes(marker), false);
  }

  const adminStore = new RedisAdminStore(getBetaRedisClient, adminPrefix);
  const admin = new AdminService(adminStore, {
    accessTokenHash,
    sessionHours: 1,
    ipHashSecret: "redis-admin-ip-secret-long-enough-value",
    production: false,
    loginWindowMs: 900000,
    loginMaxAttempts: 5
  }, () => nowMs);
  const login = await admin.login(accessToken);
  assert.equal(login.status, "authenticated");
  if (login.status !== "authenticated") throw new Error("Admin test session was not created.");
  assert.equal((await admin.validateSession(login.sessionToken)).status, "valid");
  await admin.logout(login.sessionToken);
  assert.equal((await admin.validateSession(login.sessionToken)).status, "invalid");

  const adminKeys = [
    `${adminPrefix}:session:${hashAdminSecret(login.sessionToken)}`,
    `${adminPrefix}:sessions:${accessTokenHash}`
  ];
  await client.del([...metricKeys, ...adminKeys]);
  console.log("Redis observability checks passed: atomic aggregates, TTL, HLL, hashed admin session, cleanup.");
}

void main()
  .catch(() => {
    console.error("Redis observability verification failed.");
    process.exitCode = 1;
  })
  .finally(closeBetaRedisClient);
