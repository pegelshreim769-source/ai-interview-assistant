import "server-only";

import type { BetaRedisClient } from "../beta-access/redis-client";
import type { AdminLoginRateResult, AdminSessionRecord, AdminStore } from "./types";

const DEFAULT_PREFIX = "interview-studio:admin:v1";

const LOGIN_RATE_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]) - tonumber(ARGV[3]))
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
local count = redis.call('ZCARD', KEYS[1])
if count > tonumber(ARGV[4]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.max(1, tonumber(oldest[2]) + tonumber(ARGV[3]) - tonumber(ARGV[1]))}
end
return {1, 0}
`;

const CREATE_SESSION_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SADD', KEYS[2], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1
`;

const DELETE_SESSION_SCRIPT = `
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[1])
return 1
`;

const REVOKE_SESSIONS_SCRIPT = `
local members = redis.call('SMEMBERS', KEYS[1])
for _, member in ipairs(members) do redis.call('DEL', ARGV[1] .. member) end
redis.call('DEL', KEYS[1])
return #members
`;

function sessionGroup(prefix: string, accessTokenHash: string) {
  return `${prefix}:sessions:${accessTokenHash}`;
}

export class RedisAdminStore implements AdminStore {
  constructor(
    private readonly clientProvider: () => Promise<BetaRedisClient>,
    private readonly prefix = DEFAULT_PREFIX
  ) {}

  async recordLoginAttempt(input: Parameters<AdminStore["recordLoginAttempt"]>[0]): Promise<AdminLoginRateResult> {
    const client = await this.clientProvider();
    const result = (await client.eval(LOGIN_RATE_SCRIPT, {
      keys: [`${this.prefix}:login-rate:ip:${input.ipHash}`],
      arguments: [
        String(input.nowMs),
        input.requestId,
        String(input.windowMs),
        String(input.maxAttempts)
      ]
    })) as Array<string | number>;
    if (Number(result[0]) !== 1) {
      return { status: "limited", retryAfterSeconds: Math.max(1, Math.ceil(Number(result[1]) / 1000)) };
    }
    return { status: "allowed" };
  }

  async createSession(record: AdminSessionRecord, ttlSeconds: number) {
    const client = await this.clientProvider();
    await client.eval(CREATE_SESSION_SCRIPT, {
      keys: [
        `${this.prefix}:session:${record.session_hash}`,
        sessionGroup(this.prefix, record.access_token_hash)
      ],
      arguments: [JSON.stringify(record), String(ttlSeconds), record.session_hash]
    });
  }

  async getSession(sessionHash: string) {
    const client = await this.clientProvider();
    const value = await client.get(`${this.prefix}:session:${sessionHash}`);
    if (!value) return null;
    try {
      return JSON.parse(value) as AdminSessionRecord;
    } catch {
      return null;
    }
  }

  async deleteSession(sessionHash: string, accessTokenHash: string) {
    const client = await this.clientProvider();
    await client.eval(DELETE_SESSION_SCRIPT, {
      keys: [
        `${this.prefix}:session:${sessionHash}`,
        sessionGroup(this.prefix, accessTokenHash)
      ],
      arguments: [sessionHash]
    });
  }

  async revokeSessions(accessTokenHash: string) {
    const client = await this.clientProvider();
    const value = await client.eval(REVOKE_SESSIONS_SCRIPT, {
      keys: [sessionGroup(this.prefix, accessTokenHash)],
      arguments: [`${this.prefix}:session:`]
    });
    return Number(value || 0);
  }
}
