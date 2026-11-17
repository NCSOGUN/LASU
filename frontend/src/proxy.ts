import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth-bff";

/**
 * Route guard only. It never decodes a JWT and never touches codes.
 * Role checks live in the page, using the session query.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(ACCESS_COOKIE)?.value || request.cookies.get(REFRESH_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname;
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/practitioner/:path*", "/lookup"],
};
