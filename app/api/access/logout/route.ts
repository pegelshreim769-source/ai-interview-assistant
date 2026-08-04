import { NextResponse } from "next/server";
import { BETA_UNAVAILABLE_ERROR } from "../../../lib/beta-access/api-auth";
import { clearBetaSessionCookie, readBetaSessionToken } from "../../../lib/beta-access/cookies";
import { getBetaAccessService } from "../../../lib/beta-access/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = readBetaSessionToken(request);
  try {
    if (token) await getBetaAccessService().logout(token);
    const response = NextResponse.json({ authenticated: false });
    clearBetaSessionCookie(response);
    return response;
  } catch {
    const response = NextResponse.json(
      { error: BETA_UNAVAILABLE_ERROR, code: "BETA_ACCESS_UNAVAILABLE" },
      { status: 503 }
    );
    clearBetaSessionCookie(response);
    return response;
  }
}
