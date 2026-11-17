export const REVEAL_DURATION_MS = 30_000;
export const PATIENT_CODE_LENGTH = 12;
export const GRANT_CODE_LENGTH = 8;
export const GRANT_FIELD_GROUP = 4;

/** Keep only digits, capped at the expected length. Codes are never formatted into URLs or storage. */
export function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

/** Group a code into readable blocks, for example 4821 9367 or 1234 5678 9012. */
export function groupCode(value: string, size = GRANT_FIELD_GROUP): string {
  const compact = value.replace(/\s+/g, "");
  if (!compact || size < 1) return compact;
  const chunks: string[] = [];
  for (let index = 0; index < compact.length; index += size) {
    chunks.push(compact.slice(index, index + size));
  }
  return chunks.join(" ");
}

/** Mask every character except the last visible characters, keeping the same group rhythm. */
export function maskCode(value: string, visible = GRANT_FIELD_GROUP): string {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= visible) return groupCode(compact);
  const hidden = compact.slice(0, -visible).replace(/./g, "\u2022");
  return groupCode(`${hidden}${compact.slice(-visible)}`);
}

/** Present a shared field value without assuming which JSON shape the API returned. */
export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "Not recorded";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
