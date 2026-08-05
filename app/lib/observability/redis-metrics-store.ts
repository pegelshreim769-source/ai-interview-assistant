import "server-only";

import type { BetaRedisClient } from "../beta-access/redis-client";
import type { MetricsStore } from "./types";

const DEFAULT_PREFIX = "interview-studio:metrics:v1";

const RECORD_METRICS_SCRIPT_V2 = `
local incrementCount = tonumber(ARGV[4])
for keyIndex = 1, 2 do
  local incrementEnd = 4 + incrementCount * 2
  for i = 5, incrementEnd, 2 do
    redis.call('HINCRBY', KEYS[keyIndex], ARGV[i], ARGV[i + 1])
  end
  local maxStart = incrementEnd + 1
  for i = maxStart, #ARGV, 2 do
    local current = tonumber(redis.call('HGET', KEYS[keyIndex], ARGV[i]) or '0')
    local candidate = tonumber(ARGV[i + 1])
    if candidate > current then redis.call('HSET', KEYS[keyIndex], ARGV[i], candidate) end
  end
end
redis.call('EXPIRE', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
if ARGV[3] ~= '' then
  redis.call('PFADD', KEYS[3], ARGV[3])
  redis.call('PFADD', KEYS[4], ARGV[3])
  redis.call('EXPIRE', KEYS[3], ARGV[1])
  redis.call('EXPIRE', KEYS[4], ARGV[2])
end
return 1
`;

export class RedisMetricsStore implements MetricsStore {
  constructor(
    private readonly clientProvider: () => Promise<BetaRedisClient>,
    private readonly prefix = DEFAULT_PREFIX
  ) {}

  async record(input: Parameters<MetricsStore["record"]>[0]) {
    const client = await this.clientProvider();
    const increments = Object.entries(input.increments);
    const maxima = Object.entries(input.maxima);
    await client.eval(RECORD_METRICS_SCRIPT_V2, {
      keys: [
        `${this.prefix}:hour:${input.hourKey}`,
        `${this.prefix}:day:${input.dayKey}`,
        `${this.prefix}:active:hour:${input.hourKey}`,
        `${this.prefix}:active:day:${input.dayKey}`
      ],
      arguments: [
        String(input.hourlyTtlSeconds),
        String(input.dailyTtlSeconds),
        input.activeSessionId || "",
        String(increments.length),
        ...increments.flatMap(([field, value]) => [field, String(value)]),
        ...maxima.flatMap(([field, value]) => [field, String(value)])
      ]
    });
  }

  async readDaily(dayKeys: string[]) {
    const client = await this.clientProvider();
    return Promise.all(
      dayKeys.map(async (period) => ({
        period,
        values: await client.hGetAll(`${this.prefix}:day:${period}`)
      }))
    );
  }

  async countActiveDaily(dayKeys: string[]) {
    if (dayKeys.length === 0) return 0;
    const client = await this.clientProvider();
    const keys = dayKeys.map((period) => `${this.prefix}:active:day:${period}`);
    const value = await client.sendCommand(["PFCOUNT", ...keys]);
    return Number(value || 0);
  }
}

// Kept exported so the Docker Redis verifier can exercise the exact production script.
export const REDIS_RECORD_METRICS_SCRIPT = RECORD_METRICS_SCRIPT_V2;
