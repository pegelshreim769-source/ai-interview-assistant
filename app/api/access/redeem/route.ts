import { NextResponse } from "next/server";
import { setBetaSessionCookie } from "../../../lib/beta-access/cookies";
import { BETA_UNAVAILABLE_ERROR } from "../../../lib/beta-access/api-auth";
import { getBetaAccessService } from "../../../lib/beta-access/server";

export const runtime = "nodejs";

const REDEEM_ERRORS = {
  invalid: { status: 401, error: "邀请码无效，请检查后重试。", code: "INVALID_INVITATION" },
  expired: { status: 410, error: "邀请码已过期，请联系邀请人。", code: "EXPIRED_INVITATION" },
  disabled: { status: 403, error: "邀请码已停用，请联系邀请人。", code: "DISABLED_INVITATION" },
  max_uses_reached: { status: 403, error: "邀请码使用次数已达上限。", code: "INVITATION_LIMIT_REACHED" }
} as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { invitation_code?: unknown };
    const invitationCode = typeof body.invitation_code === "string" ? body.invitation_code : "";
    const result = await getBetaAccessService().redeemInvitation(invitationCode);

    if (result.status !== "redeemed") {
      const failure = REDEEM_ERRORS[result.status];
      return NextResponse.json({ error: failure.error, code: failure.code }, { status: failure.status });
    }

    const response = NextResponse.json({ authenticated: true, expires_at: new Date(result.expiresAtMs).toISOString() });
    setBetaSessionCookie(response, result.sessionToken, result.expiresAtMs);
    return response;
  } catch {
    return NextResponse.json({ error: BETA_UNAVAILABLE_ERROR, code: "BETA_ACCESS_UNAVAILABLE" }, { status: 503 });
  }
}
