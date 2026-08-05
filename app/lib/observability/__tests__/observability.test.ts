import assert from "node:assert/strict";
import test from "node:test";

import type { BetaAccessDecision } from "../../beta-access/api-auth";
import { createMeteredBetaAccess } from "../../beta-usage/api-guard";
import { BETA_AI_ENDPOINTS } from "../../beta-usage/costs";
import { BetaUsageService } from "../../beta-usage/service";
import type { BetaUsageConfig, BetaUsageStore } from "../../beta-usage/types";
import { readMetricsConfig } from "../config";
import { createSafeLogger } from "../logger";
import { approximateP95, MetricsService } from "../metrics-service";
import { metricPeriodKeys } from "../periods";
import { sanitizeErrorCode, sanitizeModelName } from "../redaction";
import { createServerRequestId, withRequestId } from "../request-id";
import { createRequestObserver, type ObservationFinalState, type RequestObserver } from "../request-observer";
import type { AiRequestEvent, MetricsStore } from "../types";

class MemoryMetricsStore implements MetricsStore {
  writes: Array<Parameters<MetricsStore["record"]>[0]> = [];
  daily = new Map<string, Record<string, string>>();
  active = new Map<string, Set<string>>();
  fail = false;

  async record(input: Parameters<MetricsStore["record"]>[0]) {
    if (this.fail) throw new Error("CANARY_REDIS_PASSWORD_SECRET");
    this.writes.push(input);
    const values = this.daily.get(input.dayKey) || {};
    for (const [field, value] of Object.entries(input.increments)) {
      values[field] = String(Number(values[field] || 0) + value);
    }
    for (const [field, value] of Object.entries(input.maxima)) {
      values[field] = String(Math.max(Number(values[field] || 0), value));
    }
    this.daily.set(input.dayKey, values);
    if (input.activeSessionId) {
      const set = this.active.get(input.dayKey) || new Set<string>();
      set.add(input.activeSessionId);
      this.active.set(input.dayKey, set);
    }
  }
  async readDaily(keys: string[]) {
    return keys.map((period) => ({ period, values: this.daily.get(period) || {} }));
  }
  async countActiveDaily(keys: string[]) {
    const union = new Set(keys.flatMap((key) => Array.from(this.active.get(key) || [])));
    return union.size;
  }
}

const NOW = Date.parse("2026-08-04T04:00:00Z");
const metricsConfig = {
  hourlyRetentionHours: 168,
  dailyRetentionDays: 90,
  timezone: "Asia/Shanghai",
  activeSessionHmacSecret: "test-secret-long-enough-for-metrics-hmac"
};

function event(overrides: Partial<AiRequestEvent> = {}): AiRequestEvent {
  return {
    event: "ai_request_completed",
    request_id: "00000000-0000-4000-8000-000000000001",
    timestamp: new Date(NOW).toISOString(),
    endpoint: "analyze",
    provider_kind: "chat",
    model: "test-model",
    status: 200,
    status_class: "2xx",
    outcome: "success",
    duration_ms: 800,
    units: 1,
    estimated_cost_cents: 20,
    stream_state: "not_streaming",
    retryable: false,
    ...overrides
  };
}

test("服务端请求 ID 是随机 UUID", () => {
  const first = createServerRequestId();
  const second = createServerRequestId();
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
});

test("客户端伪造请求 ID 不参与服务端生成", () => {
  const request = new Request("http://test", { headers: { "x-request-id": "CANARY_REQUEST_ID" } });
  assert.notEqual(createServerRequestId(), request.headers.get("x-request-id"));
});

test("统一响应附带 X-Request-ID 且错误不缓存", () => {
  const response = withRequestId(Response.json({ error: "x" }, { status: 503 }), "server-id");
  assert.equal(response.headers.get("x-request-id"), "server-id");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("结构化日志严格使用字段白名单", () => {
  const lines: string[] = [];
  createSafeLogger((line) => lines.push(line))({ ...event(), unknown: "CANARY_RESUME_SECRET" } as AiRequestEvent);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes("CANARY_RESUME_SECRET"), false);
  assert.deepEqual(Object.keys(JSON.parse(lines[0])).sort(), [
    "duration_ms", "endpoint", "estimated_cost_cents", "event", "model", "outcome",
    "provider_kind", "request_id", "retryable", "status", "status_class", "stream_state",
    "timestamp", "units"
  ].sort());
});

test("未知错误码统一脱敏为 INTERNAL_ERROR", () => {
  assert.equal(sanitizeErrorCode("provider said CANARY_API_KEY_SECRET"), "INTERNAL_ERROR");
});

test("模型名只接受受限服务端配置格式", () => {
  assert.equal(sanitizeModelName("kimi-k2.5"), "kimi-k2.5");
  assert.equal(sanitizeModelName("bad model\nCANARY_JD_SECRET"), "redacted-model");
});

test("指标保留配置具有安全默认值", () => {
  const config = readMetricsConfig({ BETA_IP_HASH_SECRET: "x".repeat(32) } as unknown as NodeJS.ProcessEnv);
  assert.equal(config.hourlyRetentionHours, 168);
  assert.equal(config.dailyRetentionDays, 90);
});

test("非法指标保留配置不会变成无限保留", () => {
  assert.throws(() => readMetricsConfig({
    BETA_IP_HASH_SECRET: "x".repeat(32),
    BETA_METRICS_DAILY_RETENTION_DAYS: "0"
  } as unknown as NodeJS.ProcessEnv));
});

test("生产环境缺少指标 HMAC 密钥时默认拒绝配置", () => {
  assert.throws(() => readMetricsConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv));
});

test("小时与自然日 Key 使用上海时区", () => {
  assert.deepEqual(metricPeriodKeys(Date.parse("2026-08-03T16:30:00Z"), "Asia/Shanghai"), {
    dayKey: "2026-08-04",
    hourKey: "2026-08-04T00"
  });
});

test("一次事件原子写入小时和每日聚合并设置 TTL", async () => {
  const store = new MemoryMetricsStore();
  const service = new MetricsService(store, metricsConfig, () => NOW);
  await service.record(event(), "session-hash");
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].hourlyTtlSeconds, 168 * 3600);
  assert.equal(store.writes[0].dailyTtlSeconds, 90 * 86400);
  assert.equal(store.writes[0].increments.requests, 1);
});

test("活跃会话写入二次 HMAC 而非完整 session_hash", async () => {
  const store = new MemoryMetricsStore();
  await new MetricsService(store, metricsConfig, () => NOW).record(event(), "CANARY_SESSION_HASH");
  const serialized = JSON.stringify(store.writes);
  assert.equal(serialized.includes("CANARY_SESSION_HASH"), false);
  assert.match(store.writes[0].activeSessionId || "", /^[a-f0-9]{64}$/);
});

test("同一匿名会话在日活中去重", async () => {
  const store = new MemoryMetricsStore();
  const service = new MetricsService(store, metricsConfig, () => NOW);
  await service.record(event(), "same-session");
  await service.record(event(), "same-session");
  assert.equal((await service.snapshot("today")).activeAnonymousSessions, 1);
});

test("不同匿名会话分别计入日活", async () => {
  const store = new MemoryMetricsStore();
  const service = new MetricsService(store, metricsConfig, () => NOW);
  await service.record(event(), "one");
  await service.record(event(), "two");
  assert.equal((await service.snapshot("today")).activeAnonymousSessions, 2);
});

test("费用单位、估算费用和错误码正确累计", async () => {
  const store = new MemoryMetricsStore();
  const service = new MetricsService(store, metricsConfig, () => NOW);
  await service.record(event({ endpoint: "resume_studio", units: 2, estimated_cost_cents: 40 }), "one");
  await service.record(event({ status: 429, status_class: "4xx", outcome: "rejected", units: 0, estimated_cost_cents: 0, error_code: "BETA_USER_RATE_LIMITED" }), "one");
  const snapshot = await service.snapshot("today");
  assert.equal(snapshot.totals.requests, 2);
  assert.equal(snapshot.totals.units, 2);
  assert.equal(snapshot.totals.estimatedCostCents, 40);
  assert.equal(snapshot.totals.status429, 1);
  assert.equal(snapshot.errors[0].code, "BETA_USER_RATE_LIMITED");
});

test("接口与模型维度独立聚合", async () => {
  const store = new MemoryMetricsStore();
  const service = new MetricsService(store, metricsConfig, () => NOW);
  await service.record(event({ endpoint: "custom_interview", model: "chat-model", units: 2 }), "one");
  const snapshot = await service.snapshot("today");
  assert.equal(snapshot.endpoints.find((row) => row.key === "custom_interview")?.requests, 1);
  assert.equal(snapshot.models.find((row) => row.key === "chat-model")?.requests, 1);
});

test("鉴权和限流拒绝不会被误计为模型调用", async () => {
  const store = new MemoryMetricsStore();
  const service = new MetricsService(store, metricsConfig, () => NOW);
  await service.record(event({
    status: 401,
    status_class: "4xx",
    outcome: "rejected",
    units: 0,
    estimated_cost_cents: 0,
    error_code: "BETA_ACCESS_REQUIRED"
  }));
  const snapshot = await service.snapshot("today");
  assert.equal(snapshot.totals.requests, 1);
  assert.equal(snapshot.models.length, 0);
});

test("延迟分桶和近似 P95 正确", async () => {
  const store = new MemoryMetricsStore();
  const service = new MetricsService(store, metricsConfig, () => NOW);
  for (let index = 0; index < 19; index += 1) await service.record(event({ duration_ms: 400 }), "one");
  await service.record(event({ duration_ms: 2500 }), "one");
  const totals = (await service.snapshot("today")).totals;
  assert.equal(totals.latencyBuckets[0], 19);
  assert.equal(approximateP95(totals), 500);
});

test("跨日汇总保留最大延迟而不是求和", async () => {
  const store = new MemoryMetricsStore();
  store.daily.set("2026-08-03", { requests: "1", durationMsMax: "900" });
  store.daily.set("2026-08-04", { requests: "1", durationMsMax: "700" });
  const snapshot = await new MetricsService(store, metricsConfig, () => NOW).snapshot("7d");
  assert.equal(snapshot.totals.durationMsMax, 900);
});

test("成功请求最多记录一次最终事件", async () => {
  const events: string[] = [];
  const store = new MemoryMetricsStore();
  const observer = createRequestObserver({
    requestId: "request-1",
    endpoint: "analyze",
    policy: BETA_AI_ENDPOINTS.analyze,
    estimatedCentsPerUnit: 20,
    startedAtMs: NOW,
    now: () => NOW + 20,
    metrics: () => new MetricsService(store, metricsConfig, () => NOW),
    logger: (value) => events.push(JSON.stringify(value))
  });
  await observer.finish({ status: 200, charged: true });
  await observer.finish({ status: 500, errorCode: "INTERNAL_ERROR", charged: true });
  assert.equal(events.length, 1);
  assert.equal(store.writes.length, 1);
});

test("指标写入失败不会让观察器抛错或泄露异常", async () => {
  const store = new MemoryMetricsStore();
  store.fail = true;
  const lines: string[] = [];
  const observer = createRequestObserver({
    requestId: "request-2",
    endpoint: "analyze",
    policy: BETA_AI_ENDPOINTS.analyze,
    estimatedCentsPerUnit: 20,
    metrics: () => new MetricsService(store, metricsConfig),
    logger: (value) => lines.push(JSON.stringify(value))
  });
  await assert.doesNotReject(observer.finish({ status: 200, charged: true }));
  assert.equal(lines.join("").includes("CANARY_REDIS_PASSWORD_SECRET"), false);
});

class AllowUsageStore implements BetaUsageStore {
  releases = 0;
  async recordAiAttempt() { return { status: "allowed" as const }; }
  async recordInvitationAttempt() { return { status: "allowed" as const }; }
  async reserveUsage() { return { status: "reserved" as const, warnedDay: false, warnedMonth: false }; }
  async acquireConcurrencyLease() { return { status: "acquired" as const, leaseId: "lease" }; }
  async releaseConcurrencyLease() { this.releases += 1; }
}

function guardFixture() {
  const store = new AllowUsageStore();
  const config: BetaUsageConfig = {
    userAiRpm: 5, ipAiRpm: 20, userDailyUnits: 60, globalAiConcurrency: 8,
    estimatedCentsPerUnit: 20, dailyBudgetCents: 2000, monthlyBudgetCents: 30000,
    budgetTimezone: "Asia/Shanghai", ipHashSecret: "x".repeat(32), production: false,
    rateWindowMs: 60000, invitationWindowMs: 600000, invitationMaxAttempts: 5,
    concurrencyLeaseTtlMs: 600000
  };
  const service = new BetaUsageService({ store, config });
  const finalStates: ObservationFinalState[] = [];
  let attached = "";
  let resolveFinal!: () => void;
  const finalized = new Promise<void>((resolve) => { resolveFinal = resolve; });
  const observer: RequestObserver = {
    attachSession(value) { attached = value; },
    async finish(value) { finalStates.push(value); resolveFinal(); }
  };
  const access: BetaAccessDecision = {
    status: "authorized",
    session: { session_hash: "session-a", invite_id: "invite-a", invite_hash: "hash", created_at_ms: NOW, expires_at_ms: NOW + 10000 }
  };
  const guard = createMeteredBetaAccess({
    authenticate: async () => access,
    service: () => service,
    hashIp: () => "ip-hash",
    observe: () => observer
  });
  return { guard, store, finalStates, finalized, attached: () => attached };
}

test("费用保护统一响应使用服务端请求 ID", async () => {
  const fixture = guardFixture();
  const post = fixture.guard({ endpoint: "mock_interview" }, () => Response.json({ ok: true }));
  const response = await post(new Request("http://test", { headers: { "x-request-id": "forged" } }));
  assert.match(response.headers.get("x-request-id") || "", /^[0-9a-f-]{36}$/);
  assert.notEqual(response.headers.get("x-request-id"), "forged");
  assert.equal(fixture.attached(), "session-a");
});

test("流式响应结束后记录 completed 且只释放一次", async () => {
  const fixture = guardFixture();
  const post = fixture.guard({ endpoint: "analyze" }, () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("ok")); controller.close(); } }), { headers: { "content-type": "text/event-stream" } }));
  await (await post(new Request("http://test"))).text();
  await fixture.finalized;
  assert.equal(fixture.finalStates[0].streamState, "completed");
  assert.equal(fixture.store.releases, 1);
});

test("流式响应取消后记录 cancelled 且只释放一次", async () => {
  const fixture = guardFixture();
  const post = fixture.guard({ endpoint: "analyze" }, () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array([1])); } }), { headers: { "content-type": "text/event-stream" } }));
  const reader = (await post(new Request("http://test"))).body!.getReader();
  await reader.read();
  await reader.cancel("test");
  await fixture.finalized;
  assert.equal(fixture.finalStates[0].streamState, "cancelled");
  assert.equal(fixture.store.releases, 1);
});

test("流式响应异常后记录 failed 且不泄露异常", async () => {
  const fixture = guardFixture();
  const post = fixture.guard({ endpoint: "analyze" }, () => new Response(new ReadableStream({ pull(controller) { controller.error(new Error("CANARY_ANSWER_SECRET")); } }), { headers: { "content-type": "text/event-stream" } }));
  await assert.rejects((await post(new Request("http://test"))).text());
  await fixture.finalized;
  assert.deepEqual(fixture.finalStates[0], { status: 500, errorCode: "STREAM_FAILED", charged: true, streamState: "failed" });
  assert.equal(JSON.stringify(fixture.finalStates).includes("CANARY_ANSWER_SECRET"), false);
});
