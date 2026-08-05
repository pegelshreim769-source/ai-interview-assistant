import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";

import { closeBetaRedisClient, getBetaRedisClient } from "../app/lib/beta-access/redis-client";
import { RedisBetaAccessStore } from "../app/lib/beta-access/redis-store";
import { BetaAccessService } from "../app/lib/beta-access/service";
import { hashOpaqueSecret } from "../app/lib/beta-access/tokens";

loadEnvConfig(process.cwd());

const suffix = randomBytes(12).toString("hex");
const code = `beta_compliance_${randomBytes(24).toString("base64url")}`;
const inviteId = `inv_compliance_${suffix}`;
const sessionToken = randomBytes(32).toString("base64url");
const inviteHash = hashOpaqueSecret(code);
const sessionHash = hashOpaqueSecret(sessionToken);

async function cleanup() {
  const client = await getBetaRedisClient();
  await client.del([
    `interview-studio:beta:invite:${inviteHash}`,
    `interview-studio:beta:invite-id:${inviteId}`,
    `interview-studio:beta:invite-sessions:${inviteHash}`,
    `interview-studio:beta:session:${sessionHash}`
  ]);
  await client.zRem("interview-studio:beta:invites", inviteId);
}

async function main() {
  const store = new RedisBetaAccessStore(getBetaRedisClient);
  const service = new BetaAccessService({
    store,
    currentPolicyVersion: "redis-compliance-v1",
    invitationCodeFactory: () => code,
    invitationIdFactory: () => inviteId,
    sessionTokenFactory: () => sessionToken
  });
  await service.createInvitation({ maxUses: 1, expiresAtMs: Date.now() + 60_000 });
  const redeemed = await service.redeemInvitation(code, {
    accepted: true,
    policyVersion: "redis-compliance-v1"
  });
  assert.equal(redeemed.status, "redeemed");

  const client = await getBetaRedisClient();
  const stored = await client.hGetAll(`interview-studio:beta:session:${sessionHash}`);
  assert.equal(stored.accepted_policy_version, "redis-compliance-v1");
  assert.ok(Number(stored.policy_accepted_at_ms) > 0);
  assert.equal(JSON.stringify(stored).includes(code), false);

  await client.hDel(`interview-studio:beta:session:${sessionHash}`, ["accepted_policy_version", "policy_accepted_at_ms"]);
  assert.equal((await service.validateSession(sessionToken)).status, "policy_acceptance_required");
  assert.equal((await service.acceptCurrentPolicy(sessionToken, { accepted: true, policyVersion: "redis-compliance-v1" })).status, "valid");
  assert.equal((await service.validateSession(sessionToken)).status, "valid");
  console.log("Redis compliance checks passed: policy metadata, legacy re-consent, hashed secrets, targeted cleanup.");
}

main()
  .catch(() => {
    console.error("Redis compliance verification failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await cleanup(); } catch { /* Exact test keys retain TTL or can be removed on the next isolated run. */ }
    await closeBetaRedisClient();
  });
