import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "interview-studio"
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
