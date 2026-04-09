import { NextResponse } from "next/server";
import { readServerSessions, type SessionMode, upsertServerSession } from "../../../lib/server/session-store";

type SessionPayload = {
  session_id?: string;
  updated_at?: string;
  status?: string;
};

type StoredSession = SessionPayload & {
  session_id: string;
};

function isSessionMode(mode: string): mode is SessionMode {
  return mode === "mock-interview" || mode === "custom-interview";
}

function validClientId(clientId: string) {
  return !!clientId.trim() && clientId.length <= 64;
}

export async function GET(request: Request, context: { params: { mode: string } }) {
  try {
    const mode = context.params.mode;
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id") || "";

    if (!isSessionMode(mode)) {
      return NextResponse.json({ error: "不支持的会话模式。" }, { status: 400 });
    }

    if (!validClientId(clientId)) {
      return NextResponse.json({ error: "缺少有效的客户端标识。" }, { status: 400 });
    }

    const sessions = await readServerSessions<StoredSession>(mode, clientId);
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取历史记录失败，请稍后再试。" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: { mode: string } }) {
  try {
    const mode = context.params.mode;

    if (!isSessionMode(mode)) {
      return NextResponse.json({ error: "不支持的会话模式。" }, { status: 400 });
    }

    const body = (await request.json()) as {
      client_id?: string;
      session?: SessionPayload;
    };

    if (!validClientId(body.client_id || "")) {
      return NextResponse.json({ error: "缺少有效的客户端标识。" }, { status: 400 });
    }

    if (!body.session?.session_id) {
      return NextResponse.json({ error: "缺少需要保存的会话。" }, { status: 400 });
    }

    const sessions = await upsertServerSession(mode, body.client_id!, body.session as StoredSession);
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存历史记录失败，请稍后再试。" }, { status: 500 });
  }
}
