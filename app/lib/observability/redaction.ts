import type { BetaAiEndpoint } from "../beta-usage/costs";
import {
  OBSERVABILITY_ERROR_CODES,
  type ObservabilityErrorCode,
  type ProviderKind,
  type RequestOutcome
} from "./types";

const ERROR_CODE_SET = new Set<string>(OBSERVABILITY_ERROR_CODES);

export function sanitizeErrorCode(value: string | undefined): ObservabilityErrorCode | undefined {
  if (!value) return undefined;
  return ERROR_CODE_SET.has(value) ? (value as ObservabilityErrorCode) : "INTERNAL_ERROR";
}

export function statusClass(status: number) {
  if (status >= 500) return "5xx" as const;
  if (status >= 400) return "4xx" as const;
  if (status >= 300) return "3xx" as const;
  return "2xx" as const;
}

export function outcomeForStatus(status: number, rejected = false): RequestOutcome {
  if (rejected) return "rejected";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return "success";
}

export function handlerErrorCode(status: number): ObservabilityErrorCode | undefined {
  if (status < 400) return undefined;
  if (status === 400) return "HANDLER_BAD_REQUEST";
  if (status < 500) return "HANDLER_CLIENT_ERROR";
  return "HANDLER_SERVER_ERROR";
}

export function modelForEndpoint(endpoint: BetaAiEndpoint): {
  providerKind: ProviderKind;
  model: string;
} {
  const asr = endpoint === "transcribe" || endpoint === "mock_interview_transcribe";
  const raw = asr ? process.env.DASHSCOPE_ASR_MODEL : process.env.OPENAI_MODEL;
  return {
    providerKind: asr ? "asr" : "chat",
    model: sanitizeModelName(raw)
  };
}

export function sanitizeModelName(value: string | undefined) {
  const normalized = (value || "unconfigured").trim();
  return /^[a-zA-Z0-9._:/-]{1,100}$/.test(normalized) ? normalized : "redacted-model";
}

export function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}
