import { NextResponse } from "next/server";

import { clearAdminSessionCookie, readAdminSessionToken } from "../../../lib/admin/cookies";
import { getAdminService } from "../../../lib/admin/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
  clearAdminSessionCookie(response);
  try {
    const token = readAdminSessionToken(request);
    if (token) await getAdminService().logout(token);
    return response;
  } catch {
    const unavailable = NextResponse.json(
      { error: "管理服务暂时不可用，请稍后再试。", code: "ADMIN_SERVICE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
    clearAdminSessionCookie(unavailable);
    return unavailable;
  }
}
