import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { z } from "zod";
import { api, request } from "@/api/client";
import { server } from "@/api/mocks/server";

describe("single-flight refresh", () => {
  it("turns five parallel 401s into exactly one refresh and five retries", async () => {
    let refreshCalls = 0;
    let refreshed = false;

    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCalls += 1;
        refreshed = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/api/v1/probe", () => {
        if (!refreshed) {
          return HttpResponse.json({ error: "token_expired" }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    const schema = z.object({ ok: z.boolean() });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request({ url: "/probe", method: "GET" }, schema)),
    );

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(5);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("does not refresh a 401 that is not token_expired", async () => {
    let refreshCalls = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/api/v1/private", () => HttpResponse.json({ error: "forbidden" }, { status: 403 })),
    );

    await expect(api.get("/private")).rejects.toMatchObject({ code: "forbidden" });
    expect(refreshCalls).toBe(0);
  });
});
