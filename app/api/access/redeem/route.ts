import { NextResponse } from "next/server";
import { setBetaSessionCookie } from "../../../lib/beta-access/cookies";
import { BETA_UNAVAILABLE_ERROR } from "../../../lib/beta-access/api-auth";
import { getBetaAccessService } from "../../../lib/beta-access/server";
import { guardInvitationAttempt } from "../../../lib/beta-usage/api-guard";

export const runtime = "nodejs";

const INVALID_INVITATION = {
  status: 401,
  error: "邀请码无效或已不可用，请确认后重试。",
  code: "INVALID_INVITATION"
} as const;

export async function POST(request: Request) {
  const limited = await guardInvitationAttempt(request);
  if (limited) return limited;

  try {
    const body = (await request.json()) as { invitation_code?: unknown };
    const invitationCode = typeof body.invitation_code === "string" ? body.invitation_code : "";
    const result = await getBetaAccessService().redeemInvitation(invitationCode);

    if (result.status !== "redeemed") {
      return NextResponse.json(
        { error: INVALID_INVITATION.error, code: INVALID_INVITATION.code },
        { status: INVALID_INVITATION.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    const response = NextResponse.json({ authenticated: true, expires_at: new Date(result.expiresAtMs).toISOString() });
    setBetaSessionCookie(response, result.sessionToken, result.expiresAtMs);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json(
      { error: BETA_UNAVAILABLE_ERROR, code: "BETA_ACCESS_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
