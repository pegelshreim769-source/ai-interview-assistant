import { NextResponse } from "next/server";

import { clearAdminSessionCookie, readAdminSessionToken } from "../../../lib/admin/cookies";
import { getAdminService } from "../../../lib/admin/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = readAdminSessionToken(request);
  if (!token) {
    return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await getAdminService().validateSession(token);
    if (result.status === "valid") {
      return NextResponse.json(
        { authenticated: true, expires_at: new Date(result.expiresAtMs).toISOString() },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const response = NextResponse.json(
      { authenticated: false },
      { headers: { "Cache-Control": "no-store" } }
    );
    clearAdminSessionCookie(response);
    return response;
  } catch {
    return NextResponse.json(
      { error: "管理服务暂时不可用，请稍后再试。", code: "ADMIN_SERVICE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
