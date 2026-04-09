import "server-only";

export type ProviderKind = "openai" | "moonshot" | "dashscope" | "compatible";

export type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  kind: ProviderKind;
};

type JsonSchemaConfig = {
  name: string;
  strict?: boolean;
  schema: Record<string, unknown>;
};

type ResponseFormat =
  | {
      type: "text";
    }
  | {
      type: "json_object";
    }
  | {
      type: "json_schema";
      json_schema: JsonSchemaConfig;
    };

type RequestChatCompletionOptions = {
  config: ProviderConfig;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | Array<Record<string, unknown>>;
  }>;
  stream?: boolean;
  responseFormat?: ResponseFormat;
  extraBody?: Record<string, unknown>;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function detectProviderKind(baseUrl: string): ProviderKind {
  const normalized = normalizeBaseUrl(baseUrl).toLowerCase();

  if (normalized.includes("moonshot") || normalized.includes("kimi")) return "moonshot";
  if (normalized.includes("dashscope")) return "dashscope";
  if (normalized.includes("openai")) return "openai";
  return "compatible";
}

function resolveResponseFormat(kind: ProviderKind, format: ResponseFormat | undefined) {
  if (!format) return undefined;

  if (format.type === "json_schema" && kind === "moonshot") {
    return {
      response_format: {
        type: "json_object" as const
      },
      extraBody: {
        thinking: {
          type: "disabled" as const
        }
      }
    };
  }

  return {
    response_format: format,
    extraBody: {}
  };
}

export function getChatProviderConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";

  return {
    apiKey,
    baseUrl,
    model,
    kind: detectProviderKind(baseUrl)
  } satisfies ProviderConfig;
}

export function getAsrProviderConfig() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim() || "";
  const baseUrl = normalizeBaseUrl(process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1");
  const model = process.env.DASHSCOPE_ASR_MODEL?.trim() || "qwen3-asr-flash";

  return {
    apiKey,
    baseUrl,
    model,
    kind: detectProviderKind(baseUrl)
  } satisfies ProviderConfig;
}

export async function requestChatCompletion({
  config,
  messages,
  stream = false,
  responseFormat,
  extraBody = {}
}: RequestChatCompletionOptions) {
  const resolved = resolveResponseFormat(config.kind, responseFormat);

  return fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream,
      ...(resolved?.response_format ? { response_format: resolved.response_format } : {}),
      ...(resolved?.extraBody || {}),
      ...extraBody
    })
  });
}

export async function uploadProviderFile(config: ProviderConfig, file: File, purpose = "file-extract", signal?: AbortSignal) {
  const formData = new FormData();
  formData.append("purpose", purpose);
  formData.append("file", file);

  return fetch(`${config.baseUrl}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    },
    body: formData,
    signal
  });
}

export async function getProviderFileContent(config: ProviderConfig, fileId: string, signal?: AbortSignal) {
  return fetch(`${config.baseUrl}/files/${fileId}/content`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    },
    signal
  });
}
