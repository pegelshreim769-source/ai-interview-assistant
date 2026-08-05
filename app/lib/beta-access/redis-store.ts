import "server-only";

import type { BetaRedisClient } from "./redis-client";
import type {
  BetaAccessStore,
  BetaSessionRecord,
  InvitationRecord,
  InvitationStatus,
  RedeemStoreResult,
  ValidateSessionStoreResult
} from "./types";

const PREFIX = "interview-studio:beta";
const INVITATION_LIST_KEY = `${PREFIX}:invites`;

const invitationKey = (hash: string) => `${PREFIX}:invite:${hash}`;
const invitationIdKey = (id: string) => `${PREFIX}:invite-id:${id}`;
const invitationSessionsKey = (hash: string) => `${PREFIX}:invite-sessions:${hash}`;
const sessionKey = (hash: string) => `${PREFIX}:session:${hash}`;

const CREATE_INVITATION_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then
  return 0
end
redis.call('HSET', KEYS[1],
  'invite_id', ARGV[1],
  'status', 'active',
  'created_at_ms', ARGV[2],
  'expires_at_ms', ARGV[3],
  'max_uses', ARGV[4],
  'uses', '0',
  'disabled_at_ms', '',
  'revoked_at_ms', '')
redis.call('SET', KEYS[2], ARGV[5])
redis.call('ZADD', KEYS[3], ARGV[2], ARGV[1])
return 1
`;

const REDEEM_INVITATION_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local status = redis.call('HGET', KEYS[1], 'status')
if status ~= 'active' then return 3 end
local expiresAt = redis.call('HGET', KEYS[1], 'expires_at_ms')
if expiresAt and expiresAt ~= '' and tonumber(expiresAt) <= tonumber(ARGV[1]) then return 2 end
local maxUses = tonumber(redis.call('HGET', KEYS[1], 'max_uses') or '0')
local uses = tonumber(redis.call('HGET', KEYS[1], 'uses') or '0')
if uses >= maxUses then return 4 end
local inviteId = redis.call('HGET', KEYS[1], 'invite_id')
redis.call('HINCRBY', KEYS[1], 'uses', 1)
redis.call('HSET', KEYS[2],
  'invite_id', inviteId,
  'invite_hash', ARGV[2],
  'created_at_ms', ARGV[1],
  'expires_at_ms', ARGV[3],
  'accepted_policy_version', ARGV[5],
  'policy_accepted_at_ms', ARGV[6])
redis.call('PEXPIREAT', KEYS[2], ARGV[3])
redis.call('SADD', KEYS[3], ARGV[4])
redis.call('PEXPIREAT', KEYS[3], ARGV[3])
return 1
`;

const VALIDATE_SESSION_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {0} end
local sessionExpiresAt = redis.call('HGET', KEYS[1], 'expires_at_ms')
if not sessionExpiresAt or tonumber(sessionExpiresAt) <= tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return {0}
end
local inviteHash = redis.call('HGET', KEYS[1], 'invite_hash')
if not inviteHash then return {0} end
local inviteKey = ARGV[2] .. inviteHash
if redis.call('EXISTS', inviteKey) == 0 then return {0} end
if redis.call('HGET', inviteKey, 'status') ~= 'active' then return {0} end
local inviteExpiresAt = redis.call('HGET', inviteKey, 'expires_at_ms')
if inviteExpiresAt and inviteExpiresAt ~= '' and tonumber(inviteExpiresAt) <= tonumber(ARGV[1]) then return {0} end
return {1,
  redis.call('HGET', KEYS[1], 'invite_id'),
  inviteHash,
  redis.call('HGET', KEYS[1], 'created_at_ms'),
  sessionExpiresAt,
  redis.call('HGET', KEYS[1], 'accepted_policy_version') or '',
  redis.call('HGET', KEYS[1], 'policy_accepted_at_ms') or ''}
`;

const ACCEPT_SESSION_POLICY_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {0} end
local sessionExpiresAt = redis.call('HGET', KEYS[1], 'expires_at_ms')
if not sessionExpiresAt or tonumber(sessionExpiresAt) <= tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return {0}
end
local inviteHash = redis.call('HGET', KEYS[1], 'invite_hash')
if not inviteHash then return {0} end
local inviteKey = ARGV[2] .. inviteHash
if redis.call('EXISTS', inviteKey) == 0 then return {0} end
if redis.call('HGET', inviteKey, 'status') ~= 'active' then return {0} end
local inviteExpiresAt = redis.call('HGET', inviteKey, 'expires_at_ms')
if inviteExpiresAt and inviteExpiresAt ~= '' and tonumber(inviteExpiresAt) <= tonumber(ARGV[1]) then return {0} end
redis.call('HSET', KEYS[1],
  'accepted_policy_version', ARGV[3],
  'policy_accepted_at_ms', ARGV[4])
return {1,
  redis.call('HGET', KEYS[1], 'invite_id'),
  inviteHash,
  redis.call('HGET', KEYS[1], 'created_at_ms'),
  sessionExpiresAt,
  ARGV[3],
  ARGV[4]}
`;

const DELETE_SESSION_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local inviteHash = redis.call('HGET', KEYS[1], 'invite_hash')
redis.call('DEL', KEYS[1])
if inviteHash then redis.call('SREM', ARGV[1] .. inviteHash, ARGV[2]) end
return 1
`;

const DISABLE_INVITATION_SCRIPT = `
local inviteHash = redis.call('GET', KEYS[1])
if not inviteHash then return 0 end
redis.call('HSET', ARGV[1] .. inviteHash, 'status', 'disabled', 'disabled_at_ms', ARGV[2])
return 1
`;

const REVOKE_INVITATION_SCRIPT = `
local inviteHash = redis.call('GET', KEYS[1])
if not inviteHash then return -1 end
local inviteKey = ARGV[1] .. inviteHash
local sessionsKey = ARGV[2] .. inviteHash
redis.call('HSET', inviteKey, 'status', 'revoked', 'revoked_at_ms', ARGV[3])
local sessions = redis.call('SMEMBERS', sessionsKey)
for _, sessionHash in ipairs(sessions) do
  redis.call('DEL', ARGV[4] .. sessionHash)
end
redis.call('DEL', sessionsKey)
return #sessions
`;

function optionalNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInvitation(codeHash: string, value: Record<string, string>): InvitationRecord | null {
  if (!value.invite_id) return null;
  return {
    invite_id: value.invite_id,
    code_hash: codeHash,
    status: (value.status || "disabled") as InvitationStatus,
    created_at_ms: Number(value.created_at_ms || 0),
    expires_at_ms: optionalNumber(value.expires_at_ms),
    max_uses: Number(value.max_uses || 0),
    uses: Number(value.uses || 0),
    disabled_at_ms: optionalNumber(value.disabled_at_ms),
    revoked_at_ms: optionalNumber(value.revoked_at_ms)
  };
}

export class RedisBetaAccessStore implements BetaAccessStore {
  constructor(private readonly clientProvider: () => Promise<BetaRedisClient>) {}

  async createInvitation(invitation: InvitationRecord) {
    const client = await this.clientProvider();
    const result = await client.eval(CREATE_INVITATION_SCRIPT, {
      keys: [invitationKey(invitation.code_hash), invitationIdKey(invitation.invite_id), INVITATION_LIST_KEY],
      arguments: [
        invitation.invite_id,
        String(invitation.created_at_ms),
        invitation.expires_at_ms === null ? "" : String(invitation.expires_at_ms),
        String(invitation.max_uses),
        invitation.code_hash
      ]
    });
    return Number(result) === 1;
  }

  async listInvitations() {
    const client = await this.clientProvider();
    const ids = await client.zRange(INVITATION_LIST_KEY, 0, -1, { REV: true });
    const invitations: InvitationRecord[] = [];

    for (const id of ids) {
      const codeHash = await client.get(invitationIdKey(id));
      if (!codeHash) continue;
      const invitation = parseInvitation(codeHash, await client.hGetAll(invitationKey(codeHash)));
      if (invitation) invitations.push(invitation);
    }

    return invitations;
  }

  async disableInvitation(inviteId: string, nowMs: number) {
    const client = await this.clientProvider();
    const result = await client.eval(DISABLE_INVITATION_SCRIPT, {
      keys: [invitationIdKey(inviteId)],
      arguments: [`${PREFIX}:invite:`, String(nowMs)]
    });
    return Number(result) === 1;
  }

  async revokeInvitation(inviteId: string, nowMs: number) {
    const client = await this.clientProvider();
    const result = Number(
      await client.eval(REVOKE_INVITATION_SCRIPT, {
        keys: [invitationIdKey(inviteId)],
        arguments: [`${PREFIX}:invite:`, `${PREFIX}:invite-sessions:`, String(nowMs), `${PREFIX}:session:`]
      })
    );
    return result < 0 ? { found: false, revokedSessions: 0 } : { found: true, revokedSessions: result };
  }

  async redeemInvitation(input: {
    inviteHash: string;
    sessionHash: string;
    nowMs: number;
    sessionExpiresAtMs: number;
    policyVersion: string;
    policyAcceptedAtMs: number;
  }): Promise<RedeemStoreResult> {
    const client = await this.clientProvider();
    const result = Number(
      await client.eval(REDEEM_INVITATION_SCRIPT, {
        keys: [
          invitationKey(input.inviteHash),
          sessionKey(input.sessionHash),
          invitationSessionsKey(input.inviteHash)
        ],
        arguments: [
          String(input.nowMs),
          input.inviteHash,
          String(input.sessionExpiresAtMs),
          input.sessionHash,
          input.policyVersion,
          String(input.policyAcceptedAtMs)
        ]
      })
    );

    if (result === 0) return { status: "invalid" };
    if (result === 2) return { status: "expired" };
    if (result === 3) return { status: "disabled" };
    if (result === 4) return { status: "max_uses_reached" };

    return { status: "redeemed" };
  }

  async validateSession(sessionHash: string, nowMs: number): Promise<ValidateSessionStoreResult> {
    const client = await this.clientProvider();
    const result = (await client.eval(VALIDATE_SESSION_SCRIPT, {
      keys: [sessionKey(sessionHash)],
      arguments: [String(nowMs), `${PREFIX}:invite:`]
    })) as Array<string | number>;

    if (!Array.isArray(result) || Number(result[0]) !== 1) return { status: "invalid" };
    const session: BetaSessionRecord = {
      session_hash: sessionHash,
      invite_id: String(result[1]),
      invite_hash: String(result[2]),
      created_at_ms: Number(result[3]),
      expires_at_ms: Number(result[4]),
      ...(result[5] ? { accepted_policy_version: String(result[5]) } : {}),
      ...(result[6] ? { policy_accepted_at_ms: Number(result[6]) } : {})
    };
    return { status: "valid", session };
  }

  async acceptSessionPolicy(input: {
    sessionHash: string;
    nowMs: number;
    policyVersion: string;
    policyAcceptedAtMs: number;
  }): Promise<ValidateSessionStoreResult> {
    const client = await this.clientProvider();
    const result = (await client.eval(ACCEPT_SESSION_POLICY_SCRIPT, {
      keys: [sessionKey(input.sessionHash)],
      arguments: [
        String(input.nowMs),
        `${PREFIX}:invite:`,
        input.policyVersion,
        String(input.policyAcceptedAtMs)
      ]
    })) as Array<string | number>;
    if (!Array.isArray(result) || Number(result[0]) !== 1) return { status: "invalid" };
    return {
      status: "valid",
      session: {
        session_hash: input.sessionHash,
        invite_id: String(result[1]),
        invite_hash: String(result[2]),
        created_at_ms: Number(result[3]),
        expires_at_ms: Number(result[4]),
        accepted_policy_version: String(result[5]),
        policy_accepted_at_ms: Number(result[6])
      }
    };
  }

  async deleteSession(sessionHash: string) {
    const client = await this.clientProvider();
    await client.eval(DELETE_SESSION_SCRIPT, {
      keys: [sessionKey(sessionHash)],
      arguments: [`${PREFIX}:invite-sessions:`, sessionHash]
    });
  }
}
