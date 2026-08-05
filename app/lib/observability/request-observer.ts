import "server-only";

import type { BetaAiEndpoint, BetaAiEndpointPolicy } from "../beta-usage/costs";
import { safeLog, type SafeLogEvent, type SafeLogWriter } from "./logger";
import {
  handlerErrorCode,
  isRetryableStatus,
  modelForEndpoint,
  outcomeForStatus,
  sanitizeErrorCode,
  statusClass
} from "./redaction";
import { getMetricsService } from "./server";
import type { MetricsService } from "./metrics-service";
import type { ObservabilityErrorCode, StreamState } from "./types";

export type ObservationFinalState = {
  status: number;
  errorCode?: string;
  rejected?: boolean;
  charged?: boolean;
  streamState?: StreamState;
};

export type RequestObserver = {
  finish(state: ObservationFinalState): Promise<void>;
  attachSession(sessionHash: string): void;
};

type ObserverOptions = {
  requestId: string;
  endpoint: BetaAiEndpoint;
  policy: BetaAiEndpointPolicy;
  estimatedCentsPerUnit: number;
  startedAtMs?: number;
  now?: () => number;
  metrics?: () => MetricsService;
  logger?: (event: SafeLogEvent) => void;
};

export function createRequestObserver(options: ObserverOptions): RequestObserver {
  const startedAtMs = options.startedAtMs ?? Date.now();
  const now = options.now ?? Date.now;
  const metrics = options.metrics ?? getMetricsService;
  const log = options.logger ?? safeLog;
  let sessionHash: string | undefined;
  let finished = false;

  return {
    attachSession(value) {
      sessionHash = value;
    },
    async finish(state) {
      if (finished) return;
      finished = true;
      const finishedAt = now();
      const model = modelForEndpoint(options.endpoint);
      const errorCode = sanitizeErrorCode(
        state.errorCode || (state.rejected ? undefined : handlerErrorCode(state.status))
      );
      const event = {
        event: "ai_request_completed" as const,
        request_id: options.requestId,
        timestamp: new Date(finishedAt).toISOString(),
        endpoint: options.endpoint,
        provider_kind: model.providerKind,
        model: model.model,
        status: state.status,
        status_class: statusClass(state.status),
        outcome: outcomeForStatus(state.status, state.rejected),
        ...(errorCode ? { error_code: errorCode } : {}),
        duration_ms: Math.max(0, Math.round(finishedAt - startedAtMs)),
        units: state.charged ? options.policy.units : 0,
        estimated_cost_cents: state.charged
          ? options.policy.units * options.estimatedCentsPerUnit
          : 0,
        stream_state: state.streamState ?? "not_streaming",
        retryable: isRetryableStatus(state.status)
      };
      try {
        log(event);
      } catch {
        // Custom writers used by tests or deployments remain non-blocking.
      }
      try {
        await metrics().record(event, sessionHash);
      } catch {
        // Aggregate metrics are best-effort and never replace a protected user response.
      }
    }
  };
}

export function noOpRequestObserver(): RequestObserver {
  return { attachSession: () => undefined, finish: async () => undefined };
}

export type { ObservabilityErrorCode, SafeLogWriter };
