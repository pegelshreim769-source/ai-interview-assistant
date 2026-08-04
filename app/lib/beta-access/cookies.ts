import "server-only";

import type { NextResponse } from "next/server";

export const BETA_SESSION_COOKIE = "interview_beta_session";

export function readBetaSessionToken(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const segment of cookieHeader.split(";")) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex < 0) continue;
    const name = segment.slice(0, separatorIndex).trim();
    if (name !== BETA_SESSION_COOKIE) continue;
    const rawValue = segment.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return "";
    }
  }
  return "";
}

export function setBetaSessionCookie(response: NextResponse, token: string, expiresAtMs: number) {
  response.cookies.set({
    name: BETA_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAtMs)
  });
}

export function clearBetaSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: BETA_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0
  });
}
