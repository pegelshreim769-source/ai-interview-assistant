import type { AiRequestEvent, BudgetWarningEvent } from "./types";

export type SafeLogEvent = AiRequestEvent | BudgetWarningEvent;
export type SafeLogWriter = (line: string) => void;

export function createSafeLogger(writer: SafeLogWriter = (line) => console.log(line)) {
  return (event: SafeLogEvent) => {
    try {
      const safe = {
        event: event.event,
        request_id: event.request_id,
        timestamp: event.timestamp,
        endpoint: event.endpoint,
        provider_kind: event.provider_kind,
        model: event.model,
        status: event.status,
        status_class: event.status_class,
        outcome: event.outcome,
        ...(event.event === "ai_request_completed" && event.error_code
          ? { error_code: event.error_code }
          : {}),
        duration_ms: event.duration_ms,
        units: event.units,
        estimated_cost_cents: event.estimated_cost_cents,
        stream_state: event.stream_state,
        retryable: event.retryable
      };
      writer(JSON.stringify(safe));
    } catch {
      // Logging is deliberately best-effort and must never change a user response.
    }
  };
}

export const safeLog = createSafeLogger();
