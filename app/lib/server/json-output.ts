import "server-only";

type TextContentPart = {
  type?: string;
  text?: string;
};

export function readAssistantTextContent(content: string | TextContentPart[] | undefined) {
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

function stripMarkdownCodeFence(input: string) {
  return input
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseJsonObject<T>(input: string) {
  const trimmed = stripMarkdownCodeFence(input.trim());
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return null;
    }
  }
}
