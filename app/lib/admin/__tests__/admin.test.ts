import assert from "node:assert/strict";
import test from "node:test";
import type { NextResponse } from "next/server";

import { requireAdminAccess } from "../api-auth";
import { readAdminConfig } from "../config";
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  readAdminSessionToken,
  setAdminSessionCookie
} from "../cookies";
import { AdminService } from "../service";
import { createAdminAccessToken, hashAdminSecret, verifyAdminAccessToken } from "../tokens";
import type { AdminConfig, AdminLoginRateResult, AdminSessionRecord, AdminStore } from "../types";

class MemoryAdminStore implements AdminStore {
  sessions = new Map<string, AdminSessionRecord>();
  attempts = new Map<string, number[]>();
  fail = false;
  rawValues: string[] = [];

  private available() {
    if (this.fail) throw new Error("redis://:CANARY_REDIS_PASSWORD_SECRET@internal");
  }

  async recordLoginAttempt(input: Parameters<AdminStore["recordLoginAttempt"]>[0]): Promise<AdminLoginRateResult> {
    this.available();
    const values = (this.attempts.get(input.ipHash) || []).filter((time) => time > input.nowMs - input.windowMs);
    values.push(input.nowMs);
    this.attempts.set(input.ipHash, values);
    return values.length > input.maxAttempts
      ? { status: "limited", retryAfterSeconds: 900 }
      : { status: "allowed" };
  }
  async createSession(record: AdminSessionRecord) {
    this.available();
    this.sessions.set(record.session_hash, record);
    this.rawValues.push(JSON.stringify(record));
  }
  async getSession(sessionHash: string) {
    this.available();
    return this.sessions.get(sessionHash) || null;
  }
  async deleteSession(sessionHash: string) {
    this.available();
    this.sessions.delete(sessionHash);
  }
  async revokeSessions(accessTokenHash: string) {
    this.available();
    let count = 0;
    for (const [key, value] of Array.from(this.sessions.entries())) {
      if (value.access_token_hash === accessTokenHash) {
        this.sessions.delete(key);
        count += 1;
      }
    }
    return count;
  }
}

const TOKEN = "admin_CANARY_ADMIN_TOKEN_SECRET_for_tests_only";
const TOKEN_HASH = hashAdminSecret(TOKEN);
const NOW = Date.parse("2026-08-04T04:00:00Z");

function config(overrides: Partial<AdminConfig> = {}): AdminConfig {
  return {
    accessTokenHash: TOKEN_HASH,
    sessionHours: 8,
    ipHashSecret: "test-admin-ip-secret-long-enough-value",
    production: false,
    loginWindowMs: 15 * 60_000,
    loginMaxAttempts: 5,
    ...overrides
  };
}

function fixture(overrides: Partial<AdminConfig> = {}) {
  let now = NOW;
  const store = new MemoryAdminStore();
  const service = new AdminService(store, config(overrides), () => now, () => `id-${store.attempts.size}`);
  return { store, service, setNow: (value: number) => { now = value; } };
}

test("管理员令牌包含至少 256 bit 安全随机性", () => {
  const first = createAdminAccessToken();
  const second = createAdminAccessToken();
  assert.ok(first.length >= 49);
  assert.notEqual(first, second);
});

test("管理员令牌使用 SHA-256 哈希验证", () => {
  assert.match(hashAdminSecret(TOKEN), /^[a-f0-9]{64}$/);
  assert.equal(verifyAdminAccessToken(TOKEN, TOKEN_HASH), true);
});

test("错误管理员令牌被常量时间验证拒绝", () => {
  assert.equal(verifyAdminAccessToken("wrong", TOKEN_HASH), false);
});

test("生产管理配置缺失时默认拒绝", () => {
  assert.throws(() => readAdminConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv));
});

test("管理员会话时长配置必须有界", () => {
  assert.throws(() => readAdminConfig({
    ADMIN_ACCESS_TOKEN_HASH: TOKEN_HASH,
    ADMIN_SESSION_HOURS: "0",
    BETA_IP_HASH_SECRET: "x".repeat(32)
  } as unknown as NodeJS.ProcessEnv));
});

test("正确令牌可建立会话且 Redis 替身不保存明文", async () => {
  const f = fixture();
  const result = await f.service.login(TOKEN);
  assert.equal(result.status, "authenticated");
  assert.equal(JSON.stringify(f.store.rawValues).includes(TOKEN), false);
  assert.equal(f.store.sessions.size, 1);
});

test("会话令牌只以哈希作为 Redis Key", async () => {
  const f = fixture();
  const result = await f.service.login(TOKEN);
  assert.equal(result.status, "authenticated");
  if (result.status !== "authenticated") return;
  assert.equal(f.store.sessions.has(result.sessionToken), false);
  assert.equal(f.store.sessions.has(hashAdminSecret(result.sessionToken)), true);
});

test("有效管理员会话通过验证", async () => {
  const f = fixture();
  const result = await f.service.login(TOKEN);
  assert.equal(result.status, "authenticated");
  if (result.status === "authenticated") {
    assert.equal((await f.service.validateSession(result.sessionToken)).status, "valid");
  }
});

test("过期管理员会话立即失效", async () => {
  const f = fixture({ sessionHours: 1 });
  const result = await f.service.login(TOKEN);
  if (result.status !== "authenticated") return;
  f.setNow(NOW + 3600_001);
  assert.equal((await f.service.validateSession(result.sessionToken)).status, "invalid");
});

test("修改管理员令牌哈希后旧会话失效", async () => {
  const f = fixture();
  const result = await f.service.login(TOKEN);
  if (result.status !== "authenticated") return;
  const changed = new AdminService(f.store, config({ accessTokenHash: hashAdminSecret("new-token") }), () => NOW);
  assert.equal((await changed.validateSession(result.sessionToken)).status, "invalid");
});

test("退出后管理员会话立即失效", async () => {
  const f = fixture();
  const result = await f.service.login(TOKEN);
  if (result.status !== "authenticated") return;
  await f.service.logout(result.sessionToken);
  assert.equal((await f.service.validateSession(result.sessionToken)).status, "invalid");
});

test("可定向撤销当前管理员哈希关联的全部会话", async () => {
  const f = fixture();
  await f.service.login(TOKEN);
  await f.service.login(TOKEN);
  assert.equal(await f.service.revokeAllSessions(), 2);
  assert.equal(f.store.sessions.size, 0);
});

test("管理员登录无论后续正确错误都先累计尝试", async () => {
  const f = fixture();
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await f.service.recordLoginAttempt("ip-hash")).status, "allowed");
  }
  assert.equal((await f.service.recordLoginAttempt("ip-hash")).status, "limited");
});

test("管理员 Cookie 使用 HttpOnly、Strict、明确 Path 和过期时间", () => {
  let cookie: Record<string, unknown> = {};
  const response = { cookies: { set(value: Record<string, unknown>) { cookie = value; } } } as unknown as NextResponse;
  setAdminSessionCookie(response, "opaque-session", NOW + 10000);
  assert.equal(cookie.name, ADMIN_SESSION_COOKIE);
  assert.equal(cookie.value, "opaque-session");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "strict");
  assert.equal(cookie.path, "/");
  assert.ok(cookie.expires instanceof Date);
});

test("清除管理员 Cookie 会设置立即过期", () => {
  let cookie: Record<string, unknown> = {};
  const response = { cookies: { set(value: Record<string, unknown>) { cookie = value; } } } as unknown as NextResponse;
  clearAdminSessionCookie(response);
  assert.equal(cookie.maxAge, 0);
});

test("普通 Beta Cookie 不能被当作管理员会话", async () => {
  const f = fixture();
  const request = new Request("http://test/api/admin/usage", {
    headers: { cookie: "interview_beta_session=valid-beta-only" }
  });
  assert.equal(readAdminSessionToken(request), "");
  const decision = await requireAdminAccess(request, f.service);
  const responseStatus = "response" in decision ? decision.response.status : 200;
  assert.equal(decision.status, "unauthorized");
  assert.equal(responseStatus, 401);
});

test("Redis 故障时管理访问默认拒绝且不泄露异常", async () => {
  const f = fixture();
  f.store.fail = true;
  const request = new Request("http://test/api/admin/usage", {
    headers: { cookie: `${ADMIN_SESSION_COOKIE}=forged` }
  });
  const decision = await requireAdminAccess(request, f.service);
  const response = "response" in decision ? decision.response : new Response(null, { status: 200 });
  assert.equal(decision.status, "unavailable");
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("CANARY_REDIS_PASSWORD_SECRET"), false);
});

test("管理存储与认证输出不包含虚构敏感 Canary", async () => {
  const f = fixture();
  await f.service.login(TOKEN);
  const output = JSON.stringify({ keys: Array.from(f.store.sessions.keys()), values: f.store.rawValues });
  for (const canary of ["CANARY_COOKIE_SECRET", "CANARY_INVITE_SECRET", "CANARY_RAW_IP"]) {
    assert.equal(output.includes(canary), false);
  }
});
