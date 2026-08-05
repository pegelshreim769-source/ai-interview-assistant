import { NextResponse } from "next/server";
import { BETA_UNAVAILABLE_ERROR } from "../../../lib/beta-access/api-auth";
import { clearBetaSessionCookie, readBetaSessionToken } from "../../../lib/beta-access/cookies";
import { getBetaAccessService } from "../../../lib/beta-access/server";
import { currentPolicyVersion } from "../../../lib/compliance/config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = readBetaSessionToken(request);
  if (!token) return NextResponse.json(
    { authenticated: false, policy_version: currentPolicyVersion() },
    { headers: { "Cache-Control": "no-store" } }
  );

  try {
    const result = await getBetaAccessService().validateSession(token);
    if (result.status === "valid") {
      return NextResponse.json(
        {
          authenticated: true,
          expires_at: new Date(result.session.expires_at_ms).toISOString(),
          policy_version: currentPolicyVersion()
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (result.status === "policy_acceptance_required") {
      return NextResponse.json(
        {
          authenticated: false,
          policy_acceptance_required: true,
          policy_version: currentPolicyVersion()
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const response = NextResponse.json(
      { authenticated: false, policy_version: currentPolicyVersion() },
      { headers: { "Cache-Control": "no-store" } }
    );
    clearBetaSessionCookie(response);
    return response;
  } catch {
    return NextResponse.json(
      { error: BETA_UNAVAILABLE_ERROR, code: "BETA_ACCESS_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
