import assert from "node:assert/strict";

import { closeBetaRedisClient, getBetaRedisClient } from "../app/lib/beta-access/redis-client";
import { RedisBetaUsageStore } from "../app/lib/beta-usage/redis-store";
import { getBetaAccessService } from "../app/lib/beta-access/server";
import { currentPolicyVersion } from "../app/lib/compliance/config";

const baseUrl = process.env.BETA_ACCEPTANCE_BASE_URL || "http://app:3000";
const mode = process.argv[2] || "rate";

if (process.env.BETA_ACCEPTANCE_TEST !== "true") {
  throw new Error("BETA_ACCEPTANCE_TEST=true is required for destructive acceptance cleanup.");
}

type JsonBody = { code?: string; authenticated?: boolean };

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init);
}

async function json(response: Response) {
  return (await response.json()) as JsonBody;
}

function cookieFrom(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Redeem response must set a session cookie.");
  return setCookie.split(";", 1)[0];
}

async function redeem(code: string, ip: string) {
  const response = await request("/api/access/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": ip },
    body: JSON.stringify({
      invitation_code: code,
      accept_policies: true,
      policy_version: currentPolicyVersion()
    })
  });
  if (response.status !== 200) {
    const payload = await json(response.clone());
    throw new Error(`Redeem failed with HTTP ${response.status}, code=${payload.code || "UNKNOWN"}.`);
  }
  return cookieFrom(response);
}

async function analyze(cookie: string | null, ip: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Real-IP": ip
  };
  if (cookie) headers.Cookie = cookie;
  return request("/api/analyze", {
    method: "POST",
    headers,
    body: JSON.stringify({ answer: "" })
  });
}

async function customInterview(cookie: string, ip: string) {
  return request("/api/custom-interview", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": ip, Cookie: cookie },
    body: JSON.stringify({})
  });
}

async function cleanupUsageKeys() {
  const client = await getBetaRedisClient();
  let cursor = "0";
  do {
    const result = await client.scan(cursor, { MATCH: "interview-studio:usage:*", COUNT: 100 });
    cursor = result.cursor;
    if (result.keys.length) await client.del(result.keys);
  } while (cursor !== "0");
}

async function runRateChecks(code: string) {
  const missingConsent = await request("/api/access/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": "198.51.100.8" },
    body: JSON.stringify({ invitation_code: code, accept_policies: false, policy_version: currentPolicyVersion() })
  });
  assert.equal(missingConsent.status, 400);
  assert.equal((await json(missingConsent)).code, "BETA_POLICY_ACCEPTANCE_REQUIRED");

  const wrongVersion = await request("/api/access/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": "198.51.100.9" },
    body: JSON.stringify({ invitation_code: code, accept_policies: true, policy_version: "outdated-canary" })
  });
  assert.equal(wrongVersion.status, 400);
  assert.equal((await json(wrongVersion)).code, "BETA_POLICY_ACCEPTANCE_REQUIRED");

  const cookies = await Promise.all(
    Array.from({ length: 5 }, (_, index) => redeem(code, `198.51.100.${index + 1}`))
  );

  const unauthorized = await analyze(null, "198.51.100.90");
  assert.equal(unauthorized.status, 401);
  assert.equal((await json(unauthorized)).code, "BETA_ACCESS_REQUIRED");

  for (let index = 0; index < 3; index += 1) {
    assert.equal((await analyze(cookies[0], "198.51.100.20")).status, 400);
  }
  const userLimited = await analyze(cookies[0], "198.51.100.20");
  assert.equal(userLimited.status, 429);
  assert.equal((await json(userLimited)).code, "BETA_USER_RATE_LIMITED");
  assert.ok(userLimited.headers.get("Retry-After"));

  for (const cookie of cookies.slice(1, 4)) {
    assert.equal((await analyze(cookie, "198.51.100.30")).status, 400);
    assert.equal((await analyze(cookie, "198.51.100.30")).status, 400);
  }
  const ipLimited = await analyze(cookies[4], "198.51.100.30");
  assert.equal(ipLimited.status, 429);
  assert.equal((await json(ipLimited)).code, "BETA_IP_RATE_LIMITED");

  for (let index = 0; index < 5; index += 1) {
    const response = await request("/api/access/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Real-IP": "198.51.100.40" },
      body: JSON.stringify({ invitation_code: "invalid-acceptance-code", accept_policies: true, policy_version: currentPolicyVersion() })
    });
    assert.equal(response.status, 401);
  }
  const inviteLimited = await request("/api/access/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": "198.51.100.40" },
    body: JSON.stringify({ invitation_code: "invalid-acceptance-code", accept_policies: true, policy_version: currentPolicyVersion() })
  });
  assert.equal(inviteLimited.status, 429);
  assert.equal((await json(inviteLimited)).code, "BETA_INVITATION_RATE_LIMITED");

  const store = new RedisBetaUsageStore(getBetaRedisClient);
  const nowMs = Date.now();
  for (const leaseId of ["http-busy-1", "http-busy-2"]) {
    assert.equal(
      (
        await store.acquireConcurrencyLease({
          leaseId,
          nowMs,
          maxConcurrency: 2,
          leaseTtlMs: 60_000
        })
      ).status,
      "acquired"
    );
  }
  const busy = await analyze(cookies[4], "198.51.100.50");
  assert.equal(busy.status, 503);
  assert.equal((await json(busy)).code, "BETA_AI_BUSY");
  await Promise.all([
    store.releaseConcurrencyLease("http-busy-1"),
    store.releaseConcurrencyLease("http-busy-2")
  ]);

  assert.equal((await request("/api/health")).status, 200);
  console.log("HTTP rate checks passed: auth, user/IP RPM, invitation limiter, concurrency, health.");
}

async function runQuotaChecks(code: string) {
  const cookie = await redeem(code, "198.51.100.61");
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await analyze(cookie, "198.51.100.62")).status, 400);
  }
  const exhausted = await analyze(cookie, "198.51.100.62");
  assert.equal(exhausted.status, 429);
  assert.equal((await json(exhausted)).code, "BETA_DAILY_QUOTA_EXHAUSTED");
  console.log("HTTP quota check passed: daily unit exhaustion.");
}

async function runBudgetChecks(code: string) {
  const cookie = await redeem(code, "198.51.100.71");
  for (let index = 0; index < 7; index += 1) {
    assert.equal((await analyze(cookie, "198.51.100.72")).status, 400);
  }
  const reduced = await customInterview(cookie, "198.51.100.72");
  assert.equal(reduced.status, 503);
  assert.equal((await json(reduced)).code, "BETA_BUDGET_REDUCED");
  assert.equal((await analyze(cookie, "198.51.100.72")).status, 400);
  assert.equal((await analyze(cookie, "198.51.100.72")).status, 400);
  const exhausted = await analyze(cookie, "198.51.100.72");
  assert.equal(exhausted.status, 503);
  assert.equal((await json(exhausted)).code, "BETA_BUDGET_EXHAUSTED");
  console.log("HTTP budget checks passed: 90% reduction and 100% circuit breaker.");
}

async function runRedisUnavailableChecks() {
  const response = await analyze("interview_beta_session=acceptance-forged-nonsecret", "198.51.100.83");
  assert.equal(response.status, 503);
  assert.equal((await json(response)).code, "BETA_ACCESS_UNAVAILABLE");
  assert.equal((await request("/api/health")).status, 200);
  console.log("Redis unavailable check passed: protected API 503, public health 200.");
}

async function main() {
  if (mode === "redis-unavailable") {
    await runRedisUnavailableChecks();
    return;
  }

  await cleanupUsageKeys();
  const service = getBetaAccessService();
  const created = await service.createInvitation({
    maxUses: 20,
    expiresAtMs: Date.now() + 60 * 60 * 1000
  });
  try {
    if (mode === "rate") await runRateChecks(created.code);
    else if (mode === "quota") await runQuotaChecks(created.code);
    else if (mode === "budget") await runBudgetChecks(created.code);
    else throw new Error("Unknown acceptance mode.");
  } finally {
    try {
      await service.revokeInvitation(created.invitation.invite_id);
      await cleanupUsageKeys();
    } catch {
      // TTLs remain as a final fallback if cleanup cannot reach test Redis.
    }
    await closeBetaRedisClient();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown assertion";
  console.error(`HTTP beta usage acceptance failed: ${message}`);
  process.exitCode = 1;
});
