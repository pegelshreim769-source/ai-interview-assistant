import "server-only";

import { requireBetaAccess, type BetaAccessDecision } from "../beta-access/api-auth";
import type { BetaSessionRecord } from "../beta-access/types";
import { createServerRequestId, withRequestId } from "../observability/request-id";
import {
  createRequestObserver,
  noOpRequestObserver,
  type RequestObserver
} from "../observability/request-observer";
import { safeLog } from "../observability/logger";
import { modelForEndpoint } from "../observability/redaction";
import { getBetaAiEndpointPolicy, type BetaAiEndpoint } from "./costs";
import { resolveHashedClientIp } from "./identity";
import {
  betaUsageErrorResponse,
  betaUsageUnavailableResponse,
  invitationRateLimitResponse,
  rateLimitResponse,
  reservationResponse
} from "./responses";
import { getBetaUsageService } from "./server";
import type { BetaUsageService } from "./service";

type MeteredHandler<Args extends unknown[]> = (
  request: Request,
  ...args: Args
) => Response | Promise<Response>;

type GuardDependencies = {
  authenticate: (request: Request) => Promise<BetaAccessDecision>;
  service: () => BetaUsageService;
  hashIp: (request: Request, service: BetaUsageService) => string;
  observe?: (input: {
    requestId: string;
    endpoint: BetaAiEndpoint;
    estimatedCentsPerUnit: number;
    startedAtMs: number;
  }) => RequestObserver;
};

const defaultDependencies: GuardDependencies = {
  authenticate: requireBetaAccess,
  service: getBetaUsageService,
  hashIp: (request, service) => resolveHashedClientIp(request, service.config),
  observe: ({ requestId, endpoint, estimatedCentsPerUnit, startedAtMs }) =>
    createRequestObserver({
      requestId,
      endpoint,
      policy: getBetaAiEndpointPolicy(endpoint),
      estimatedCentsPerUnit,
      startedAtMs
    })
};

function createIdentity(session: BetaSessionRecord, ipHash: string) {
  return {
    sessionHash: session.session_hash,
    inviteId: session.invite_id,
    ipHash
  };
}

function wrapResponseStream(
  response: Response,
  requestId: string,
  release: () => Promise<void>,
  observer: RequestObserver
) {
  if (!response.body) {
    return Promise.allSettled([
      release(),
      observer.finish({ status: response.status, charged: true, streamState: "completed" })
    ]).then(() => withRequestId(response, requestId));
  }

  const reader = response.body.getReader();
  let released = false;
  let cancelled = false;
  const finalizeOnce = async (state: Parameters<RequestObserver["finish"]>[0]) => {
    if (released) return;
    released = true;
    await Promise.allSettled([release(), observer.finish(state)]);
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          if (!cancelled) controller.close();
          await finalizeOnce(
            cancelled
              ? { status: 499, errorCode: "STREAM_CANCELLED", charged: true, streamState: "cancelled" }
              : { status: response.status, charged: true, streamState: "completed" }
          );
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        if (!cancelled) controller.error(error);
        await finalizeOnce(
          cancelled
            ? { status: 499, errorCode: "STREAM_CANCELLED", charged: true, streamState: "cancelled" }
            : { status: 500, errorCode: "STREAM_FAILED", charged: true, streamState: "failed" }
        );
      }
    },
    async cancel(reason) {
      cancelled = true;
      try {
        await reader.cancel(reason);
      } finally {
        await finalizeOnce({
          status: 499,
          errorCode: "STREAM_CANCELLED",
          charged: true,
          streamState: "cancelled"
        });
      }
    }
  });

  return Promise.resolve(
    new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers({ ...Object.fromEntries(response.headers), "X-Request-ID": requestId })
    })
  );
}

export function createMeteredBetaAccess(dependencies: GuardDependencies = defaultDependencies) {
  return function withMeteredBetaAccess<Args extends unknown[]>(
    options: { endpoint: BetaAiEndpoint },
    handler: MeteredHandler<Args>
  ) {
    return async (request: Request, ...args: Args) => {
      const requestId = createServerRequestId();
      const startedAtMs = Date.now();
      const policy = getBetaAiEndpointPolicy(options.endpoint);
      const buildObserver = (estimatedCentsPerUnit: number) =>
        dependencies.observe?.({
          requestId,
          endpoint: options.endpoint,
          estimatedCentsPerUnit,
          startedAtMs
        }) ?? noOpRequestObserver();
      const access = await dependencies.authenticate(request);
      if (access.status !== "authorized") {
        const observer = buildObserver(0);
        await observer.finish({
          status: access.response.status,
          errorCode:
            access.status === "unauthorized" ? "BETA_ACCESS_REQUIRED" : "BETA_ACCESS_UNAVAILABLE",
          rejected: true
        });
        return withRequestId(access.response, requestId);
      }

      let service: BetaUsageService;
      let identity: ReturnType<typeof createIdentity>;
      let observer: RequestObserver;
      try {
        service = dependencies.service();
        observer = buildObserver(service.config.estimatedCentsPerUnit);
        observer.attachSession(access.session.session_hash);
        identity = createIdentity(access.session, dependencies.hashIp(request, service));
        const rate = await service.recordAiAttempt(identity);
        if (rate.status !== "allowed") {
          const response = rateLimitResponse(rate);
          await observer.finish({
            status: response.status,
            errorCode:
              rate.status === "user_limited" ? "BETA_USER_RATE_LIMITED" : "BETA_IP_RATE_LIMITED",
            rejected: true
          });
          return withRequestId(response, requestId);
        }
      } catch {
        observer = buildObserver(0);
        observer.attachSession(access.session.session_hash);
        const response = betaUsageUnavailableResponse();
        await observer.finish({
          status: response.status,
          errorCode: "BETA_USAGE_UNAVAILABLE",
          rejected: true
        });
        return withRequestId(response, requestId);
      }

      let leaseId: string;
      try {
        const lease = await service.acquireConcurrencyLease();
        if (lease.status === "busy") {
          const response = betaUsageErrorResponse({
            status: 503,
            code: "BETA_AI_BUSY",
            error: "当前使用人数较多，请稍后再试。",
            retryAfterSeconds: lease.retryAfterSeconds
          });
          await observer.finish({ status: 503, errorCode: "BETA_AI_BUSY", rejected: true });
          return withRequestId(response, requestId);
        }
        leaseId = lease.leaseId;
      } catch {
        const response = betaUsageUnavailableResponse();
        await observer.finish({
          status: response.status,
          errorCode: "BETA_USAGE_UNAVAILABLE",
          rejected: true
        });
        return withRequestId(response, requestId);
      }

      const release = () => service.releaseConcurrencyLease(leaseId);
      try {
        const reservation = await service.reserveUsage(identity, policy);
        if (reservation.status !== "reserved") {
          await release().catch(() => undefined);
          const response = reservationResponse(reservation);
          const errorCode =
            reservation.status === "daily_quota_exhausted"
              ? "BETA_DAILY_QUOTA_EXHAUSTED"
              : reservation.status === "budget_reduced"
                ? "BETA_BUDGET_REDUCED"
                : "BETA_BUDGET_EXHAUSTED";
          await observer.finish({ status: response.status, errorCode, rejected: true });
          return withRequestId(response, requestId);
        }

        if (reservation.warnedDay || reservation.warnedMonth) {
          const model = modelForEndpoint(options.endpoint);
          safeLog({
            event: "budget_warning",
            request_id: requestId,
            timestamp: new Date().toISOString(),
            endpoint: options.endpoint,
            provider_kind: model.providerKind,
            model: model.model,
            status: 200,
            status_class: "2xx",
            outcome: "success",
            duration_ms: 0,
            units: policy.units,
            estimated_cost_cents: policy.units * service.config.estimatedCentsPerUnit,
            stream_state: "not_streaming",
            retryable: false
          });
        }

        const response = await handler(request, ...args);
        if (response.status >= 400) response.headers.set("Cache-Control", "no-store");
        if (policy.streaming && response.status < 400 && response.body) {
          return wrapResponseStream(response, requestId, release, observer);
        }
        await release().catch(() => undefined);
        await observer.finish({ status: response.status, charged: true });
        return withRequestId(response, requestId);
      } catch {
        await release().catch(() => undefined);
        const response = betaUsageErrorResponse({
          status: 500,
          code: "BETA_AI_REQUEST_FAILED",
          error: "请求处理失败，请稍后再试。"
        });
        await observer.finish({ status: 500, errorCode: "INTERNAL_ERROR", charged: true });
        return withRequestId(response, requestId);
      }
    };
  };
}

export const withMeteredBetaAccess = createMeteredBetaAccess();

type InvitationGuardDependencies = Pick<GuardDependencies, "service" | "hashIp">;

export function createInvitationAttemptGuard(
  dependencies: InvitationGuardDependencies = defaultDependencies
) {
  return async function guardInvitationAttempt(request: Request): Promise<Response | null> {
    try {
      const service = dependencies.service();
      const ipHash = dependencies.hashIp(request, service);
      const result = await service.recordInvitationAttempt(ipHash);
      return result.status === "allowed" ? null : invitationRateLimitResponse(result);
    } catch {
      return betaUsageUnavailableResponse();
    }
  };
}

export const guardInvitationAttempt = createInvitationAttemptGuard();
