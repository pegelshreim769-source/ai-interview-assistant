import "server-only";

import { createHmac } from "node:crypto";

import { BETA_AI_ENDPOINTS, type BetaAiEndpoint } from "../beta-usage/costs";
import { dailyKeysForRange, metricPeriodKeys } from "./periods";
import type {
  AiRequestEvent,
  MetricBreakdown,
  MetricsConfig,
  MetricsRange,
  MetricsSnapshot,
  MetricsStore,
  MetricTotals
} from "./types";

export const LATENCY_BUCKET_UPPER_MS = [500, 1000, 3000, 10_000, 30_000, 60_000, Infinity] as const;

function emptyTotals(): MetricTotals {
  return {
    requests: 0,
    success: 0,
    status4xx: 0,
    status5xx: 0,
    status401: 0,
    status429: 0,
    status503: 0,
    units: 0,
    estimatedCostCents: 0,
    durationMsSum: 0,
    durationMsMax: 0,
    latencyBuckets: LATENCY_BUCKET_UPPER_MS.map(() => 0),
    streamCompleted: 0,
    streamCancelled: 0,
    streamFailed: 0
  };
}

function latencyBucket(durationMs: number) {
  const index = LATENCY_BUCKET_UPPER_MS.findIndex((upper) => durationMs <= upper);
  return index < 0 ? LATENCY_BUCKET_UPPER_MS.length - 1 : index;
}

function encodedModel(model: string) {
  return Buffer.from(model, "utf8").toString("base64url");
}

function decodedModel(model: string) {
  try {
    return Buffer.from(model, "base64url").toString("utf8") || "unknown";
  } catch {
    return "unknown";
  }
}

function incrementsForEvent(event: AiRequestEvent) {
  const ep = `endpoint.${event.endpoint}`;
  const model = `model.${encodedModel(event.model)}`;
  const bucket = latencyBucket(event.duration_ms);
  const values: Record<string, number> = {
    requests: 1,
    success: event.outcome === "success" ? 1 : 0,
    status4xx: event.status >= 400 && event.status < 500 ? 1 : 0,
    status5xx: event.status >= 500 ? 1 : 0,
    status401: event.status === 401 ? 1 : 0,
    status429: event.status === 429 ? 1 : 0,
    status503: event.status === 503 ? 1 : 0,
    units: event.units,
    estimatedCostCents: event.estimated_cost_cents,
    durationMsSum: event.duration_ms,
    [`latency.${bucket}`]: 1,
    streamCompleted: event.stream_state === "completed" ? 1 : 0,
    streamCancelled: event.stream_state === "cancelled" ? 1 : 0,
    streamFailed: event.stream_state === "failed" ? 1 : 0
  };
  const addBreakdown = (prefix: string) => {
    values[`${prefix}.requests`] = 1;
    values[`${prefix}.success`] = event.outcome === "success" ? 1 : 0;
    values[`${prefix}.status4xx`] = event.status >= 400 && event.status < 500 ? 1 : 0;
    values[`${prefix}.status5xx`] = event.status >= 500 ? 1 : 0;
    values[`${prefix}.status401`] = event.status === 401 ? 1 : 0;
    values[`${prefix}.status429`] = event.status === 429 ? 1 : 0;
    values[`${prefix}.status503`] = event.status === 503 ? 1 : 0;
    values[`${prefix}.units`] = event.units;
    values[`${prefix}.estimatedCostCents`] = event.estimated_cost_cents;
    values[`${prefix}.durationMsSum`] = event.duration_ms;
    values[`${prefix}.latency.${bucket}`] = 1;
  };
  addBreakdown(ep);
  if (event.units > 0) addBreakdown(model);
  if (event.error_code) values[`error.${event.error_code}`] = 1;
  return {
    increments: values,
    maxima: {
      durationMsMax: event.duration_ms,
      [`${ep}.durationMsMax`]: event.duration_ms,
      ...(event.units > 0 ? { [`${model}.durationMsMax`]: event.duration_ms } : {})
    }
  };
}

function addMetric(target: MetricTotals, metric: string, value: number) {
  if (metric.startsWith("latency.")) {
    const bucket = Number(metric.slice("latency.".length));
    if (Number.isInteger(bucket) && bucket >= 0 && bucket < target.latencyBuckets.length) {
      target.latencyBuckets[bucket] += value;
    }
    return;
  }
  if (metric === "durationMsMax") {
    target.durationMsMax = Math.max(target.durationMsMax, value);
    return;
  }
  if (metric in target && metric !== "latencyBuckets") {
    (target as unknown as Record<string, number>)[metric] += value;
  }
}

function metricFromFields(fields: Record<string, number>, prefix = "") {
  const totals = emptyTotals();
  for (const [field, value] of Object.entries(fields)) {
    if (prefix && !field.startsWith(`${prefix}.`)) continue;
    const metric = prefix ? field.slice(prefix.length + 1) : field;
    if (!prefix && (metric.startsWith("endpoint.") || metric.startsWith("model.") || metric.startsWith("error."))) continue;
    addMetric(totals, metric, value);
  }
  return totals;
}

export function approximateP95(totals: MetricTotals) {
  if (totals.requests === 0) return 0;
  const target = Math.ceil(totals.requests * 0.95);
  let cumulative = 0;
  for (let index = 0; index < totals.latencyBuckets.length; index += 1) {
    cumulative += totals.latencyBuckets[index];
    if (cumulative >= target) {
      const upper = LATENCY_BUCKET_UPPER_MS[index];
      return Number.isFinite(upper) ? upper : 60_001;
    }
  }
  return totals.durationMsMax;
}

export class MetricsService {
  constructor(
    private readonly store: MetricsStore,
    readonly config: MetricsConfig,
    private readonly now: () => number = Date.now
  ) {}

  async record(event: AiRequestEvent, sessionHash?: string) {
    const nowMs = this.now();
    const periods = metricPeriodKeys(nowMs, this.config.timezone);
    const activeSessionId = sessionHash
      ? createHmac("sha256", this.config.activeSessionHmacSecret)
          .update(`active-session:${sessionHash}`, "utf8")
          .digest("hex")
      : undefined;
    const metrics = incrementsForEvent(event);
    await this.store.record({
      ...periods,
      hourlyTtlSeconds: this.config.hourlyRetentionHours * 60 * 60,
      dailyTtlSeconds: this.config.dailyRetentionDays * 24 * 60 * 60,
      activeSessionId,
      ...metrics
    });
  }

  async snapshot(range: MetricsRange): Promise<MetricsSnapshot> {
    const nowMs = this.now();
    const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
    const dayKeys = dailyKeysForRange(nowMs, this.config.timezone, days);
    const records = await this.store.readDaily(dayKeys);
    const merged: Record<string, number> = {};
    for (const record of records) {
      for (const [field, raw] of Object.entries(record.values)) {
        const value = Number(raw);
        if (Number.isFinite(value)) {
          merged[field] = field.endsWith("durationMsMax")
            ? Math.max(merged[field] || 0, value)
            : (merged[field] || 0) + value;
        }
      }
    }

    const endpoints = (Object.keys(BETA_AI_ENDPOINTS) as BetaAiEndpoint[]).map((endpoint) => ({
      key: endpoint,
      ...metricFromFields(merged, `endpoint.${endpoint}`)
    }));
    const modelIds = new Set<string>();
    const errors = new Set<string>();
    for (const field of Object.keys(merged)) {
      if (field.startsWith("model.")) modelIds.add(field.split(".")[1]);
      if (field.startsWith("error.")) errors.add(field.slice("error.".length));
    }
    const models: MetricBreakdown[] = Array.from(modelIds).map((id) => ({
      key: decodedModel(id),
      ...metricFromFields(merged, `model.${id}`)
    }));
    const errorRows = Array.from(errors).map((code) => ({
      code,
      count: merged[`error.${code}`] || 0,
      trend: records.map(({ period, values }) => ({
        period,
        count: Number(values[`error.${code}`] || 0)
      }))
    }));

    return {
      range,
      generatedAt: new Date(nowMs).toISOString(),
      totals: metricFromFields(merged),
      activeAnonymousSessions: await this.store.countActiveDaily(dayKeys),
      endpoints,
      models,
      errors: errorRows.sort((a, b) => b.count - a.count)
    };
  }
}
