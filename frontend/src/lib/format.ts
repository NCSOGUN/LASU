/** Shared formatting. Dates and times always use Intl, never string slicing. */

export function formatDate(iso: string, options: { locale?: string; timeZone?: string } = {}) {
  return new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    dateStyle: "medium",
    timeZone: options.timeZone,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, options: { locale?: string; timeZone?: string } = {}) {
  return new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: options.timeZone,
  }).format(new Date(iso));
}

export function formatTime(iso: string, options: { locale?: string; timeZone?: string } = {}) {
  return new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: options.timeZone,
  }).format(new Date(iso));
}

/** YYYY-MM-DD in the chosen timezone, for grouping by local day. */
export function localDayKey(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function formatDistanceKm(km: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(km);
}

/** API decimals arrive as strings. An empty or malformed value is not zero. */
export function parseDecimalString(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Group by local day, preserving the API's time order inside each day. */
export function groupByLocalDay<T extends { time: string }>(items: T[], timeZone?: string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = localDayKey(item.time, timeZone);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].map(([day, items]) => ({ day, items }));
}
