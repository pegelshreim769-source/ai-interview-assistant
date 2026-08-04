import type {
  InvitationRateLimitResult,
  RateLimitResult,
  UsageReservationResult
} from "./types";

type ErrorResponseOptions = {
  status: number;
  code: string;
  error: string;
  retryAfterSeconds?: number;
};

export function betaUsageErrorResponse(options: ErrorResponseOptions) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (options.retryAfterSeconds) {
    headers.set("Retry-After", String(Math.max(1, Math.ceil(options.retryAfterSeconds))));
  }
  return Response.json(
    { error: options.error, code: options.code },
    { status: options.status, headers }
  );
}

export function rateLimitResponse(result: Exclude<RateLimitResult, { status: "allowed" }>) {
  if (result.status === "user_limited") {
    return betaUsageErrorResponse({
      status: 429,
      code: "BETA_USER_RATE_LIMITED",
      error: "请求过于频繁，请稍后再试。",
      retryAfterSeconds: result.retryAfterSeconds
    });
  }
  return betaUsageErrorResponse({
    status: 429,
    code: "BETA_IP_RATE_LIMITED",
    error: "当前网络请求过于频繁，请稍后再试。",
    retryAfterSeconds: result.retryAfterSeconds
  });
}

export function reservationResponse(
  result: Exclude<UsageReservationResult, { status: "reserved" }>
) {
  if (result.status === "daily_quota_exhausted") {
    return betaUsageErrorResponse({
      status: 429,
      code: "BETA_DAILY_QUOTA_EXHAUSTED",
      error: "今日测试额度已用完，请明天再试。",
      retryAfterSeconds: result.retryAfterSeconds
    });
  }
  if (result.status === "budget_reduced") {
    return betaUsageErrorResponse({
      status: 503,
      code: "BETA_BUDGET_REDUCED",
      error: "今日服务额度接近上限，高费用功能暂时关闭。",
      retryAfterSeconds: 300
    });
  }
  return betaUsageErrorResponse({
    status: 503,
    code: "BETA_BUDGET_EXHAUSTED",
    error: "今日服务额度已用完，请稍后再试。",
    retryAfterSeconds: 300
  });
}

export function invitationRateLimitResponse(
  result: Exclude<InvitationRateLimitResult, { status: "allowed" }>
) {
  return betaUsageErrorResponse({
    status: 429,
    code: "BETA_INVITATION_RATE_LIMITED",
    error: "邀请码尝试过于频繁，请稍后再试。",
    retryAfterSeconds: result.retryAfterSeconds
  });
}

export function betaUsageUnavailableResponse() {
  return betaUsageErrorResponse({
    status: 503,
    code: "BETA_USAGE_UNAVAILABLE",
    error: "测试服务保护组件暂时不可用，请稍后再试。",
    retryAfterSeconds: 30
  });
}
