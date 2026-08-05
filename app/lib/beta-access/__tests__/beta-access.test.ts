import assert from "node:assert/strict";
import test from "node:test";
import { GET as healthCheck } from "../../../api/health/route";
import { requireBetaAccess } from "../api-auth";
import { sanitizeInternalNextPath } from "../redirect";
import { BetaAccessService } from "../service";
import { hashOpaqueSecret } from "../tokens";
import type {
  BetaAccessStore,
  BetaSessionRecord,
  InvitationRecord,
  RedeemStoreResult,
  ValidateSessionStoreResult
} from "../types";

class MemoryBetaAccessStore implements BetaAccessStore {
  readonly invitations = new Map<string, InvitationRecord>();
  readonly invitationIds = new Map<string, string>();
  readonly sessions = new Map<string, BetaSessionRecord>();
  readonly inviteSessions = new Map<string, Set<string>>();

  async createInvitation(invitation: InvitationRecord) {
    if (this.invitations.has(invitation.code_hash) || this.invitationIds.has(invitation.invite_id)) return false;
    this.invitations.set(invitation.code_hash, { ...invitation });
    this.invitationIds.set(invitation.invite_id, invitation.code_hash);
    return true;
  }

  async listInvitations() {
    return Array.from(this.invitations.values()).map((invitation) => ({ ...invitation }));
  }

  async disableInvitation(inviteId: string, nowMs: number) {
    const hash = this.invitationIds.get(inviteId);
    const invitation = hash ? this.invitations.get(hash) : undefined;
    if (!invitation) return false;
    invitation.status = "disabled";
    invitation.disabled_at_ms = nowMs;
    return true;
  }

  async revokeInvitation(inviteId: string, nowMs: number) {
    const hash = this.invitationIds.get(inviteId);
    const invitation = hash ? this.invitations.get(hash) : undefined;
    if (!hash || !invitation) return { found: false, revokedSessions: 0 };
    invitation.status = "revoked";
    invitation.revoked_at_ms = nowMs;
    const sessionHashes = this.inviteSessions.get(hash) ?? new Set<string>();
    sessionHashes.forEach((sessionHash) => this.sessions.delete(sessionHash));
    this.inviteSessions.delete(hash);
    return { found: true, revokedSessions: sessionHashes.size };
  }

  async redeemInvitation(input: {
    inviteHash: string;
    sessionHash: string;
    nowMs: number;
    sessionExpiresAtMs: number;
    policyVersion: string;
    policyAcceptedAtMs: number;
  }): Promise<RedeemStoreResult> {
    const invitation = this.invitations.get(input.inviteHash);
    if (!invitation) return { status: "invalid" };
    if (invitation.status !== "active") return { status: "disabled" };
    if (invitation.expires_at_ms !== null && invitation.expires_at_ms <= input.nowMs) return { status: "expired" };
    if (invitation.uses >= invitation.max_uses) return { status: "max_uses_reached" };

    invitation.uses += 1;
    this.sessions.set(input.sessionHash, {
      session_hash: input.sessionHash,
      invite_id: invitation.invite_id,
      invite_hash: input.inviteHash,
      created_at_ms: input.nowMs,
      expires_at_ms: input.sessionExpiresAtMs,
      accepted_policy_version: input.policyVersion,
      policy_accepted_at_ms: input.policyAcceptedAtMs
    });
    const sessionHashes = this.inviteSessions.get(input.inviteHash) ?? new Set<string>();
    sessionHashes.add(input.sessionHash);
    this.inviteSessions.set(input.inviteHash, sessionHashes);
    return { status: "redeemed" };
  }

  async validateSession(sessionHash: string, nowMs: number): Promise<ValidateSessionStoreResult> {
    const session = this.sessions.get(sessionHash);
    if (!session || session.expires_at_ms <= nowMs) return { status: "invalid" };
    const invitation = this.invitations.get(session.invite_hash);
    if (!invitation || invitation.status !== "active") return { status: "invalid" };
    if (invitation.expires_at_ms !== null && invitation.expires_at_ms <= nowMs) return { status: "invalid" };
    return { status: "valid", session: { ...session } };
  }

  async acceptSessionPolicy(input: {
    sessionHash: string;
    nowMs: number;
    policyVersion: string;
    policyAcceptedAtMs: number;
  }): Promise<ValidateSessionStoreResult> {
    const validated = await this.validateSession(input.sessionHash, input.nowMs);
    if (validated.status !== "valid") return validated;
    const session = this.sessions.get(input.sessionHash)!;
    session.accepted_policy_version = input.policyVersion;
    session.policy_accepted_at_ms = input.policyAcceptedAtMs;
    return { status: "valid", session: { ...session } };
  }

  async deleteSession(sessionHash: string) {
    const session = this.sessions.get(sessionHash);
    this.sessions.delete(sessionHash);
    if (session) this.inviteSessions.get(session.invite_hash)?.delete(sessionHash);
  }
}

function createFixture(options: { maxUses?: number; expiresAtMs?: number | null; sessionDays?: number } = {}) {
  let nowMs = 1_800_000_000_000;
  let sessionIndex = 0;
  const invitationCode = "beta_test_invitation_with_enough_entropy_123456";
  const store = new MemoryBetaAccessStore();
  const service = new BetaAccessService({
    store,
    sessionDays: options.sessionDays ?? 14,
    currentPolicyVersion: "v-test",
    now: () => nowMs,
    invitationCodeFactory: () => invitationCode,
    invitationIdFactory: () => "inv_test",
    sessionTokenFactory: () => `opaque-session-token-${++sessionIndex}-abcdefghijklmnopqrstuvwxyz`
  });

  return {
    store,
    service,
    invitationCode,
    now: () => nowMs,
    setNow: (value: number) => {
      nowMs = value;
    },
    redeem: (code = invitationCode) => service.redeemInvitation(code, { accepted: true, policyVersion: "v-test" }),
    create: () => service.createInvitation({ maxUses: options.maxUses, expiresAtMs: options.expiresAtMs })
  };
}

test("邀请码哈希后不保存明文", async () => {
  const fixture = createFixture();
  await fixture.create();
  const stored = JSON.stringify(Array.from(fixture.store.invitations.entries()));
  assert.equal(stored.includes(fixture.invitationCode), false);
  assert.equal(fixture.store.invitations.has(hashOpaqueSecret(fixture.invitationCode)), true);
});

test("正确邀请码可以兑换，Redis 替身只保存会话哈希", async () => {
  const fixture = createFixture();
  await fixture.create();
  const result = await fixture.redeem();
  assert.equal(result.status, "redeemed");
  if (result.status !== "redeemed") return;
  assert.equal(fixture.store.sessions.has(result.sessionToken), false);
  assert.equal(fixture.store.sessions.has(hashOpaqueSecret(result.sessionToken)), true);
  const storedSession = fixture.store.sessions.get(hashOpaqueSecret(result.sessionToken));
  assert.equal(storedSession?.accepted_policy_version, "v-test");
  assert.equal(storedSession?.policy_accepted_at_ms, fixture.now());
  const serialized = JSON.stringify(storedSession);
  assert.equal(serialized.includes(fixture.invitationCode), false);
  assert.equal(serialized.includes("raw_ip"), false);
});

test("未确认协议时服务端拒绝兑换且不消耗邀请码", async () => {
  const fixture = createFixture();
  await fixture.create();
  const result = await fixture.service.redeemInvitation(fixture.invitationCode, {
    accepted: false,
    policyVersion: "v-test"
  });
  assert.equal(result.status, "policy_not_accepted");
  assert.equal(fixture.store.invitations.get(hashOpaqueSecret(fixture.invitationCode))?.uses, 0);
  assert.equal(fixture.store.sessions.size, 0);
});

test("错误政策版本被服务端拒绝", async () => {
  const fixture = createFixture();
  await fixture.create();
  const result = await fixture.service.redeemInvitation(fixture.invitationCode, {
    accepted: true,
    policyVersion: "outdated-version"
  });
  assert.equal(result.status, "policy_not_accepted");
  assert.equal(fixture.store.sessions.size, 0);
});

test("旧会话与政策升级会要求重新确认，确认后恢复且不重复使用邀请码", async () => {
  const fixture = createFixture();
  await fixture.create();
  const redeemed = await fixture.redeem();
  assert.equal(redeemed.status, "redeemed");
  if (redeemed.status !== "redeemed") return;
  const sessionHash = hashOpaqueSecret(redeemed.sessionToken);
  const session = fixture.store.sessions.get(sessionHash)!;
  delete session.accepted_policy_version;
  delete session.policy_accepted_at_ms;
  assert.equal((await fixture.service.validateSession(redeemed.sessionToken)).status, "policy_acceptance_required");
  assert.equal((await fixture.service.acceptCurrentPolicy(redeemed.sessionToken, { accepted: true, policyVersion: "v-test" })).status, "valid");
  assert.equal((await fixture.service.validateSession(redeemed.sessionToken)).status, "valid");
  assert.equal(fixture.store.invitations.get(hashOpaqueSecret(fixture.invitationCode))?.uses, 1);
});

test("错误邀请码被拒绝", async () => {
  const fixture = createFixture();
  await fixture.create();
  assert.equal((await fixture.redeem("wrong-code")).status, "invalid");
});

test("过期邀请码被拒绝", async () => {
  const fixture = createFixture({ expiresAtMs: 1_800_000_001_000 });
  await fixture.create();
  fixture.setNow(1_800_000_002_000);
  assert.equal((await fixture.redeem()).status, "expired");
});

test("禁用邀请码被拒绝", async () => {
  const fixture = createFixture();
  const created = await fixture.create();
  await fixture.service.disableInvitation(created.invitation.invite_id);
  assert.equal((await fixture.redeem()).status, "disabled");
});

test("超过最大使用次数后被拒绝", async () => {
  const fixture = createFixture({ maxUses: 1 });
  await fixture.create();
  assert.equal((await fixture.redeem()).status, "redeemed");
  assert.equal((await fixture.redeem()).status, "max_uses_reached");
});

test("并发兑换不会突破最大使用次数", async () => {
  const fixture = createFixture({ maxUses: 3 });
  await fixture.create();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => fixture.redeem())
  );
  assert.equal(results.filter((result) => result.status === "redeemed").length, 3);
  assert.equal(fixture.store.invitations.get(hashOpaqueSecret(fixture.invitationCode))?.uses, 3);
});

test("有效会话可以通过鉴权", async () => {
  const fixture = createFixture();
  await fixture.create();
  const redeemed = await fixture.redeem();
  assert.equal(redeemed.status, "redeemed");
  if (redeemed.status !== "redeemed") return;
  assert.equal((await fixture.service.validateSession(redeemed.sessionToken)).status, "valid");
});

test("伪造会话令牌被拒绝", async () => {
  const fixture = createFixture();
  await fixture.create();
  assert.equal((await fixture.service.validateSession("forged-session-token")).status, "invalid");
});

test("过期会话被拒绝", async () => {
  const fixture = createFixture({ sessionDays: 1 });
  await fixture.create();
  const redeemed = await fixture.redeem();
  assert.equal(redeemed.status, "redeemed");
  if (redeemed.status !== "redeemed") return;
  fixture.setNow(fixture.now() + 24 * 60 * 60 * 1000 + 1);
  assert.equal((await fixture.service.validateSession(redeemed.sessionToken)).status, "invalid");
});

test("退出后会话立即失效", async () => {
  const fixture = createFixture();
  await fixture.create();
  const redeemed = await fixture.redeem();
  assert.equal(redeemed.status, "redeemed");
  if (redeemed.status !== "redeemed") return;
  await fixture.service.logout(redeemed.sessionToken);
  assert.equal((await fixture.service.validateSession(redeemed.sessionToken)).status, "invalid");
});

test("撤销邀请码后关联会话失效", async () => {
  const fixture = createFixture();
  const created = await fixture.create();
  const redeemed = await fixture.redeem();
  assert.equal(redeemed.status, "redeemed");
  if (redeemed.status !== "redeemed") return;
  const revoked = await fixture.service.revokeInvitation(created.invitation.invite_id);
  assert.equal(revoked.revokedSessions, 1);
  assert.equal((await fixture.service.validateSession(redeemed.sessionToken)).status, "invalid");
});

test("禁用邀请码后关联会话失效", async () => {
  const fixture = createFixture();
  const created = await fixture.create();
  const redeemed = await fixture.redeem();
  assert.equal(redeemed.status, "redeemed");
  if (redeemed.status !== "redeemed") return;
  await fixture.service.disableInvitation(created.invitation.invite_id);
  assert.equal((await fixture.service.validateSession(redeemed.sessionToken)).status, "invalid");
});

test("未登录业务 API 鉴权返回 401", async () => {
  const fixture = createFixture();
  const decision = await requireBetaAccess(new Request("http://localhost/api/analyze"), fixture.service);
  assert.equal(decision.status, "unauthorized");
  if (decision.status === "unauthorized") assert.equal(decision.response.status, 401);
});

test("Redis 异常时业务 API 默认拒绝并返回 503", async () => {
  const fixture = createFixture();
  fixture.store.validateSession = async () => {
    throw new Error("connection detail must not escape");
  };
  const request = new Request("http://localhost/api/analyze", {
    headers: { cookie: "interview_beta_session=opaque-token" }
  });
  const decision = await requireBetaAccess(request, fixture.service);
  assert.equal(decision.status, "unavailable");
  if (decision.status === "unavailable") {
    assert.equal(decision.response.status, 503);
    assert.equal((await decision.response.text()).includes("connection detail"), false);
  }
});

test("健康检查不需要邀请码", async () => {
  const response = healthCheck();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "interview-studio" });
});

test("next 参数只允许站内路径", () => {
  assert.equal(sanitizeInternalNextPath("/resume-studio?step=2"), "/resume-studio?step=2");
  assert.equal(sanitizeInternalNextPath("https://example.com"), "/");
  assert.equal(sanitizeInternalNextPath("//example.com"), "/");
  assert.equal(sanitizeInternalNextPath("/%2F%2Fexample.com"), "/");
  assert.equal(sanitizeInternalNextPath("/\\example.com"), "/");
});
