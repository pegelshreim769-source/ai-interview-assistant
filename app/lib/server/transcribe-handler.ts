import "server-only";

import { NextResponse } from "next/server";
import { getAsrProviderConfig, requestAudioTranscription } from "./ai-provider";
import { readAssistantTextContent } from "./json-output";
import { LIMITS } from "../shared/limits";

type AsrResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
};

export async function handleTranscriptionPost(request: Request) {
  try {
    const providerConfig = getAsrProviderConfig();
    if (!providerConfig.apiKey) {
      return NextResponse.json({ error: "语音转写服务暂未配置，请稍后再试。" }, { status: 503 });
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
    if (file.size > LIMITS.AUDIO_FILE_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `录音文件不能超过 ${Math.floor(
            LIMITS.AUDIO_FILE_MAX_BYTES / (1024 * 1024)
          )}MB，请缩短录音后重试。`
        },
        { status: 400 }
      );
    }

    const providerResponse = await requestAudioTranscription({ config: providerConfig, file, language });
    const payload = (await providerResponse.json()) as AsrResponse;
    if (!providerResponse.ok) {
      return NextResponse.json(
        { error: "语音转写失败，请稍后再试。" },
        { status: providerResponse.status || 500 }
      );
    }
    return NextResponse.json({ text: readAssistantTextContent(payload.choices?.[0]?.message?.content) });
  } catch {
    return NextResponse.json({ error: "语音转写失败，请稍后再试。" }, { status: 500 });
  }
}
