import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { REFRESH_COOKIE, UPSTREAM_V1, checkCsrf, clearAuthCookies } from "@/lib/auth-bff";
import { logRequest } from "@/lib/log";

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    try {
      const upstream = await fetch(`${UPSTREAM_V1}/auth/logout`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      logRequest("POST", "/auth/logout", upstream.status);
    } catch {
      // Clearing the local cookies is the important part; upstream failures do not block sign out.
      logRequest("POST", "/auth/logout", 504);
    }
  }

  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  clearAuthCookies(response);
  return response;
}

