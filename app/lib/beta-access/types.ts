export type InvitationStatus = "active" | "disabled" | "revoked";

export type InvitationRecord = {
  invite_id: string;
  code_hash: string;
  status: InvitationStatus;
  created_at_ms: number;
  expires_at_ms: number | null;
  max_uses: number;
  uses: number;
  disabled_at_ms: number | null;
  revoked_at_ms: number | null;
};

export type BetaSessionRecord = {
  session_hash: string;
  invite_id: string;
  invite_hash: string;
  created_at_ms: number;
  expires_at_ms: number;
};

export type RedeemStoreResult =
  | { status: "redeemed" }
  | { status: "invalid" | "expired" | "disabled" | "max_uses_reached" };

export type ValidateSessionStoreResult =
  | { status: "valid"; session: BetaSessionRecord }
  | { status: "invalid" };

export interface BetaAccessStore {
  createInvitation(invitation: InvitationRecord): Promise<boolean>;
  listInvitations(): Promise<InvitationRecord[]>;
  disableInvitation(inviteId: string, nowMs: number): Promise<boolean>;
  revokeInvitation(inviteId: string, nowMs: number): Promise<{ found: boolean; revokedSessions: number }>;
  redeemInvitation(input: {
    inviteHash: string;
    sessionHash: string;
    nowMs: number;
    sessionExpiresAtMs: number;
  }): Promise<RedeemStoreResult>;
  validateSession(sessionHash: string, nowMs: number): Promise<ValidateSessionStoreResult>;
  deleteSession(sessionHash: string): Promise<void>;
}

export type CreateInvitationInput = {
  expiresAtMs?: number | null;
  maxUses?: number;
};

export type RedeemInvitationResult =
  | { status: "redeemed"; sessionToken: string; expiresAtMs: number }
  | { status: "invalid" | "expired" | "disabled" | "max_uses_reached" };

export type ValidateSessionResult =
  | { status: "valid"; session: BetaSessionRecord }
  | { status: "invalid" };
