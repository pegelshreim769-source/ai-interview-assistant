import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createAdminAccessToken() {
  return `admin_${randomBytes(32).toString("base64url")}`;
}

export function createAdminSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAdminSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function verifyAdminAccessToken(candidate: string, expectedHash: string) {
  const candidateHash = Buffer.from(hashAdminSecret(candidate.trim()), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return candidateHash.length === expected.length && timingSafeEqual(candidateHash, expected);
}
