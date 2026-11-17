import { type NextRequest } from "next/server";
import { authSuccessSchema, loginBodySchema } from "@/api/schemas";
import {
  UPSTREAM_V1,
  checkCsrf,
  errorNoStore,
  jsonNoStore,
  readJson,
  setAuthCookies,
} from "@/lib/auth-bff";
import { logRequest } from "@/lib/log";

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const parsedBody = loginBodySchema.safeParse(await readJson(request));
  if (!parsedBody.success) {
    return errorNoStore("validation_error", 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM_V1}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(parsedBody.data),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    logRequest("POST", "/auth/login", 504);
    return errorNoStore("upstream_timeout", 504);
  }

  const body = await upstream.json().catch(() => null);
  logRequest("POST", "/auth/login", upstream.status);

  if (!upstream.ok) {
    if (body && typeof body === "object") {
      const error = body as { error?: string; message?: string; request_id?: string };
      return jsonNoStore(
        { error: error.error ?? "unauthorized", message: error.message, request_id: error.request_id },
        upstream.status,
      );
    }
    return errorNoStore(upstream.status === 401 ? "invalid_credentials" : "upstream_unavailable", upstream.status);
  }

  const parsed = authSuccessSchema.safeParse(body);
  if (!parsed.success) return errorNoStore("invalid_response", 502);

  const response = jsonNoStore({ account: parsed.data.account, roles: parsed.data.roles });
  setAuthCookies(response, parsed.data.tokens);
  return response;
}

