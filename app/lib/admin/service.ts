import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminSessionToken, hashAdminSecret, verifyAdminAccessToken } from "./tokens";
import type { AdminConfig, AdminStore } from "./types";

export class AdminService {
  constructor(
    private readonly store: AdminStore,
    readonly config: AdminConfig,
    private readonly now: () => number = Date.now,
    private readonly idFactory: () => string = randomUUID
  ) {}

  recordLoginAttempt(ipHash: string) {
    return this.store.recordLoginAttempt({
      ipHash,
      requestId: this.idFactory(),
      nowMs: this.now(),
      windowMs: this.config.loginWindowMs,
      maxAttempts: this.config.loginMaxAttempts
    });
  }

  async login(accessToken: string) {
    if (!verifyAdminAccessToken(accessToken, this.config.accessTokenHash)) {
      return { status: "invalid" as const };
    }
    const sessionToken = createAdminSessionToken();
    const sessionHash = hashAdminSecret(sessionToken);
    const nowMs = this.now();
    const expiresAtMs = nowMs + this.config.sessionHours * 60 * 60 * 1000;
    await this.store.createSession(
      {
        session_hash: sessionHash,
        access_token_hash: this.config.accessTokenHash,
        created_at_ms: nowMs,
        expires_at_ms: expiresAtMs
      },
      this.config.sessionHours * 60 * 60
    );
    return { status: "authenticated" as const, sessionToken, expiresAtMs };
  }

  async validateSession(sessionToken: string) {
    if (!sessionToken) return { status: "invalid" as const };
    const session = await this.store.getSession(hashAdminSecret(sessionToken));
    if (
      !session ||
      session.expires_at_ms <= this.now() ||
      session.access_token_hash !== this.config.accessTokenHash
    ) {
      return { status: "invalid" as const };
    }
    return { status: "valid" as const, expiresAtMs: session.expires_at_ms };
  }

  async logout(sessionToken: string) {
    if (!sessionToken) return;
    await this.store.deleteSession(hashAdminSecret(sessionToken), this.config.accessTokenHash);
  }

  revokeAllSessions() {
    return this.store.revokeSessions(this.config.accessTokenHash);
  }
}
