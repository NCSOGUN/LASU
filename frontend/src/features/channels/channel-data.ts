import type { FieldDefinition } from "@/api/schemas";

/** E.164: a plus, a non-zero country digit, then 7 to 14 more digits (8 to 15 digits after the plus). */
export const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isE164Phone(value: string): boolean {
  return E164_PHONE_PATTERN.test(value);
}

/** A field is offerable to a channel only when it has a stored value. */
export function fieldHasValue(field: FieldDefinition): boolean {
  const value = field.value;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function fieldsWithValues(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.filter(fieldHasValue);
}

/** Maps consent field keys to labels, keeping the key when a definition is missing. */
export function fieldLabels(fieldKeys: string[], fields: FieldDefinition[]): string[] {
  return fieldKeys.map((key) => fields.find((field) => field.key === key)?.label ?? key);
}

export function joinFieldLabels(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/** The consent copy names every field the channel can read, and nothing else. */
export function consentScopeCopy(channel: string, labels: string[]): string {
  if (labels.length === 0) {
    return `${channel} can read nothing until you choose at least one field.`;
  }
  return `${channel} can read only these fields: ${joinFieldLabels(labels)}. Nothing else in your record is readable through ${channel}.`;
}

export function formatLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
