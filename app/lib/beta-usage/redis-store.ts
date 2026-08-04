import "server-only";

import type { BetaRedisClient } from "../beta-access/redis-client";
import type {
  BetaUsageStore,
  ConcurrencyLeaseResult,
  InvitationRateLimitResult,
  RateLimitResult,
  UsageReservationResult
} from "./types";

const DEFAULT_PREFIX = "interview-studio:usage";

const RECORD_AI_ATTEMPT_SCRIPT = `
local cutoff = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[1], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[6])
redis.call('PEXPIRE', KEYS[2], ARGV[6])
local userCount = redis.call('ZCARD', KEYS[1])
local ipCount = redis.call('ZCARD', KEYS[2])
if userCount > tonumber(ARGV[4]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {2, math.max(1, tonumber(oldest[2]) + tonumber(ARGV[6]) - tonumber(ARGV[1]))}
end
if ipCount > tonumber(ARGV[5]) then
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  return {3, math.max(1, tonumber(oldest[2]) + tonumber(ARGV[6]) - tonumber(ARGV[1]))}
end
return {1, 0}
`;

const RECORD_INVITATION_ATTEMPT_SCRIPT = `
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

const RESERVE_USAGE_SCRIPT = `
local units = tonumber(ARGV[1])
local cost = units * tonumber(ARGV[4])
local currentUser = tonumber(redis.call('GET', KEYS[1]) or '0')
local currentDay = tonumber(redis.call('GET', KEYS[2]) or '0')
local currentMonth = tonumber(redis.call('GET', KEYS[3]) or '0')
local projectedUser = currentUser + units
local projectedDay = currentDay + cost
local projectedMonth = currentMonth + cost

if projectedUser > tonumber(ARGV[3]) then return {2, 0, 0} end
if projectedDay >= tonumber(ARGV[5]) or projectedMonth >= tonumber(ARGV[6]) then
  return {4, 0, 0}
end
if tonumber(ARGV[2]) == 1 and
   (projectedDay * 100 >= tonumber(ARGV[5]) * 90 or projectedMonth * 100 >= tonumber(ARGV[6]) * 90) then
  return {3, 0, 0}
end

redis.call('INCRBY', KEYS[1], units)
redis.call('INCRBY', KEYS[2], cost)
redis.call('INCRBY', KEYS[3], cost)
redis.call('EXPIRE', KEYS[1], ARGV[7])
redis.call('EXPIRE', KEYS[2], ARGV[7])
redis.call('EXPIRE', KEYS[3], ARGV[8])

local warnedDay = 0
local warnedMonth = 0
if projectedDay * 100 >= tonumber(ARGV[5]) * 70 then
  local created = redis.call('SET', KEYS[4], '1', 'EX', ARGV[7], 'NX')
  if created then warnedDay = 1 end
end
if projectedMonth * 100 >= tonumber(ARGV[6]) * 70 then
  local created = redis.call('SET', KEYS[5], '1', 'EX', ARGV[8], 'NX')
  if created then warnedMonth = 1 end
end
return {1, warnedDay, warnedMonth}
`;

const ACQUIRE_CONCURRENCY_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.max(1, tonumber(oldest[2]) - tonumber(ARGV[1]))}
end
redis.call('ZADD', KEYS[1], tonumber(ARGV[1]) + tonumber(ARGV[4]), ARGV[2])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]) + 60000)
return {1, 0}
`;

function secondsFromMilliseconds(value: unknown) {
  return Math.max(1, Math.ceil(Number(value || 1000) / 1000));
}

function parseTuple(value: unknown): Array<string | number> {
  return Array.isArray(value) ? (value as Array<string | number>) : [];
}

export class RedisBetaUsageStore implements BetaUsageStore {
  constructor(
    private readonly clientProvider: () => Promise<BetaRedisClient>,
    private readonly prefix = DEFAULT_PREFIX
  ) {}

  async recordAiAttempt(input: {
    sessionHash: string;
    ipHash: string;
    requestId: string;
    nowMs: number;
    windowMs: number;
    userLimit: number;
    ipLimit: number;
  }): Promise<RateLimitResult> {
    const client = await this.clientProvider();
    const result = parseTuple(
      await client.eval(RECORD_AI_ATTEMPT_SCRIPT, {
        keys: [
          `${this.prefix}:rate:user:${input.sessionHash}`,
          `${this.prefix}:rate:ip:${input.ipHash}`
        ],
        arguments: [
          String(input.nowMs),
          String(input.nowMs - input.windowMs),
          input.requestId,
          String(input.userLimit),
          String(input.ipLimit),
          String(input.windowMs)
        ]
      })
    );
    if (Number(result[0]) === 2) {
      return { status: "user_limited", retryAfterSeconds: secondsFromMilliseconds(result[1]) };
    }
    if (Number(result[0]) === 3) {
      return { status: "ip_limited", retryAfterSeconds: secondsFromMilliseconds(result[1]) };
    }
    return { status: "allowed" };
  }

  async recordInvitationAttempt(input: {
    ipHash: string;
    requestId: string;
    nowMs: number;
    windowMs: number;
    maxAttempts: number;
  }): Promise<InvitationRateLimitResult> {
    const client = await this.clientProvider();
    const result = parseTuple(
      await client.eval(RECORD_INVITATION_ATTEMPT_SCRIPT, {
        keys: [`${this.prefix}:invite-rate:ip:${input.ipHash}`],
        arguments: [
          String(input.nowMs),
          input.requestId,
          String(input.windowMs),
          String(input.maxAttempts)
        ]
      })
    );
    if (Number(result[0]) !== 1) {
      return { status: "limited", retryAfterSeconds: secondsFromMilliseconds(result[1]) };
    }
    return { status: "allowed" };
  }

  async reserveUsage(input: Parameters<BetaUsageStore["reserveUsage"]>[0]): Promise<UsageReservationResult> {
    const { config, periods } = input;
    const client = await this.clientProvider();
    const result = parseTuple(
      await client.eval(RESERVE_USAGE_SCRIPT, {
        keys: [
          `${this.prefix}:quota:user:${input.sessionHash}:day:${periods.dayKey}`,
          `${this.prefix}:budget:day:${periods.dayKey}`,
          `${this.prefix}:budget:month:${periods.monthKey}`,
          `${this.prefix}:warning:day:${periods.dayKey}`,
          `${this.prefix}:warning:month:${periods.monthKey}`
        ],
        arguments: [
          String(input.units),
          input.expensive ? "1" : "0",
          String(config.userDailyUnits),
          String(config.estimatedCentsPerUnit),
          String(config.dailyBudgetCents),
          String(config.monthlyBudgetCents),
          String(periods.dayTtlSeconds),
          String(periods.monthTtlSeconds)
        ]
      })
    );
    const status = Number(result[0]);
    if (status === 2) {
      return { status: "daily_quota_exhausted", retryAfterSeconds: periods.dailyRetryAfterSeconds };
    }
    if (status === 3) return { status: "budget_reduced" };
    if (status === 4) return { status: "budget_exhausted" };
    return {
      status: "reserved",
      warnedDay: Number(result[1]) === 1,
      warnedMonth: Number(result[2]) === 1
    };
  }

  async acquireConcurrencyLease(
    input: Parameters<BetaUsageStore["acquireConcurrencyLease"]>[0]
  ): Promise<ConcurrencyLeaseResult> {
    const client = await this.clientProvider();
    const result = parseTuple(
      await client.eval(ACQUIRE_CONCURRENCY_SCRIPT, {
        keys: [`${this.prefix}:concurrency:leases`],
        arguments: [
          String(input.nowMs),
          input.leaseId,
          String(input.maxConcurrency),
          String(input.leaseTtlMs)
        ]
      })
    );
    if (Number(result[0]) !== 1) {
      return { status: "busy", retryAfterSeconds: Math.min(10, secondsFromMilliseconds(result[1])) };
    }
    return { status: "acquired", leaseId: input.leaseId };
  }

  async releaseConcurrencyLease(leaseId: string) {
    const client = await this.clientProvider();
    await client.zRem(`${this.prefix}:concurrency:leases`, leaseId);
  }
}
