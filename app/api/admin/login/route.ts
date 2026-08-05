import { NextResponse } from "next/server";

import { setAdminSessionCookie } from "../../../lib/admin/cookies";
import { resolveAdminIpHash } from "../../../lib/admin/identity";
import { getAdminService } from "../../../lib/admin/server";

export const runtime = "nodejs";

const INVALID = { error: "管理员访问令牌无效或服务暂不可用。", code: "ADMIN_LOGIN_FAILED" };

export async function POST(request: Request) {
  try {
    const service = getAdminService();
    const ipHash = resolveAdminIpHash(request, service.config);
    const rate = await service.recordLoginAttempt(ipHash);
    if (rate.status === "limited") {
      return NextResponse.json(
        { error: "登录尝试过于频繁，请稍后再试。", code: "ADMIN_LOGIN_RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rate.retryAfterSeconds)
          }
        }
      );
    }
    const body = (await request.json()) as { access_token?: unknown };
    const token = typeof body.access_token === "string" ? body.access_token : "";
    const result = await service.login(token);
    if (result.status !== "authenticated") {
      return NextResponse.json(INVALID, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const response = NextResponse.json({
      authenticated: true,
      expires_at: new Date(result.expiresAtMs).toISOString()
    });
    setAdminSessionCookie(response, result.sessionToken, result.expiresAtMs);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json(INVALID, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
