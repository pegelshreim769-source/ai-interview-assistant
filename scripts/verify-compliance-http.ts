import assert from "node:assert/strict";

import { closeBetaRedisClient, getBetaRedisClient } from "../app/lib/beta-access/redis-client";
import { currentPolicyVersion } from "../app/lib/compliance/config";

const baseUrl = process.env.BETA_ACCEPTANCE_BASE_URL || "http://app:3000";
const canary = "CANARY_TASK4_PRIVATE_INPUT_7f3b9d2e";

if (process.env.BETA_ACCEPTANCE_TEST !== "true") {
  throw new Error("BETA_ACCEPTANCE_TEST=true is required for compliance HTTP verification.");
}

async function jsonRequest(path: string, body: unknown, ip: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": ip },
    body: JSON.stringify(body)
  });
}

async function redisContainsCanary() {
  const client = await getBetaRedisClient();
  let cursor = "0";
  do {
    const result = await client.scan(cursor, { MATCH: "interview-studio:*", COUNT: 100 });
    cursor = result.cursor;
    for (const key of result.keys) {
      if (key.includes(canary)) return true;
      const type = await client.type(key);
      let value: unknown = null;
      if (type === "string") value = await client.get(key);
      else if (type === "hash") value = await client.hGetAll(key);
      else if (type === "set") value = await client.sMembers(key);
      else if (type === "zset") value = await client.zRange(key, 0, -1);
      else if (type === "list") value = await client.lRange(key, 0, -1);
      if (JSON.stringify(value).includes(canary)) return true;
    }
  } while (cursor !== "0");
  return false;
}

async function main() {
  for (const path of ["/privacy", "/terms", "/rights", "/ai-disclosure", "/access"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, `${path} must be public.`);
    const html = await response.text();
    assert.equal(html.includes(canary), false);
    assert.equal(html.includes("/privacy"), true);
    assert.equal(html.includes("/terms"), true);
    assert.equal(html.includes("/rights"), true);
    assert.equal(html.includes("/ai-disclosure"), true);
  }

  const accessHtml = await (await fetch(`${baseUrl}/access`)).text();
  assert.equal(accessHtml.includes("type=\"checkbox\""), true);
  assert.equal(accessHtml.includes("disabled"), true);

  const missingConsent = await jsonRequest(
    "/api/access/redeem",
    { invitation_code: "fictional", accept_policies: false, policy_version: currentPolicyVersion() },
    "198.51.100.101"
  );
  assert.equal(missingConsent.status, 400);
  assert.equal((await missingConsent.json() as { code?: string }).code, "BETA_POLICY_ACCEPTANCE_REQUIRED");

  const wrongVersion = await jsonRequest(
    "/api/access/redeem",
    { invitation_code: "fictional", accept_policies: true, policy_version: "outdated-policy" },
    "198.51.100.102"
  );
  assert.equal(wrongVersion.status, 400);

  const canaryResponse = await jsonRequest(
    "/api/access/redeem",
    { invitation_code: canary, accept_policies: true, policy_version: currentPolicyVersion() },
    "198.51.100.103"
  );
  assert.equal(canaryResponse.status, 401);
  const canaryError = await canaryResponse.text();
  assert.equal(canaryError.includes(canary), false);

  const adminResponse = await fetch(`${baseUrl}/api/admin/usage`);
  assert.equal(adminResponse.status, 401);
  assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
  assert.equal(await redisContainsCanary(), false);

  console.log("Compliance HTTP checks passed: public pages, consent API, admin isolation, Canary redaction, Redis boundaries.");
}

main()
  .catch(() => {
    console.error("Compliance HTTP verification failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBetaRedisClient();
  });
