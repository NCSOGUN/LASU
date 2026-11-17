export interface MomentLike {
  time: string;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const keyFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  const key = `${timeZone ?? "local"}:${JSON.stringify(options)}`;
  let existing = cache.get(key);
  if (!existing) {
    existing = new Intl.DateTimeFormat(undefined, { ...options, timeZone });
    cache.set(key, existing);
  }
  return existing;
}

/**
 * Moment times are absolute instants. Render them in the viewer's time zone, or an explicit one in tests.
 * Africa/Lagos shows 2026-11-17T07:00:00.000Z as 08:00.
 */
export function formatMomentTime(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return formatter(timeFormatters, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function formatMomentDay(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Day unavailable";
  return formatter(dayFormatters, timeZone, { weekday: "long", month: "long", day: "numeric" }).format(date);
}

/** A stable local-day key. Built by Intl rather than slicing the ISO string. */
export function momentDayKey(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return formatter(keyFormatters, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export interface MomentGroup<T extends MomentLike> {
  key: string;
  label: string;
  moments: T[];
}

/** Groups moments by the local calendar day of each instant, preserving the API's ascending order. */
export function groupMomentsByDay<T extends MomentLike>(moments: T[], timeZone?: string): MomentGroup<T>[] {
  const groups: MomentGroup<T>[] = [];
  for (const moment of moments) {
    const key = momentDayKey(moment.time, timeZone);
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = { key, label: formatMomentDay(moment.time, timeZone), moments: [] };
      groups.push(group);
    }
    group.moments.push(moment);
  }
  return groups;
}

const scheduleDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Schedule start/end are calendar dates stored as UTC midnight. Formatting them in UTC keeps the chosen day. */
export function formatScheduleDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : scheduleDate.format(date);
}

export function formatScheduleRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "Dates unavailable";
  if (startDate.getTime() === endDate.getTime()) return formatScheduleDate(start);
  return `${formatScheduleDate(start)} to ${formatScheduleDate(end)}`;
}

/** The API sends Decimal values as strings. Number() parses them; an unparseable value falls back to 0. */
export function parseDecimal(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const scoreFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function formatScore(value: string) {
  return scoreFormat.format(parseDecimal(value));
}

/** A local calendar date for the API's day-precision fields. */
export function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Turns the API's UTC-midnight calendar date back into the same local day. */
export function localDateFromUtc(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
