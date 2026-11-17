import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("keeps a same-origin path", () => {
    expect(safeNextPath("/app/record")).toBe("/app/record");
    expect(safeNextPath("/app/assistant?foo=1")).toBe("/app/assistant?foo=1");
  });

  it("falls back for a missing or empty value", () => {
    expect(safeNextPath(undefined)).toBe("/app");
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath("")).toBe("/app");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeNextPath("//evil.com")).toBe("/app");
    expect(safeNextPath("https://evil.com")).toBe("/app");
    expect(safeNextPath("javascript:alert(1)")).toBe("/app");
  });

  it("rejects backslash and control-character tricks", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/app");
    expect(safeNextPath("/app\u0000")).toBe("/app");
    expect(safeNextPath("/app\nlocation")).toBe("/app");
  });
});
