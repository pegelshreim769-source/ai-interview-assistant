import "server-only";

import { NextResponse } from "next/server";
import { setBetaSessionCookie } from "./cookies";
import { BETA_UNAVAILABLE_ERROR } from "./api-auth";
import { getBetaAccessService } from "./server";
import type { BetaAccessService } from "./service";

const INVALID_INVITATION = {
  status: 401,
  error: "邀请码无效或已不可用，请确认后重试。",
  code: "INVALID_INVITATION"
} as const;

const POLICY_REQUIRED = {
  status: 400,
  error: "请先阅读并同意用户协议和隐私政策。",
  code: "BETA_POLICY_ACCEPTANCE_REQUIRED"
} as const;

export async function handleRedeemRequest(
  request: Request,
  service: BetaAccessService = getBetaAccessService()
) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 2048) {
      return NextResponse.json(
        { error: "请求内容过长，请检查后重试。", code: "INVALID_ACCESS_REQUEST" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    const body = JSON.parse(rawBody) as {
      invitation_code?: unknown;
      accept_policies?: unknown;
      policy_version?: unknown;
    };
    const invitationCode = typeof body.invitation_code === "string" ? body.invitation_code : "";
    const policyVersion = typeof body.policy_version === "string" ? body.policy_version : "";
    const result = await service.redeemInvitation(invitationCode, {
      accepted: body.accept_policies === true,
      policyVersion
    });

    if (result.status === "policy_not_accepted") {
      return NextResponse.json(
        { error: POLICY_REQUIRED.error, code: POLICY_REQUIRED.code },
        { status: POLICY_REQUIRED.status, headers: { "Cache-Control": "no-store" } }
      );
    }

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
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "请求格式不正确，请检查后重试。", code: "INVALID_ACCESS_REQUEST" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: BETA_UNAVAILABLE_ERROR, code: "BETA_ACCESS_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
