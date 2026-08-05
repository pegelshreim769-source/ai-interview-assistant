import "server-only";

import { createHmac } from "node:crypto";
import { normalizeIpAddress } from "../beta-usage/identity";
import type { AdminConfig } from "./types";

export function resolveAdminIpHash(request: Request, config: AdminConfig) {
  const trusted = request.headers.get("x-real-ip")?.trim() || (config.production ? "" : "127.0.0.1");
  if (!trusted || trusted.includes(",")) throw new Error("Trusted client address is unavailable.");
  const normalized = normalizeIpAddress(trusted);
  return createHmac("sha256", config.ipHashSecret).update(`admin-login:${normalized}`, "utf8").digest("hex");
}
