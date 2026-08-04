import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { BetaUsageConfig } from "./types";

export class BetaUsageIdentityError extends Error {
  constructor() {
    super("Trusted client address is unavailable.");
    this.name = "BetaUsageIdentityError";
  }
}

export function normalizeIpAddress(rawValue: string) {
  const value = rawValue.trim();
  const version = isIP(value);
  if (version === 4) return value.split(".").map((part) => String(Number(part))).join(".");
  if (version === 6) {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  }
  throw new BetaUsageIdentityError();
}

export function resolveHashedClientIp(request: Request, config: BetaUsageConfig) {
  const trustedHeader = request.headers.get("x-real-ip");
  const rawIp = trustedHeader?.trim() || (config.production ? "" : "127.0.0.1");
  if (!rawIp || rawIp.includes(",")) throw new BetaUsageIdentityError();
  const normalized = normalizeIpAddress(rawIp);
  return createHmac("sha256", config.ipHashSecret).update(normalized, "utf8").digest("hex");
}
