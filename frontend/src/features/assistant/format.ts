import type { BadgeTone } from "@/components/arc/badge/badge";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Local date and time, from Intl so the browser locale and time zone decide the format. */
export function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : dateTime.format(date);
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : dateOnly.format(date);
}

export type Severity = "MILD" | "MODERATE" | "SEVERE";

export function normaliseSeverity(value: string | null | undefined): Severity | null {
  const upper = value?.toUpperCase();
  if (upper === "MILD" || upper === "MODERATE" || upper === "SEVERE" || upper === "SEVERITY") {
    return upper === "SEVERITY" ? "SEVERE" : upper;
  }
  return null;
}

export function severityLabel(value: string | null | undefined) {
  const severity = normaliseSeverity(value);
  if (!severity) return value || "Severity not set";
  return severity.charAt(0) + severity.slice(1).toLowerCase();
}

export function severityTone(value: string | null | undefined): BadgeTone {
  const severity = normaliseSeverity(value);
  if (severity === "SEVERE") return "danger";
  if (severity === "MODERATE") return "warning";
  if (severity === "MILD") return "success";
  return "neutral";
}
