import { NextResponse, type NextRequest } from "next/server";

export const ACCESS_COOKIE = "ha_at";
export const REFRESH_COOKIE = "ha_rt";
export const ACCESS_MAX_AGE = 900;
export const REFRESH_MAX_AGE = 2_592_000;

export const API_ORIGIN = (process.env.HEALTHACCESS_API_ORIGIN ?? "https://healthaccess.billzpay.com.ng").replace(/\/+$/, "");
export const UPSTREAM_V1 = `${API_ORIGIN}/v1`;

const isProduction = process.env.NODE_ENV === "production";

export const noStoreHeaders = {
  "Cache-Control": "no-store",
} as const;

export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export function errorNoStore(error: string, status: number, requestId?: string) {
  return jsonNoStore(requestId ? { error, request_id: requestId } : { error }, status);
}

/**
 * SameSite=Lax cookies plus this explicit check. Every BFF mutation must carry
 * X-HA-Client: web and an Origin that matches the request host. Using the Host
 * header (and proxy headers when present) avoids Next normalising localhost.
 */
export function checkCsrf(request: NextRequest): NextResponse | null {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return null;

  if (request.headers.get("x-ha-client") !== "web") {
    return jsonNoStore({ error: "forbidden", message: "Missing client header" }, 403);
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? new URL(request.url).protocol.replace(":", "");
  const expected = host ? `${proto}://${host}` : new URL(request.url).origin;

  if (!origin || origin !== expected) {
    return jsonNoStore({ error: "forbidden", message: "Origin not allowed" }, 403);
  }

  return null;
}

export function setAuthCookies(response: NextResponse, tokens: { access_token: string; refresh_token: string }) {
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: tokens.access_token,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  response.cookies.set({
    name: REFRESH_COOKIE,
    value: tokens.refresh_token,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: "",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set({
    name: REFRESH_COOKIE,
    value: "",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 0,
  });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
