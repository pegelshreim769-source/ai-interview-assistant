import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";

import { closeBetaRedisClient, getBetaRedisClient } from "../app/lib/beta-access/redis-client";
import { readBetaUsageConfig } from "../app/lib/beta-usage/config";
import { getUsagePeriods } from "../app/lib/beta-usage/periods";
import { RedisBetaUsageStore } from "../app/lib/beta-usage/redis-store";

loadEnvConfig(process.cwd());

const namespace = `interview-studio:usage-test:${randomBytes(8).toString("hex")}`;

async function cleanup() {
  const client = await getBetaRedisClient();
  let cursor = "0";
  do {
    const result = await client.scan(cursor, { MATCH: `${namespace}:*`, COUNT: 100 });
    cursor = result.cursor;
    if (result.keys.length) await client.del(result.keys);
  } while (cursor !== "0");
}

async function main() {
  const store = new RedisBetaUsageStore(getBetaRedisClient, namespace);
  const nowMs = Date.now();
  const config = readBetaUsageConfig(process.env, { production: false });

  const firstAttempt = await store.recordAiAttempt({
    sessionHash: "session-hash-test",
    ipHash: "ip-hash-test",
    requestId: "request-1",
    nowMs,
    windowMs: 60_000,
    userLimit: 1,
    ipLimit: 20
  });
  const secondAttempt = await store.recordAiAttempt({
    sessionHash: "session-hash-test",
    ipHash: "ip-hash-test",
    requestId: "request-2",
    nowMs: nowMs + 1,
    windowMs: 60_000,
    userLimit: 1,
    ipLimit: 20
  });
  assert.equal(firstAttempt.status, "allowed");
  assert.equal(secondAttempt.status, "user_limited");

  for (let index = 0; index < 5; index += 1) {
    assert.equal(
      (
        await store.recordInvitationAttempt({
          ipHash: "invitation-ip-hash-test",
          requestId: `invite-${index}`,
          nowMs: nowMs + index,
          windowMs: 600_000,
          maxAttempts: 5
        })
      ).status,
      "allowed"
    );
  }
  assert.equal(
    (
      await store.recordInvitationAttempt({
        ipHash: "invitation-ip-hash-test",
        requestId: "invite-6",
        nowMs: nowMs + 6,
        windowMs: 600_000,
        maxAttempts: 5
      })
    ).status,
    "limited"
  );

  const periods = getUsagePeriods(nowMs, config.budgetTimezone);
  assert.equal(
    (
      await store.reserveUsage({
        sessionHash: "quota-session-hash-test",
        units: 1,
        expensive: false,
        config: { ...config, userDailyUnits: 1 },
        periods
      })
    ).status,
    "reserved"
  );
  assert.equal(
    (
      await store.reserveUsage({
        sessionHash: "quota-session-hash-test",
        units: 1,
        expensive: false,
        config: { ...config, userDailyUnits: 1 },
        periods
      })
    ).status,
    "daily_quota_exhausted"
  );

  assert.equal(
    (
      await store.acquireConcurrencyLease({
        leaseId: "lease-1",
        nowMs,
        maxConcurrency: 1,
        leaseTtlMs: 60_000
      })
    ).status,
    "acquired"
  );
  assert.equal(
    (
      await store.acquireConcurrencyLease({
        leaseId: "lease-2",
        nowMs,
        maxConcurrency: 1,
        leaseTtlMs: 60_000
      })
    ).status,
    "busy"
  );
  await store.releaseConcurrencyLease("lease-1");

  const concurrentLeases = await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      store.acquireConcurrencyLease({
        leaseId: `concurrent-lease-${index}`,
        nowMs: nowMs + 10,
        maxConcurrency: 8,
        leaseTtlMs: 60_000
      })
    )
  );
  const acquiredLeases = concurrentLeases.filter((result) => result.status === "acquired");
  assert.equal(acquiredLeases.length, 8);
  await Promise.all(
    acquiredLeases.map((result) =>
      result.status === "acquired" ? store.releaseConcurrencyLease(result.leaseId) : Promise.resolve()
    )
  );

  assert.equal(
    (
      await store.acquireConcurrencyLease({
        leaseId: "expiring-lease",
        nowMs: nowMs + 20,
        maxConcurrency: 1,
        leaseTtlMs: 50
      })
    ).status,
    "acquired"
  );
  assert.equal(
    (
      await store.acquireConcurrencyLease({
        leaseId: "post-expiry-lease",
        nowMs: nowMs + 71,
        maxConcurrency: 1,
        leaseTtlMs: 50
      })
    ).status,
    "acquired"
  );
  await store.releaseConcurrencyLease("post-expiry-lease");

  const atomicPeriods = {
    ...periods,
    dayKey: `${periods.dayKey}-atomic-test`,
    monthKey: `${periods.monthKey}-atomic-test`
  };
  const atomicReservations = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      store.reserveUsage({
        sessionHash: `atomic-session-${index}`,
        units: 1,
        expensive: false,
        config: {
          ...config,
          estimatedCentsPerUnit: 10,
          dailyBudgetCents: 100,
          monthlyBudgetCents: 1000
        },
        periods: atomicPeriods
      })
    )
  );
  assert.equal(atomicReservations.filter((result) => result.status === "reserved").length, 9);
  assert.equal(
    atomicReservations.filter((result) => result.status === "budget_exhausted").length,
    11
  );

  console.log("Redis 费用保护原子操作验证通过。");
}

main()
  .catch(() => {
    console.error("Redis 费用保护验证失败。请检查 REDIS_URL 和 Redis 状态。");
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch {
      // Redis may be unreachable before the temporary namespace is created.
    } finally {
      await closeBetaRedisClient();
    }
  });
