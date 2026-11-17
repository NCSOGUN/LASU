import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { GET as proxyGet, POST as proxyPost } from "@/app/api/v1/[...path]/route";

function request(path: string, init: { method: string; headers?: Record<string, string>; body?: string; cookies?: string }) {
  const headers = new Headers(init.headers);
  if (init.cookies) headers.set("cookie", init.cookies);
  if (init.body) headers.set("content-type", "application/json");
  return new NextRequest(`http://localhost${path}`, {
    method: init.method,
    headers,
    body: init.body,
  });
}

describe("CSRF protection", () => {
  it("rejects a mutation without X-HA-Client", async () => {
    const response = await logoutPost(
      request("/api/auth/logout", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a mutation from another origin", async () => {
    const response = await logoutPost(
      request("/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.example", "x-ha-client": "web" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a mutation with no Origin", async () => {
    const response = await logoutPost(
      request("/api/auth/logout", {
        method: "POST",
        headers: { "x-ha-client": "web" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("accepts a same-origin mutation and clears both cookies", async () => {
    const response = await logoutPost(
      request("/api/auth/logout", {
        method: "POST",
        headers: { origin: "http://localhost", "x-ha-client": "web" },
      }),
    );

    expect(response.status).toBe(204);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith("ha_at=;") && /Max-Age=0/.test(cookie))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("ha_rt=;") && /Max-Age=0/.test(cookie))).toBe(true);
    expect(cookies.every((cookie) => /HttpOnly/.test(cookie) && /SameSite=lax/.test(cookie))).toBe(true);
  });

  it("rejects a proxy mutation without the client header", async () => {
    const response = await proxyPost(
      request("/api/v1/me", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ path: ["me"] }) },
    );
    expect(response.status).toBe(403);
  });
});

describe("BFF auth responses", () => {
  it("never returns tokens and sets HttpOnly cookies on login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account: {
            id: "20000000-0000-4000-8000-000000000004",
            email: "demo.patient@example.test",
            display_name: "Demo Patient",
            status: "ACTIVE",
            created_at: "2026-11-17T15:43:52.132Z",
            updated_at: "2026-11-17T16:02:02.106Z",
          },
          roles: ["PATIENT"],
          tokens: {
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_expires_in: 2592000,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await loginPost(
        request("/api/auth/login", {
          method: "POST",
          headers: { origin: "http://localhost", "x-ha-client": "web" },
          body: JSON.stringify({ email: "demo.patient@example.test", password: "DemoPass123!" }),
        }),
      );

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain("test-access-token");
      expect(text).not.toContain("test-refresh-token");
      expect(text).not.toContain("tokens");

      const cookies = response.headers.getSetCookie();
      const access = cookies.find((cookie) => cookie.startsWith("ha_at="));
      const refresh = cookies.find((cookie) => cookie.startsWith("ha_rt="));
      expect(access).toContain("Path=/");
      expect(access).toContain("Max-Age=900");
      expect(refresh).toContain("Path=/api/auth");
      expect(refresh).toContain("Max-Age=2592000");
      expect(access).toContain("HttpOnly");
      expect(refresh).toContain("HttpOnly");
      expect(access).toContain("SameSite=lax");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns 401 for an invalid login without leaking upstream text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_credentials", message: "Invalid email or password" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    try {
      const response = await loginPost(
        request("/api/auth/login", {
          method: "POST",
          headers: { origin: "http://localhost", "x-ha-client": "web" },
          body: JSON.stringify({ email: "demo.patient@example.test", password: "wrong" }),
        }),
      );
      expect(response.status).toBe(401);
      expect(await response.text()).toContain("invalid_credentials");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("generic proxy", () => {
  it("blocks /auth through the proxy", async () => {
    const response = await proxyGet(
      request("/api/v1/auth/login", { method: "GET" }),
      { params: Promise.resolve({ path: ["auth", "login"] }) },
    );
    expect(response.status).toBe(404);
  });
});
