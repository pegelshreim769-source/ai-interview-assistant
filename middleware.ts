import { NextRequest, NextResponse } from "next/server";
import { readBetaSessionToken } from "./app/lib/beta-access/cookies";
import { getBetaAccessService } from "./app/lib/beta-access/server";
import { sanitizeInternalNextPath } from "./app/lib/beta-access/redirect";

export async function middleware(request: NextRequest) {
  const requestedPath = sanitizeInternalNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  const accessUrl = new URL("/access", request.url);
  accessUrl.searchParams.set("next", requestedPath);
  const token = readBetaSessionToken(request);

  if (!token) return NextResponse.redirect(accessUrl);

  try {
    const result = await getBetaAccessService().validateSession(token);
    if (result.status === "valid") return NextResponse.next();
    return NextResponse.redirect(accessUrl);
  } catch {
    accessUrl.searchParams.set("error", "service_unavailable");
    return NextResponse.redirect(accessUrl);
  }
}

export const config = {
  matcher: ["/", "/resume-studio/:path*", "/mock-interview/:path*", "/custom-interview/:path*"],
  runtime: "nodejs"
};
