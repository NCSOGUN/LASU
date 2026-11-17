/** Only same-origin absolute paths are allowed as post-auth redirect targets. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/app";
  if (!next.startsWith("/")) return "/app";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/app";
  if (/[\\\u0000-\u001f]/.test(next)) return "/app";
  return next;
}
