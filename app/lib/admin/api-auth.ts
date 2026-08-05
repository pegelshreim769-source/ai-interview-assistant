import "server-only";

import { readAdminSessionToken } from "./cookies";
import { getAdminService } from "./server";
import type { AdminService } from "./service";

export type AdminDecision =
  | { status: "authorized" }
  | { status: "unauthorized"; response: Response }
  | { status: "unavailable"; response: Response };

export async function requireAdminAccess(
  request: Request,
  service: AdminService = getAdminService()
): Promise<AdminDecision> {
  const token = readAdminSessionToken(request);
  if (!token) return unauthorized();
  try {
    const result = await service.validateSession(token);
    return result.status === "valid" ? { status: "authorized" } : unauthorized();
  } catch {
    return {
      status: "unavailable",
      response: Response.json(
        { error: "管理服务暂时不可用，请稍后再试。", code: "ADMIN_SERVICE_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    };
  }
}

function unauthorized(): AdminDecision {
  return {
    status: "unauthorized",
    response: Response.json(
      { error: "管理员会话无效或已过期，请重新登录。", code: "ADMIN_ACCESS_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  };
}
