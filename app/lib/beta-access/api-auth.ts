import "server-only";

import { readBetaSessionToken } from "./cookies";
import { getBetaAccessService } from "./server";
import type { BetaAccessService } from "./service";
import type { BetaSessionRecord } from "./types";

export const BETA_UNAUTHORIZED_ERROR = "封闭测试会话无效或已过期，请使用邀请码重新进入。";
export const BETA_UNAVAILABLE_ERROR = "访问验证服务暂时不可用，请稍后再试。";
export const BETA_POLICY_ERROR = "政策版本已更新，请重新阅读并确认用户协议和隐私政策。";

export type BetaAccessDecision =
  | { status: "authorized"; session: BetaSessionRecord }
  | { status: "unauthorized"; response: Response }
  | { status: "unavailable"; response: Response };

export async function requireBetaAccess(
  request: Request,
  service: BetaAccessService = getBetaAccessService()
): Promise<BetaAccessDecision> {
  const token = readBetaSessionToken(request);
  if (!token) {
    return {
      status: "unauthorized",
      response: Response.json(
        { error: BETA_UNAUTHORIZED_ERROR, code: "BETA_ACCESS_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      )
    };
  }

  try {
    const result = await service.validateSession(token);
    if (result.status === "valid") return { status: "authorized", session: result.session };
    if (result.status === "policy_acceptance_required") {
      return {
        status: "unauthorized",
        response: Response.json(
          { error: BETA_POLICY_ERROR, code: "BETA_POLICY_ACCEPTANCE_REQUIRED" },
          { status: 401, headers: { "Cache-Control": "no-store" } }
        )
      };
    }
    return {
      status: "unauthorized",
      response: Response.json(
        { error: BETA_UNAUTHORIZED_ERROR, code: "BETA_ACCESS_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      )
    };
  } catch {
    return {
      status: "unavailable",
      response: Response.json(
        { error: BETA_UNAVAILABLE_ERROR, code: "BETA_ACCESS_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    };
  }
}

export function withBetaAccess<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Response | Promise<Response>
) {
  return async (request: Request, ...args: Args) => {
    const decision = await requireBetaAccess(request);
    if (decision.status !== "authorized") return decision.response;
    return handler(request, ...args);
  };
}
