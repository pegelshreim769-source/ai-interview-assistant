import { NextResponse } from "next/server";
import { withBetaAccess } from "../../../lib/beta-access/api-auth";
import { extractUploadedMaterial, type MaterialExtractKind } from "../../../lib/server/material-extraction";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  try {
    const formData = await request.formData();
    const kind = formData.get("kind");
    const file = formData.get("file");

    if (kind !== "resume" && kind !== "jd_image") {
      return NextResponse.json({ error: "不支持的简历工作台提取类型。" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少需要提取的文件。" }, { status: 400 });
    }

    return NextResponse.json(await extractUploadedMaterial(kind as MaterialExtractKind, file));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "材料提取失败，请重新上传或直接粘贴文本。" },
      { status: 500 }
    );
  }
}

export const POST = withBetaAccess(handlePost);
