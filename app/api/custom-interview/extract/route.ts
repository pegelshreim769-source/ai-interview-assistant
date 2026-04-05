import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ExtractKind = "resume" | "jd_image";

const EXTRACTION_TIMEOUT_MS = 45000;

function providerConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
  };
}

function assertSupportedFile(kind: ExtractKind, fileName: string) {
  const lower = fileName.toLowerCase();

  if (kind === "resume") {
    if (lower.endsWith(".txt") || lower.endsWith(".docx") || lower.endsWith(".pdf")) return;
    throw new Error("当前仅支持 pdf、docx、txt 简历文件。");
  }

  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) return;
  throw new Error("当前仅支持 png、jpg、jpeg、webp 的 JD 截图。");
}

function unwrapProviderText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as
      | string
      | {
          content?: string;
          text?: string;
          data?: string;
          file_type?: string;
          filename?: string;
        };

    if (typeof parsed === "string") return parsed;
    if (typeof parsed?.content === "string") return parsed.content;
    if (typeof parsed?.text === "string") return parsed.text;
    if (typeof parsed?.data === "string") return parsed.data;
  } catch {
    // Fall through and try text-based cleanup.
  }

  const contentMatch = trimmed.match(/"content"\s*:\s*"([\s\S]*?)"\s*,\s*"file_type"/);
  if (contentMatch?.[1]) {
    return contentMatch[1];
  }

  return trimmed;
}

function stripMarkdownSyntax(text: string) {
  return text
    .replace(/```[\w-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.*?)((?<!\*)\*(?!\*))/g, "$1")
    .replace(/(?<!_)_(?!_)(.*?)(?<!_)_(?!_)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*[-=]{3,}\s*$/gm, "")
    .replace(/`([^`]+)`/g, "$1");
}

async function extractWithProvider(file: File) {
  const { apiKey, baseUrl } = providerConfig();

  if (!apiKey) {
    throw new Error("缺少 OPENAI_API_KEY，暂时无法提取上传文件内容。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  try {
    const uploadForm = new FormData();
    uploadForm.append("purpose", "file-extract");
    uploadForm.append("file", file);

    const uploadResponse = await fetch(`${baseUrl}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: uploadForm,
      signal: controller.signal
    });

    const uploadPayload = (await uploadResponse.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!uploadResponse.ok || !uploadPayload.id) {
      throw new Error(uploadPayload.error?.message || "当前模型服务暂不支持文件内容抽取。");
    }

    const contentResponse = await fetch(`${baseUrl}/files/${uploadPayload.id}/content`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });

    const contentText = await contentResponse.text();
    if (!contentResponse.ok) {
      throw new Error(contentText || "提取文件内容失败。");
    }

    return contentText;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("文件提取超时了，请换一份更清晰的文件，或直接粘贴文本内容。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractResumeText(file: File) {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  assertSupportedFile("resume", fileName);

  if (fileName.endsWith(".txt")) {
    return buffer.toString("utf8");
  }

  return extractWithProvider(new File([buffer], file.name, { type: file.type || "application/octet-stream" }));
}

async function extractJdImageText(file: File) {
  assertSupportedFile("jd_image", file.name);
  return extractWithProvider(file);
}

function normalizeExtractedText(text: string) {
  const unwrapped = unwrapProviderText(text)
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"")
    .replace(/\\t/g, " ")
    .replace(/\\\\/g, "\\");

  const plainText = stripMarkdownSyntax(unwrapped);

  return plainText
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
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

    let extractedText = "";

    if (kind === "resume") {
      extractedText = await extractResumeText(file);
    } else {
      extractedText = await extractJdImageText(file);
    }

    const normalized = normalizeExtractedText(extractedText);
    if (!normalized) {
      return NextResponse.json(
        {
          error:
            kind === "resume"
              ? "这份简历文件暂时没能稳定解析，请尝试重新上传，或直接粘贴简历文本。"
              : "没能稳定识别这张截图里的岗位内容，请尝试上传更清晰的图片，或直接粘贴 JD 文本。"
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      extracted_text: normalized,
      original_file_name: file.name,
      parse_source: kind === "resume" ? "uploaded_resume_file" : "uploaded_jd_image"
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "提取失败，请尝试重新上传，或直接粘贴文本内容。"
      },
      { status: 500 }
    );
  }
}
