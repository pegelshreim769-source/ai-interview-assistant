import type { UsagePeriods } from "./types";

function dateParts(nowMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(nowMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day };
}

function periodKey(nowMs: number, timeZone: string, unit: "day" | "month") {
  const parts = dateParts(nowMs, timeZone);
  return unit === "day" ? `${parts.year}-${parts.month}-${parts.day}` : `${parts.year}-${parts.month}`;
}

function findNextBoundary(nowMs: number, timeZone: string, unit: "day" | "month") {
  const currentKey = periodKey(nowMs, timeZone, unit);
  let low = nowMs;
  let high = nowMs + (unit === "day" ? 2 * 24 * 60 * 60 * 1000 : 40 * 24 * 60 * 60 * 1000);

  if (periodKey(high, timeZone, unit) === currentKey) {
    throw new Error("Unable to resolve beta usage period boundary.");
  }

  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2);
    if (periodKey(middle, timeZone, unit) === currentKey) low = middle;
    else high = middle;
  }
  return high;
}

export function getUsagePeriods(nowMs: number, timeZone: string): UsagePeriods {
  const nextDay = findNextBoundary(nowMs, timeZone, "day");
  const nextMonth = findNextBoundary(nowMs, timeZone, "month");
  const secondsToDay = Math.max(1, Math.ceil((nextDay - nowMs) / 1000));
  const secondsToMonth = Math.max(1, Math.ceil((nextMonth - nowMs) / 1000));
  return {
    dayKey: periodKey(nowMs, timeZone, "day"),
    monthKey: periodKey(nowMs, timeZone, "month"),
    dayTtlSeconds: secondsToDay + 2 * 24 * 60 * 60,
    monthTtlSeconds: secondsToMonth + 40 * 24 * 60 * 60,
    dailyRetryAfterSeconds: secondsToDay
  };
}
