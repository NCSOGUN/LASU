import { type NextRequest } from "next/server";
import { authSuccessSchema, registerBodySchema } from "@/api/schemas";
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

  const parsedBody = registerBodySchema.safeParse(await readJson(request));
  if (!parsedBody.success) {
    return jsonNoStore(
      {
        error: "validation_error",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM_V1}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(parsedBody.data),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    logRequest("POST", "/auth/register", 504);
    return errorNoStore("upstream_timeout", 504);
  }

  const body = await upstream.json().catch(() => null);
  logRequest("POST", "/auth/register", upstream.status);

  if (!upstream.ok) {
    if (body && typeof body === "object") {
      const error = body as { error?: string; message?: string; request_id?: string; issues?: unknown };
      return jsonNoStore(
        { error: error.error ?? "upstream_unavailable", message: error.message, request_id: error.request_id, issues: error.issues },
        upstream.status,
      );
    }
    return errorNoStore(upstream.status >= 500 ? "upstream_unavailable" : "validation_error", upstream.status);
  }

  const parsed = authSuccessSchema.safeParse(body);
  if (!parsed.success) return errorNoStore("invalid_response", 502);

  const response = jsonNoStore({ account: parsed.data.account, roles: parsed.data.roles }, 201);
  setAuthCookies(response, parsed.data.tokens);
  return response;
}

