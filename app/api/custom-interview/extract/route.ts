import { NextResponse } from "next/server";
import { withMeteredBetaAccess } from "../../../lib/beta-usage/api-guard";
import { extractUploadedMaterial, type MaterialExtractKind } from "../../../lib/server/material-extraction";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  try {
    const formData = await request.formData();
    const kind = formData.get("kind");
    const file = formData.get("file");

    if (kind !== "resume" && kind !== "jd_image") {
      return NextResponse.json({ error: "不支持的提取类型。" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少需要提取的文件。" }, { status: 400 });
    }

    return NextResponse.json(await extractUploadedMaterial(kind as MaterialExtractKind, file));
  } catch {
    return NextResponse.json(
      { error: "提取失败，请尝试重新上传，或直接粘贴文本内容。" },
      { status: 500 }
    );
  }
}

export const POST = withMeteredBetaAccess({ endpoint: "custom_interview_extract" }, handlePost);
