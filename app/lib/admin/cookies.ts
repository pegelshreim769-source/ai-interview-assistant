import "server-only";

import type { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "interview_admin_session";

export function readAdminSessionToken(request: Request) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.split("=");
    if (name.trim() !== ADMIN_SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(rest.join("=").trim());
    } catch {
      return "";
    }
  }
  return "";
}

export function setAdminSessionCookie(response: NextResponse, token: string, expiresAtMs: number) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAtMs)
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
    maxAge: 0
  });
}
