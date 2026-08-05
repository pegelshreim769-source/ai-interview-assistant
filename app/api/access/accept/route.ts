import { NextResponse } from "next/server";
import { BETA_UNAVAILABLE_ERROR } from "../../../lib/beta-access/api-auth";
import { readBetaSessionToken } from "../../../lib/beta-access/cookies";
import { getBetaAccessService } from "../../../lib/beta-access/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = readBetaSessionToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "封闭测试会话无效或已过期，请使用邀请码重新进入。", code: "BETA_ACCESS_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > 1024) {
      return NextResponse.json(
        { error: "请求内容过长，请检查后重试。", code: "INVALID_ACCESS_REQUEST" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    const body = JSON.parse(rawBody) as { accept_policies?: unknown; policy_version?: unknown };
    const result = await getBetaAccessService().acceptCurrentPolicy(token, {
      accepted: body.accept_policies === true,
      policyVersion: typeof body.policy_version === "string" ? body.policy_version : ""
    });
    if (result.status !== "valid") {
      return NextResponse.json(
        { error: "请确认当前版本的用户协议和隐私政策。", code: "BETA_POLICY_ACCEPTANCE_REQUIRED" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { authenticated: true, expires_at: new Date(result.session.expires_at_ms).toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: BETA_UNAVAILABLE_ERROR, code: "BETA_ACCESS_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
