import "server-only";

import { createClient } from "redis";

export type BetaRedisClient = ReturnType<typeof createClient>;

const globalForBetaRedis = globalThis as typeof globalThis & {
  betaRedisClientPromise?: Promise<BetaRedisClient>;
};

function createBetaRedisClient() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error("Beta access storage is not configured.");

  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries) => Math.min(100 * 2 ** Math.min(retries, 4), 1500)
    }
  });

  client.on("error", () => undefined);
  return client;
}

export async function getBetaRedisClient() {
  if (!globalForBetaRedis.betaRedisClientPromise) {
    globalForBetaRedis.betaRedisClientPromise = (async () => {
      const client = createBetaRedisClient();
      await client.connect();
      return client;
    })().catch((error) => {
      globalForBetaRedis.betaRedisClientPromise = undefined;
      throw error;
    });
  }

  return globalForBetaRedis.betaRedisClientPromise;
}

export async function closeBetaRedisClient() {
  const clientPromise = globalForBetaRedis.betaRedisClientPromise;
  globalForBetaRedis.betaRedisClientPromise = undefined;
  if (!clientPromise) return;

  try {
    const client = await clientPromise;
    if (client.isOpen) await client.quit();
  } catch {
    // A failed connection has nothing left to close.
  }
}
