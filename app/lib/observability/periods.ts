const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function parts(nowMs: number, timeZone: string) {
  const result = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(new Date(nowMs))
      .map((part) => [part.type, part.value])
  );
  return result as Record<string, string>;
}

export function metricPeriodKeys(nowMs: number, timeZone: string) {
  const value = parts(nowMs, timeZone);
  const dayKey = `${value.year}-${value.month}-${value.day}`;
  return { dayKey, hourKey: `${dayKey}T${value.hour}` };
}

export function dailyKeysForRange(nowMs: number, timeZone: string, days: number) {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(metricPeriodKeys(nowMs - offset * DAY_MS, timeZone).dayKey);
  }
  return Array.from(new Set(keys));
}
