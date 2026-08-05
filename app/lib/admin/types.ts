export type AdminConfig = {
  accessTokenHash: string;
  sessionHours: number;
  ipHashSecret: string;
  production: boolean;
  loginWindowMs: number;
  loginMaxAttempts: number;
};

export type AdminSessionRecord = {
  session_hash: string;
  access_token_hash: string;
  created_at_ms: number;
  expires_at_ms: number;
};

export type AdminLoginRateResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number };

export interface AdminStore {
  recordLoginAttempt(input: {
    ipHash: string;
    requestId: string;
    nowMs: number;
    windowMs: number;
    maxAttempts: number;
  }): Promise<AdminLoginRateResult>;
  createSession(record: AdminSessionRecord, ttlSeconds: number): Promise<void>;
  getSession(sessionHash: string): Promise<AdminSessionRecord | null>;
  deleteSession(sessionHash: string, accessTokenHash: string): Promise<void>;
  revokeSessions(accessTokenHash: string): Promise<number>;
}
