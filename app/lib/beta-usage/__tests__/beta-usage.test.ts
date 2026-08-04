import assert from "node:assert/strict";
import test from "node:test";

import { GET as healthCheck } from "../../../api/health/route";
import type { BetaAccessDecision } from "../../beta-access/api-auth";
import { createInvitationAttemptGuard, createMeteredBetaAccess } from "../api-guard";
import { readBetaUsageConfig } from "../config";
import { BETA_AI_ENDPOINTS } from "../costs";
import { normalizeIpAddress, resolveHashedClientIp } from "../identity";
import { getUsagePeriods } from "../periods";
import { BetaUsageService } from "../service";
import type {
  BetaUsageConfig,
  BetaUsageStore,
  ConcurrencyLeaseResult,
  InvitationRateLimitResult,
  RateLimitResult,
  UsageReservationResult
} from "../types";

class MemoryBetaUsageStore implements BetaUsageStore {
  readonly userAttempts = new Map<string, number[]>();
  readonly ipAttempts = new Map<string, number[]>();
  readonly invitationAttempts = new Map<string, number[]>();
  readonly userUnits = new Map<string, number>();
  readonly dailyBudget = new Map<string, number>();
  readonly monthlyBudget = new Map<string, number>();
  readonly warnedDays = new Set<string>();
  readonly warnedMonths = new Set<string>();
  readonly leases = new Map<string, number>();
  fail = false;

  private ensureAvailable() {
    if (this.fail) throw new Error("redis://internal:6379 secret failure");
  }

  async recordAiAttempt(input: Parameters<BetaUsageStore["recordAiAttempt"]>[0]): Promise<RateLimitResult> {
    this.ensureAvailable();
    const update = (map: Map<string, number[]>, key: string) => {
      const attempts = (map.get(key) ?? []).filter((time) => time > input.nowMs - input.windowMs);
      attempts.push(input.nowMs);
      map.set(key, attempts);
      return attempts.length;
    };
    const userCount = update(this.userAttempts, input.sessionHash);
    const ipCount = update(this.ipAttempts, input.ipHash);
    if (userCount > input.userLimit) return { status: "user_limited", retryAfterSeconds: 60 };
    if (ipCount > input.ipLimit) return { status: "ip_limited", retryAfterSeconds: 60 };
    return { status: "allowed" };
  }

  async recordInvitationAttempt(
    input: Parameters<BetaUsageStore["recordInvitationAttempt"]>[0]
  ): Promise<InvitationRateLimitResult> {
    this.ensureAvailable();
    const attempts = (this.invitationAttempts.get(input.ipHash) ?? []).filter(
      (time) => time > input.nowMs - input.windowMs
    );
    attempts.push(input.nowMs);
    this.invitationAttempts.set(input.ipHash, attempts);
    return attempts.length > input.maxAttempts
      ? { status: "limited", retryAfterSeconds: 600 }
      : { status: "allowed" };
  }

  async reserveUsage(input: Parameters<BetaUsageStore["reserveUsage"]>[0]): Promise<UsageReservationResult> {
    this.ensureAvailable();
    const userKey = `${input.sessionHash}:${input.periods.dayKey}`;
    const projectedUser = (this.userUnits.get(userKey) ?? 0) + input.units;
    const cost = input.units * input.config.estimatedCentsPerUnit;
    const projectedDay = (this.dailyBudget.get(input.periods.dayKey) ?? 0) + cost;
    const projectedMonth = (this.monthlyBudget.get(input.periods.monthKey) ?? 0) + cost;
    if (projectedUser > input.config.userDailyUnits) {
      return {
        status: "daily_quota_exhausted",
        retryAfterSeconds: input.periods.dailyRetryAfterSeconds
      };
    }
    if (
      projectedDay >= input.config.dailyBudgetCents ||
      projectedMonth >= input.config.monthlyBudgetCents
    ) {
      return { status: "budget_exhausted" };
    }
    if (
      input.expensive &&
      (projectedDay * 100 >= input.config.dailyBudgetCents * 90 ||
        projectedMonth * 100 >= input.config.monthlyBudgetCents * 90)
    ) {
      return { status: "budget_reduced" };
    }

    this.userUnits.set(userKey, projectedUser);
    this.dailyBudget.set(input.periods.dayKey, projectedDay);
    this.monthlyBudget.set(input.periods.monthKey, projectedMonth);
    let warnedDay = false;
    let warnedMonth = false;
    if (projectedDay * 100 >= input.config.dailyBudgetCents * 70 && !this.warnedDays.has(input.periods.dayKey)) {
      this.warnedDays.add(input.periods.dayKey);
      warnedDay = true;
    }
    if (
      projectedMonth * 100 >= input.config.monthlyBudgetCents * 70 &&
      !this.warnedMonths.has(input.periods.monthKey)
    ) {
      this.warnedMonths.add(input.periods.monthKey);
      warnedMonth = true;
    }
    return { status: "reserved", warnedDay, warnedMonth };
  }

  async acquireConcurrencyLease(
    input: Parameters<BetaUsageStore["acquireConcurrencyLease"]>[0]
  ): Promise<ConcurrencyLeaseResult> {
    this.ensureAvailable();
    this.leases.forEach((expiresAt, id) => {
      if (expiresAt <= input.nowMs) this.leases.delete(id);
    });
    if (this.leases.size >= input.maxConcurrency) return { status: "busy", retryAfterSeconds: 3 };
    this.leases.set(input.leaseId, input.nowMs + input.leaseTtlMs);
    return { status: "acquired", leaseId: input.leaseId };
  }

  async releaseConcurrencyLease(leaseId: string) {
    this.ensureAvailable();
    this.leases.delete(leaseId);
  }
}

const BASE_NOW = Date.parse("2026-08-04T04:00:00.000Z");

function testConfig(overrides: Partial<BetaUsageConfig> = {}): BetaUsageConfig {
  return {
    userAiRpm: 5,
    ipAiRpm: 20,
    userDailyUnits: 60,
    globalAiConcurrency: 8,
    estimatedCentsPerUnit: 20,
    dailyBudgetCents: 2000,
    monthlyBudgetCents: 30000,
    budgetTimezone: "Asia/Shanghai",
    ipHashSecret: "test-secret-that-is-long-enough-for-production",
    production: false,
    rateWindowMs: 60_000,
    invitationWindowMs: 600_000,
    invitationMaxAttempts: 5,
    concurrencyLeaseTtlMs: 600_000,
    ...overrides
  };
}

function authorized(sessionHash = "session-hash-a"): BetaAccessDecision {
  return {
    status: "authorized",
    session: {
      session_hash: sessionHash,
      invite_id: "invite-a",
      invite_hash: "invite-hash-a",
      created_at_ms: BASE_NOW,
      expires_at_ms: BASE_NOW + 86_400_000
    }
  };
}

function fixture(options: { config?: Partial<BetaUsageConfig>; sessionHash?: string } = {}) {
  let nowMs = BASE_NOW;
  let id = 0;
  const store = new MemoryBetaUsageStore();
  const warnings: string[] = [];
  const service = new BetaUsageService({
    store,
    config: testConfig(options.config),
    now: () => nowMs,
    idFactory: () => `opaque-${++id}`,
    warningLogger: (message) => warnings.push(message)
  });
  const guard = createMeteredBetaAccess({
    authenticate: async () => authorized(options.sessionHash),
    service: () => service,
    hashIp: () => "ip-hash-a"
  });
  return {
    store,
    service,
    warnings,
    guard,
    now: () => nowMs,
    setNow: (value: number) => {
      nowMs = value;
    }
  };
}

async function responseCode(response: Response) {
  return String(((await response.json()) as { code?: string }).code);
}

test("有效 Beta 会话能够进入费用保护器", async () => {
  const f = fixture();
  let called = 0;
  const post = f.guard({ endpoint: "analyze" }, async () => {
    called += 1;
    return Response.json({ ok: true });
  });
  assert.equal((await post(new Request("http://test/api/analyze"))).status, 200);
  assert.equal(called, 1);
});

test("不同会话拥有独立用户配额", async () => {
  const f = fixture({ config: { userDailyUnits: 1 } });
  const periods = getUsagePeriods(f.now(), f.service.config.budgetTimezone);
  assert.equal((await f.service.reserveUsage({ sessionHash: "a", inviteId: "i", ipHash: "p" }, BETA_AI_ENDPOINTS.analyze)).status, "reserved");
  assert.equal((await f.service.reserveUsage({ sessionHash: "b", inviteId: "i", ipHash: "p" }, BETA_AI_ENDPOINTS.analyze)).status, "reserved");
  assert.equal(f.store.userUnits.get(`a:${periods.dayKey}`), 1);
  assert.equal(f.store.userUnits.get(`b:${periods.dayKey}`), 1);
});

test("单用户超过分钟限制返回 429", async () => {
  const f = fixture({ config: { userAiRpm: 1 } });
  const post = f.guard({ endpoint: "analyze" }, () => Response.json({ ok: true }));
  await post(new Request("http://test/api/analyze"));
  const response = await post(new Request("http://test/api/analyze"));
  assert.equal(response.status, 429);
  assert.equal(await responseCode(response), "BETA_USER_RATE_LIMITED");
  assert.ok(response.headers.get("Retry-After"));
});

test("单 IP 超过分钟限制返回 429", async () => {
  let user = 0;
  const f = fixture({ config: { userAiRpm: 20, ipAiRpm: 1 } });
  const guard = createMeteredBetaAccess({
    authenticate: async () => authorized(`session-${++user}`),
    service: () => f.service,
    hashIp: () => "shared-ip-hash"
  });
  const post = guard({ endpoint: "analyze" }, () => Response.json({ ok: true }));
  await post(new Request("http://test/api/analyze"));
  const response = await post(new Request("http://test/api/analyze"));
  assert.equal(response.status, 429);
  assert.equal(await responseCode(response), "BETA_IP_RATE_LIMITED");
});

test("Redis 标识只保存 IP 的 HMAC，不保存原始 IP", async () => {
  const config = testConfig();
  const raw = "203.0.113.9";
  const hash = resolveHashedClientIp(new Request("http://test", { headers: { "x-real-ip": raw } }), config);
  const f = fixture();
  await f.store.recordInvitationAttempt({ ipHash: hash, requestId: "r", nowMs: f.now(), windowMs: 600000, maxAttempts: 5 });
  assert.equal(JSON.stringify(Array.from(f.store.invitationAttempts.keys())).includes(raw), false);
  assert.match(hash, /^[a-f0-9]{64}$/);
});

test("生产环境缺少 IP HMAC 密钥时默认拒绝配置", () => {
  assert.throws(() => readBetaUsageConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv));
});

test("IPv4、IPv6、本地开发和无效地址按明确规则处理", () => {
  assert.equal(normalizeIpAddress("203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeIpAddress("2001:0db8:0:0:0:0:0:1"), "2001:db8::1");
  assert.throws(() => normalizeIpAddress("not-an-ip"));
  assert.match(resolveHashedClientIp(new Request("http://test"), testConfig()), /^[a-f0-9]{64}$/);
  assert.throws(() =>
    resolveHashedClientIp(
      new Request("http://test", { headers: { "x-real-ip": "203.0.113.9, 10.0.0.1" } }),
      testConfig({ production: true })
    )
  );
});

test("用户每日费用单位正确累计并在超限时拒绝", async () => {
  const f = fixture({ config: { userDailyUnits: 3 } });
  const identity = { sessionHash: "u", inviteId: "i", ipHash: "p" };
  assert.equal((await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.custom_interview)).status, "reserved");
  const denied = await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.custom_interview);
  assert.equal(denied.status, "daily_quota_exhausted");
});

test("不同接口按集中配置扣减 1 或 2 单位", async () => {
  const f = fixture();
  const identity = { sessionHash: "u", inviteId: "i", ipHash: "p" };
  await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.analyze);
  await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.resume_studio);
  const day = getUsagePeriods(f.now(), "Asia/Shanghai").dayKey;
  assert.equal(f.store.userUnits.get(`u:${day}`), 3);
});

test("跨越上海自然日后用户额度重置", async () => {
  const f = fixture({ config: { userDailyUnits: 1 } });
  const identity = { sessionHash: "u", inviteId: "i", ipHash: "p" };
  assert.equal((await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.analyze)).status, "reserved");
  f.setNow(Date.parse("2026-08-04T16:00:01.000Z"));
  assert.equal((await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.analyze)).status, "reserved");
});

test("月预算周期在上海月界线正确切换", () => {
  assert.equal(getUsagePeriods(Date.parse("2026-08-31T15:59:59Z"), "Asia/Shanghai").monthKey, "2026-08");
  assert.equal(getUsagePeriods(Date.parse("2026-08-31T16:00:01Z"), "Asia/Shanghai").monthKey, "2026-09");
});

test("并发租约不能突破全站上限 8", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 9 }, () => f.service.acquireConcurrencyLease()));
  assert.equal(results.filter((item) => item.status === "acquired").length, 8);
  assert.equal(results.at(-1)?.status, "busy");
});

test("正常响应后释放并发租约", async () => {
  const f = fixture();
  const post = f.guard({ endpoint: "mock_interview" }, () => Response.json({ ok: true }));
  await post(new Request("http://test/api/mock-interview"));
  assert.equal(f.store.leases.size, 0);
});

test("Handler 抛错后释放租约且隐藏异常", async () => {
  const f = fixture();
  const post = f.guard({ endpoint: "mock_interview" }, () => {
    throw new Error("redis-key session-hash raw-ip");
  });
  const response = await post(new Request("http://test/api/mock-interview"));
  assert.equal(response.status, 500);
  assert.equal(f.store.leases.size, 0);
  assert.equal((await response.text()).includes("session-hash"), false);
});

test("流式响应结束后释放租约", async () => {
  const f = fixture();
  const post = f.guard({ endpoint: "analyze" }, () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("ok")); controller.close(); } })));
  const response = await post(new Request("http://test/api/analyze"));
  assert.equal(f.store.leases.size, 1);
  assert.equal(await response.text(), "ok");
  assert.equal(f.store.leases.size, 0);
});

test("流式响应取消后释放租约", async () => {
  const f = fixture();
  const post = f.guard({ endpoint: "analyze" }, () => new Response(new ReadableStream({ pull() {} })));
  const response = await post(new Request("http://test/api/analyze"));
  await response.body?.cancel("test-cancel");
  assert.equal(f.store.leases.size, 0);
});

test("过期租约可自动清理", async () => {
  const f = fixture({ config: { globalAiConcurrency: 1, concurrencyLeaseTtlMs: 1000 } });
  assert.equal((await f.service.acquireConcurrencyLease()).status, "acquired");
  f.setNow(f.now() + 1001);
  assert.equal((await f.service.acquireConcurrencyLease()).status, "acquired");
  assert.equal(f.store.leases.size, 1);
});

test("预算达到 70% 每个周期只产生一次脱敏警告", async () => {
  const f = fixture({ config: { estimatedCentsPerUnit: 35, dailyBudgetCents: 100, monthlyBudgetCents: 100 } });
  const identity = { sessionHash: "u", inviteId: "i", ipHash: "p" };
  await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.analyze);
  await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.analyze);
  await f.service.reserveUsage(identity, BETA_AI_ENDPOINTS.analyze);
  assert.equal(f.warnings.length, 2);
  assert.equal(f.warnings.join(" ").includes("session"), false);
});

test("预算达到 90% 时拒绝高费用功能", async () => {
  const f = fixture({ config: { estimatedCentsPerUnit: 10, dailyBudgetCents: 100, monthlyBudgetCents: 1000 } });
  const day = getUsagePeriods(f.now(), "Asia/Shanghai").dayKey;
  f.store.dailyBudget.set(day, 70);
  const result = await f.service.reserveUsage({ sessionHash: "u", inviteId: "i", ipHash: "p" }, BETA_AI_ENDPOINTS.resume_studio);
  assert.equal(result.status, "budget_reduced");
});

test("90% 降级通过统一 HTTP 503 中文错误返回", async () => {
  const f = fixture({ config: { estimatedCentsPerUnit: 10, dailyBudgetCents: 100, monthlyBudgetCents: 1000 } });
  f.store.dailyBudget.set(getUsagePeriods(f.now(), "Asia/Shanghai").dayKey, 70);
  const post = f.guard({ endpoint: "resume_studio" }, () => Response.json({ ok: true }));
  const response = await post(new Request("http://test/api/resume-studio"));
  assert.equal(response.status, 503);
  assert.equal(await responseCode(response), "BETA_BUDGET_REDUCED");
});

test("预算达到 90% 时仍允许低费用功能", async () => {
  const f = fixture({ config: { estimatedCentsPerUnit: 5, dailyBudgetCents: 100, monthlyBudgetCents: 1000 } });
  const day = getUsagePeriods(f.now(), "Asia/Shanghai").dayKey;
  f.store.dailyBudget.set(day, 90);
  assert.equal((await f.service.reserveUsage({ sessionHash: "u", inviteId: "i", ipHash: "p" }, BETA_AI_ENDPOINTS.analyze)).status, "reserved");
});

test("预算达到 100% 时拒绝全部 AI 请求", async () => {
  const f = fixture({ config: { estimatedCentsPerUnit: 10, dailyBudgetCents: 100 } });
  const day = getUsagePeriods(f.now(), "Asia/Shanghai").dayKey;
  f.store.dailyBudget.set(day, 90);
  assert.equal((await f.service.reserveUsage({ sessionHash: "u", inviteId: "i", ipHash: "p" }, BETA_AI_ENDPOINTS.analyze)).status, "budget_exhausted");
});

test("100% 熔断通过统一 HTTP 503 错误返回", async () => {
  const f = fixture({ config: { estimatedCentsPerUnit: 10, dailyBudgetCents: 100 } });
  f.store.dailyBudget.set(getUsagePeriods(f.now(), "Asia/Shanghai").dayKey, 90);
  const post = f.guard({ endpoint: "analyze" }, () => Response.json({ ok: true }));
  const response = await post(new Request("http://test/api/analyze"));
  assert.equal(response.status, 503);
  assert.equal(await responseCode(response), "BETA_BUDGET_EXHAUSTED");
});

test("每日或每月任一预算达到阈值都会熔断", async () => {
  const f = fixture({ config: { estimatedCentsPerUnit: 10, dailyBudgetCents: 1000, monthlyBudgetCents: 100 } });
  const month = getUsagePeriods(f.now(), "Asia/Shanghai").monthKey;
  f.store.monthlyBudget.set(month, 90);
  assert.equal((await f.service.reserveUsage({ sessionHash: "u", inviteId: "i", ipHash: "p" }, BETA_AI_ENDPOINTS.analyze)).status, "budget_exhausted");
});

test("预算检查和扣减在并发下不突破硬上限", async () => {
  const f = fixture({ config: { estimatedCentsPerUnit: 10, dailyBudgetCents: 100 } });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => f.service.reserveUsage({ sessionHash: `u${i}`, inviteId: "i", ipHash: "p" }, BETA_AI_ENDPOINTS.analyze)));
  const day = getUsagePeriods(f.now(), "Asia/Shanghai").dayKey;
  assert.ok((f.store.dailyBudget.get(day) ?? 0) < 100);
  assert.ok(results.some((result) => result.status === "budget_exhausted"));
});

test("邀请码兑换 10 分钟超过 5 次后返回 429", async () => {
  const f = fixture();
  const guard = createInvitationAttemptGuard({ service: () => f.service, hashIp: () => "invite-ip-hash" });
  for (let index = 0; index < 5; index += 1) assert.equal(await guard(new Request("http://test/api/access/redeem")), null);
  const response = await guard(new Request("http://test/api/access/redeem"));
  assert.equal(response?.status, 429);
  assert.equal(response && (await responseCode(response)), "BETA_INVITATION_RATE_LIMITED");
});

test("限流失败后不调用业务 Handler 且不扣费用", async () => {
  const f = fixture({ config: { userAiRpm: 1 } });
  let called = 0;
  const post = f.guard({ endpoint: "mock_interview" }, () => { called += 1; return Response.json({ ok: true }); });
  await post(new Request("http://test/api/mock-interview"));
  await post(new Request("http://test/api/mock-interview"));
  assert.equal(called, 1);
  const day = getUsagePeriods(f.now(), "Asia/Shanghai").dayKey;
  assert.equal(f.store.userUnits.get(`session-hash-a:${day}`), 1);
});

test("参数错误请求仍计入分钟计数和预扣费用", async () => {
  const f = fixture();
  const post = f.guard({ endpoint: "custom_interview" }, () => Response.json({ error: "bad input" }, { status: 400 }));
  assert.equal((await post(new Request("http://test/api/custom-interview"))).status, 400);
  assert.equal(f.store.userAttempts.get("session-hash-a")?.length, 1);
  const day = getUsagePeriods(f.now(), "Asia/Shanghai").dayKey;
  assert.equal(f.store.userUnits.get(`session-hash-a:${day}`), 2);
});

test("Redis 异常时默认拒绝 AI 请求", async () => {
  const f = fixture();
  f.store.fail = true;
  let called = false;
  const post = f.guard({ endpoint: "analyze" }, () => { called = true; return Response.json({ ok: true }); });
  const response = await post(new Request("http://test/api/analyze"));
  assert.equal(response.status, 503);
  assert.equal(called, false);
  assert.equal(await responseCode(response), "BETA_USAGE_UNAVAILABLE");
});

test("sessions 路由不属于费用接口配置", () => {
  assert.equal("sessions" in BETA_AI_ENDPOINTS, false);
});

test("health 保持公开且不受费用保护", async () => {
  const response = healthCheck();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "interview-studio" });
});

test("统一错误不泄露原始 IP、会话哈希、Redis 或异常详情", async () => {
  const f = fixture();
  f.store.fail = true;
  const post = f.guard({ endpoint: "analyze" }, () => Response.json({ ok: true }));
  const response = await post(new Request("http://test/api/analyze"));
  const body = await response.text();
  assert.equal(/203\.0\.113|session-hash|redis|internal:6379/i.test(body), false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("非法生产限额不能静默变成无限额度", () => {
  assert.throws(() => readBetaUsageConfig({ NODE_ENV: "production", BETA_IP_HASH_SECRET: "x".repeat(40), BETA_USER_AI_RPM: "0" } as NodeJS.ProcessEnv));
  assert.throws(() => readBetaUsageConfig({ NODE_ENV: "production", BETA_IP_HASH_SECRET: "x".repeat(40), BETA_DAILY_AI_BUDGET_CNY: "NaN" } as NodeJS.ProcessEnv));
});
