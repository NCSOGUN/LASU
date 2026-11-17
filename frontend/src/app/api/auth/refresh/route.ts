import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { refreshResponseSchema } from "@/api/schemas";
import {
  REFRESH_COOKIE,
  UPSTREAM_V1,
  checkCsrf,
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-bff";
import { logRequest } from "@/lib/log";

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    const response = NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    clearAuthCookies(response);
    return response;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM_V1}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    logRequest("POST", "/auth/refresh", 504);
    const response = NextResponse.json({ error: "upstream_timeout" }, { status: 504, headers: { "Cache-Control": "no-store" } });
    clearAuthCookies(response);
    return response;
  }

  logRequest("POST", "/auth/refresh", upstream.status);

  if (!upstream.ok) {
    const response = NextResponse.json(
      { error: "invalid_refresh_token" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
    clearAuthCookies(response);
    return response;
  }

  const body = await upstream.json().catch(() => null);
  const parsed = refreshResponseSchema.safeParse(body);
  if (!parsed.success) {
    const response = NextResponse.json(
      { error: "invalid_response" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
    clearAuthCookies(response);
    return response;
  }

  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  setAuthCookies(response, parsed.data.tokens);
  return response;
}

