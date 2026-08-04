import {
  createInvitationCode,
  createInvitationId,
  createSessionToken,
  hashOpaqueSecret,
  normalizeInvitationCode
} from "./tokens";
import type {
  BetaAccessStore,
  CreateInvitationInput,
  InvitationRecord,
  RedeemInvitationResult,
  ValidateSessionResult
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

type BetaAccessServiceOptions = {
  store: BetaAccessStore;
  sessionDays?: number;
  now?: () => number;
  invitationCodeFactory?: () => string;
  invitationIdFactory?: () => string;
  sessionTokenFactory?: () => string;
};

function normalizePositiveInteger(value: number | undefined, fallback: number, label: string) {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new Error(`${label}必须是大于 0 的整数。`);
  }
  return normalized;
}

export class BetaAccessService {
  private readonly store: BetaAccessStore;
  private readonly sessionDays: number;
  private readonly now: () => number;
  private readonly invitationCodeFactory: () => string;
  private readonly invitationIdFactory: () => string;
  private readonly sessionTokenFactory: () => string;

  constructor(options: BetaAccessServiceOptions) {
    this.store = options.store;
    this.sessionDays = normalizePositiveInteger(options.sessionDays, 14, "会话有效天数");
    this.now = options.now ?? Date.now;
    this.invitationCodeFactory = options.invitationCodeFactory ?? createInvitationCode;
    this.invitationIdFactory = options.invitationIdFactory ?? createInvitationId;
    this.sessionTokenFactory = options.sessionTokenFactory ?? createSessionToken;
  }

  async createInvitation(input: CreateInvitationInput = {}) {
    const nowMs = this.now();
    const maxUses = normalizePositiveInteger(input.maxUses, 1, "最大使用次数");
    const expiresAtMs = input.expiresAtMs ?? null;

    if (expiresAtMs !== null && (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs)) {
      throw new Error("邀请码有效期必须晚于当前时间。");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = this.invitationCodeFactory();
      const invitation: InvitationRecord = {
        invite_id: this.invitationIdFactory(),
        code_hash: hashOpaqueSecret(normalizeInvitationCode(code)),
        status: "active",
        created_at_ms: nowMs,
        expires_at_ms: expiresAtMs,
        max_uses: maxUses,
        uses: 0,
        disabled_at_ms: null,
        revoked_at_ms: null
      };

      if (await this.store.createInvitation(invitation)) {
        return { code, invitation };
      }
    }

    throw new Error("邀请码生成失败，请重试。");
  }

  listInvitations() {
    return this.store.listInvitations();
  }

  disableInvitation(inviteId: string) {
    return this.store.disableInvitation(inviteId, this.now());
  }

  revokeInvitation(inviteId: string) {
    return this.store.revokeInvitation(inviteId, this.now());
  }

  async redeemInvitation(rawCode: string): Promise<RedeemInvitationResult> {
    const code = normalizeInvitationCode(rawCode);
    if (!code || code.length > 512) return { status: "invalid" };

    const nowMs = this.now();
    const sessionToken = this.sessionTokenFactory();
    const sessionExpiresAtMs = nowMs + this.sessionDays * DAY_MS;
    const result = await this.store.redeemInvitation({
      inviteHash: hashOpaqueSecret(code),
      sessionHash: hashOpaqueSecret(sessionToken),
      nowMs,
      sessionExpiresAtMs
    });

    if (result.status !== "redeemed") return result;
    return { status: "redeemed", sessionToken, expiresAtMs: sessionExpiresAtMs };
  }

  validateSession(sessionToken: string): Promise<ValidateSessionResult> {
    if (!sessionToken || sessionToken.length > 512) return Promise.resolve({ status: "invalid" });
    return this.store.validateSession(hashOpaqueSecret(sessionToken), this.now());
  }

  async logout(sessionToken: string) {
    if (!sessionToken || sessionToken.length > 512) return;
    await this.store.deleteSession(hashOpaqueSecret(sessionToken));
  }
}
