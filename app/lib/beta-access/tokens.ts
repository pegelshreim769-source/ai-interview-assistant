import { createHash, randomBytes } from "node:crypto";

export function createInvitationCode() {
  return `beta_${randomBytes(24).toString("base64url")}`;
}

export function createInvitationId() {
  return `inv_${randomBytes(12).toString("base64url")}`;
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function normalizeInvitationCode(code: string) {
  return code.trim();
}

export function hashOpaqueSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
