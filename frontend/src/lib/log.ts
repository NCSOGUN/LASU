/**
 * Server-only logging. Deliberately narrow: path and status only.
 * Never add query strings, bodies, tokens, patient codes or grant codes.
 */
export function logRequest(method: string, pathname: string, status: number) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`${method} ${pathname} ${status}`);
}
