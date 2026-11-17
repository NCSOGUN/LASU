import { localDayKey } from "@/lib/format";

export function isFieldFilled(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function profileCompleteness<T extends { value: unknown }>(fields: T[]) {
  return {
    filled: fields.filter((field) => isFieldFilled(field.value)).length,
    total: fields.length,
  };
}

export function activeGrantCount(grants: Array<{ status: string }>) {
  return grants.filter((grant) => grant.status === "active").length;
}

export function emergencyStatus(summary: { available?: boolean; fields?: unknown[]; field_keys?: unknown[] } | undefined) {
  if (!summary?.available) return { available: false, count: 0 };
  return { available: true, count: summary.fields?.length ?? summary.field_keys?.length ?? 0 };
}

export function latestSymptoms<T extends { created_at: string }>(records: T[], limit = 3): T[] {
  return [...records]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export function todaysMoments<T extends { time: string }>(moments: T[], now: Date, timeZone?: string): T[] {
  const today = localDayKey(now.toISOString(), timeZone);
  return moments.filter((moment) => localDayKey(moment.time, timeZone) === today);
}
