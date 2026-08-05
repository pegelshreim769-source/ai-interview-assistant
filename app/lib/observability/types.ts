import type { BetaAiEndpoint } from "../beta-usage/costs";

export const OBSERVABILITY_ERROR_CODES = [
  "BETA_ACCESS_REQUIRED",
  "BETA_ACCESS_UNAVAILABLE",
  "BETA_USER_RATE_LIMITED",
  "BETA_IP_RATE_LIMITED",
  "BETA_DAILY_QUOTA_EXHAUSTED",
  "BETA_BUDGET_REDUCED",
  "BETA_BUDGET_EXHAUSTED",
  "BETA_AI_BUSY",
  "BETA_USAGE_UNAVAILABLE",
  "HANDLER_BAD_REQUEST",
  "HANDLER_CLIENT_ERROR",
  "HANDLER_SERVER_ERROR",
  "STREAM_FAILED",
  "STREAM_CANCELLED",
  "INTERNAL_ERROR"
] as const;

export type ObservabilityErrorCode = (typeof OBSERVABILITY_ERROR_CODES)[number];
export type RequestOutcome = "success" | "client_error" | "server_error" | "rejected";
export type StreamState = "not_streaming" | "completed" | "cancelled" | "failed";
export type ProviderKind = "chat" | "asr";

export type AiRequestEvent = {
  event: "ai_request_completed";
  request_id: string;
  timestamp: string;
  endpoint: BetaAiEndpoint;
  provider_kind: ProviderKind;
  model: string;
  status: number;
  status_class: "2xx" | "3xx" | "4xx" | "5xx";
  outcome: RequestOutcome;
  error_code?: ObservabilityErrorCode;
  duration_ms: number;
  units: number;
  estimated_cost_cents: number;
  stream_state: StreamState;
  retryable: boolean;
};

export type BudgetWarningEvent = {
  event: "budget_warning";
  request_id: string;
  timestamp: string;
  endpoint: BetaAiEndpoint;
  provider_kind: ProviderKind;
  model: string;
  status: 200;
  status_class: "2xx";
  outcome: "success";
  duration_ms: 0;
  units: number;
  estimated_cost_cents: number;
  stream_state: "not_streaming";
  retryable: false;
};

export type MetricsConfig = {
  hourlyRetentionHours: number;
  dailyRetentionDays: number;
  timezone: string;
  activeSessionHmacSecret: string;
};

export type MetricsWrite = {
  event: AiRequestEvent;
  activeSessionId?: string;
  nowMs: number;
};

export type MetricsRange = "today" | "7d" | "30d";

export type MetricTotals = {
  requests: number;
  success: number;
  status4xx: number;
  status5xx: number;
  status401: number;
  status429: number;
  status503: number;
  units: number;
  estimatedCostCents: number;
  durationMsSum: number;
  durationMsMax: number;
  latencyBuckets: number[];
  streamCompleted: number;
  streamCancelled: number;
  streamFailed: number;
};

export type MetricBreakdown = MetricTotals & { key: string };

export type MetricsSnapshot = {
  range: MetricsRange;
  generatedAt: string;
  totals: MetricTotals;
  activeAnonymousSessions: number;
  endpoints: MetricBreakdown[];
  models: MetricBreakdown[];
  errors: Array<{ code: string; count: number; trend: Array<{ period: string; count: number }> }>;
};

export interface MetricsStore {
  record(input: {
    hourKey: string;
    dayKey: string;
    hourlyTtlSeconds: number;
    dailyTtlSeconds: number;
    activeSessionId?: string;
    increments: Record<string, number>;
    maxima: Record<string, number>;
  }): Promise<void>;
  readDaily(dayKeys: string[]): Promise<Array<{ period: string; values: Record<string, string> }>>;
  countActiveDaily(dayKeys: string[]): Promise<number>;
}

export type BudgetStatus = "normal" | "warning" | "reduced" | "exhausted";

export type BudgetSnapshot = {
  day: { usedCents: number; budgetCents: number; percentage: number; status: BudgetStatus };
  month: { usedCents: number; budgetCents: number; percentage: number; status: BudgetStatus };
};

export type AdminUsageResponse = MetricsSnapshot & {
  budget: BudgetSnapshot;
  tokenUsageAvailable: false;
  costNotice: string;
};
