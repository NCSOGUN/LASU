import { describe, expect, it } from "vitest";
import { isBlockedPath } from "@/lib/auth-bff";

describe("BFF proxy path guard", () => {
  it("blocks token endpoints, which only go through /api/auth/*", () => {
    for (const p of ["auth/login", "auth/register", "auth/refresh", "auth/logout", "auth/phone"]) {
      expect(isBlockedPath(p.split("/"))).toBe(true);
    }
  });

  it("forwards the Bearer-authenticated phone verification routes", () => {
    expect(isBlockedPath(["auth", "phone", "begin"])).toBe(false);
    expect(isBlockedPath(["auth", "phone", "confirm"])).toBe(false);
  });

  it("blocks empty and traversal segments", () => {
    expect(isBlockedPath(undefined)).toBe(true);
    expect(isBlockedPath([])).toBe(true);
    expect(isBlockedPath(["me", "..", "auth", "login"])).toBe(true);
    expect(isBlockedPath(["me", ""])).toBe(true);
  });

  it("forwards ordinary API paths", () => {
    expect(isBlockedPath(["me", "fields"])).toBe(false);
    expect(isBlockedPath(["directory", "facilities", "abc"])).toBe(false);
  });
});
