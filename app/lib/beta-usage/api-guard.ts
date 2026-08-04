import "server-only";

import { requireBetaAccess, type BetaAccessDecision } from "../beta-access/api-auth";
import type { BetaSessionRecord } from "../beta-access/types";
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
};

const defaultDependencies: GuardDependencies = {
  authenticate: requireBetaAccess,
  service: getBetaUsageService,
  hashIp: (request, service) => resolveHashedClientIp(request, service.config)
};

function createIdentity(session: BetaSessionRecord, ipHash: string) {
  return {
    sessionHash: session.session_hash,
    inviteId: session.invite_id,
    ipHash
  };
}

function wrapResponseStream(response: Response, release: () => Promise<void>) {
  if (!response.body) {
    return release().then(() => response);
  }

  const reader = response.body.getReader();
  let released = false;
  const releaseOnce = async () => {
    if (released) return;
    released = true;
    try {
      await release();
    } catch {
      // The Redis lease TTL remains the crash/failure fallback.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          await releaseOnce();
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
        await releaseOnce();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await releaseOnce();
      }
    }
  });

  return Promise.resolve(
    new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  );
}

export function createMeteredBetaAccess(dependencies: GuardDependencies = defaultDependencies) {
  return function withMeteredBetaAccess<Args extends unknown[]>(
    options: { endpoint: BetaAiEndpoint },
    handler: MeteredHandler<Args>
  ) {
    return async (request: Request, ...args: Args) => {
      const access = await dependencies.authenticate(request);
      if (access.status !== "authorized") return access.response;

      let service: BetaUsageService;
      let identity: ReturnType<typeof createIdentity>;
      try {
        service = dependencies.service();
        identity = createIdentity(access.session, dependencies.hashIp(request, service));
        const rate = await service.recordAiAttempt(identity);
        if (rate.status !== "allowed") return rateLimitResponse(rate);
      } catch {
        return betaUsageUnavailableResponse();
      }

      let leaseId: string;
      try {
        const lease = await service.acquireConcurrencyLease();
        if (lease.status === "busy") {
          return betaUsageErrorResponse({
            status: 503,
            code: "BETA_AI_BUSY",
            error: "当前使用人数较多，请稍后再试。",
            retryAfterSeconds: lease.retryAfterSeconds
          });
        }
        leaseId = lease.leaseId;
      } catch {
        return betaUsageUnavailableResponse();
      }

      const release = () => service.releaseConcurrencyLease(leaseId);
      try {
        const policy = getBetaAiEndpointPolicy(options.endpoint);
        const reservation = await service.reserveUsage(identity, policy);
        if (reservation.status !== "reserved") {
          await release().catch(() => undefined);
          return reservationResponse(reservation);
        }

        const response = await handler(request, ...args);
        if (response.status >= 400) response.headers.set("Cache-Control", "no-store");
        if (policy.streaming) return wrapResponseStream(response, release);
        await release().catch(() => undefined);
        return response;
      } catch {
        await release().catch(() => undefined);
        return betaUsageErrorResponse({
          status: 500,
          code: "BETA_AI_REQUEST_FAILED",
          error: "请求处理失败，请稍后再试。"
        });
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
