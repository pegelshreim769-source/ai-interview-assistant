import { NextResponse } from "next/server";
import { withBetaAccess } from "../../lib/beta-access/api-auth";
import { getAsrProviderConfig, requestAudioTranscription } from "../../lib/server/ai-provider";
import { readAssistantTextContent } from "../../lib/server/json-output";
import { LIMITS } from "../../lib/shared/limits";

type AsrResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

async function handlePost(request: Request) {
  try {
    const providerConfig = getAsrProviderConfig();

    if (!providerConfig.apiKey) {
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

    if (file.size > LIMITS.AUDIO_FILE_MAX_BYTES) {
      return NextResponse.json({ error: `录音文件不能超过 ${Math.floor(LIMITS.AUDIO_FILE_MAX_BYTES / (1024 * 1024))}MB，请缩短录音后重试。` }, { status: 400 });
    }

    const providerResponse = await requestAudioTranscription({
      config: providerConfig,
      file,
      language
    });

    const payload = (await providerResponse.json()) as AsrResponse;

    if (!providerResponse.ok) {
      return NextResponse.json({ error: payload.error?.message || "语音转写失败，请稍后再试。" }, { status: providerResponse.status || 500 });
    }

    const text = readAssistantTextContent(payload.choices?.[0]?.message?.content);
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "语音转写失败，请稍后再试。" }, { status: 500 });
  }
}

export const POST = withBetaAccess(handlePost);
