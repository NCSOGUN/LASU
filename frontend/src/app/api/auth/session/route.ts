import { type NextRequest } from "next/server";
import { meResponseSchema } from "@/api/schemas";
import { ACCESS_COOKIE, UPSTREAM_V1, clearAuthCookies, errorNoStore, jsonNoStore } from "@/lib/auth-bff";
import { logRequest } from "@/lib/log";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return errorNoStore("unauthorized", 401);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM_V1}/me`, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    logRequest("GET", "/me", 504);
    return errorNoStore("upstream_timeout", 504);
  }

  logRequest("GET", "/me", upstream.status);

  if (!upstream.ok) {
    if (upstream.status === 401) {
      const response = errorNoStore("unauthorized", 401);
      clearAuthCookies(response);
      return response;
    }
    return errorNoStore(upstream.status === 403 ? "account_inactive" : "upstream_unavailable", upstream.status);
  }

  const body = await upstream.json().catch(() => null);
  const parsed = meResponseSchema.safeParse(body);
  if (!parsed.success) return errorNoStore("invalid_response", 502);

  return jsonNoStore({ account: parsed.data.account, roles: parsed.data.roles });
}

