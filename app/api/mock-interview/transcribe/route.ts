import { NextResponse } from "next/server";

type DashScopeResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function languageToDashScope(language: string) {
  if (language === "zh-CN" || language === "zh-TW") return "zh";
  return undefined;
}

function detectAudioMimeType(file: File) {
  if (file.type) return file.type;
  if (file.name.endsWith(".mp4") || file.name.endsWith(".m4a")) return "audio/mp4";
  if (file.name.endsWith(".ogg")) return "audio/ogg";
  return "audio/webm";
}

function readContentText(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => item.text?.trim() || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    const baseUrl = (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
    const model = process.env.DASHSCOPE_ASR_MODEL || "qwen3-asr-flash";

    if (!apiKey) {
      return NextResponse.json({ error: "缺少 DASHSCOPE_API_KEY，暂时无法做语音转写。" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const language = String(formData.get("language") || "auto");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少录音文件，请重新录音后再试。" }, { status: 400 });
    }

    if (!file.size) {
      return NextResponse.json({ error: "录音文件为空，请重新录音后再试。" }, { status: 400 });
    }

    const mimeType = detectAudioMimeType(file);
    const base64Audio = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUri = `data:${mimeType};base64,${base64Audio}`;
    const dashScopeLanguage = languageToDashScope(language);

    const providerResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: dataUri
                }
              }
            ]
          }
        ],
        stream: false,
        asr_options: dashScopeLanguage
          ? {
              language: dashScopeLanguage,
              enable_itn: true
            }
          : {
              enable_itn: true
            }
      })
    });

    const payload = (await providerResponse.json()) as DashScopeResponse;

    if (!providerResponse.ok) {
      return NextResponse.json({ error: payload.error?.message || "DashScope 语音转写失败，请稍后再试。" }, { status: providerResponse.status || 500 });
    }

    const text = readContentText(payload.choices?.[0]?.message?.content);

    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "语音转写失败，请稍后再试。" }, { status: 500 });
  }
}
