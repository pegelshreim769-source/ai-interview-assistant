import "server-only";

import { getChatProviderConfig, getProviderFileContent, uploadProviderFile } from "./ai-provider";
import { LIMITS } from "../shared/limits";

export type MaterialExtractKind = "resume" | "jd_image";

const EXTRACTION_TIMEOUT_MS = 45000;

function assertSupportedFile(kind: MaterialExtractKind, fileName: string) {
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
    const parsed = JSON.parse(trimmed) as string | { content?: string; text?: string; data?: string };
    if (typeof parsed === "string") return parsed;
    if (typeof parsed?.content === "string") return parsed.content;
    if (typeof parsed?.text === "string") return parsed.text;
    if (typeof parsed?.data === "string") return parsed.data;
  } catch {
    // Continue with text cleanup.
  }

  const contentMatch = trimmed.match(/"content"\s*:\s*"([\s\S]*?)"\s*,\s*"file_type"/);
  return contentMatch?.[1] || trimmed;
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
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*[-=]{3,}\s*$/gm, "")
    .replace(/`([^`]+)`/g, "$1");
}

function normalizeExtractedText(text: string) {
  const unwrapped = unwrapProviderText(text)
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, " ")
    .replace(/\\\\/g, "\\");

  return stripMarkdownSyntax(unwrapped)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractWithProvider(file: File) {
  const config = getChatProviderConfig();
  if (!config.apiKey) throw new Error("缺少 OPENAI_API_KEY，暂时无法提取上传文件内容。");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  try {
    const uploadResponse = await uploadProviderFile(config, file, "file-extract", controller.signal);
    const uploadPayload = (await uploadResponse.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!uploadResponse.ok || !uploadPayload.id) {
      throw new Error(uploadPayload.error?.message || "当前模型服务暂不支持文件内容抽取。");
    }

    const contentResponse = await getProviderFileContent(config, uploadPayload.id, controller.signal);
    const contentText = await contentResponse.text();
    if (!contentResponse.ok) throw new Error(contentText || "提取文件内容失败。");
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

export async function extractUploadedMaterial(kind: MaterialExtractKind, file: File) {
  assertSupportedFile(kind, file.name);

  if (!file.size) throw new Error("上传的文件为空，请重新选择后再试。");
  if (file.size > LIMITS.UPLOAD_FILE_MAX_BYTES) {
    throw new Error(`上传文件不能超过 ${Math.floor(LIMITS.UPLOAD_FILE_MAX_BYTES / (1024 * 1024))}MB，请压缩后再试。`);
  }

  const rawText =
    kind === "resume" && file.name.toLowerCase().endsWith(".txt")
      ? Buffer.from(await file.arrayBuffer()).toString("utf8")
      : await extractWithProvider(file);
  const extractedText = normalizeExtractedText(rawText);

  if (!extractedText) {
    throw new Error(
      kind === "resume"
        ? "这份简历文件暂时没能稳定解析，请尝试重新上传，或直接粘贴简历文本。"
        : "没能稳定识别这张截图里的岗位内容，请尝试上传更清晰的图片，或直接粘贴 JD 文本。"
    );
  }

  return {
    extracted_text: extractedText,
    original_file_name: file.name,
    parse_source: kind === "resume" ? "uploaded_resume_file" : "uploaded_jd_image"
  };
}
