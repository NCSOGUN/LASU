import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  areaLabel,
  distanceFromCentre,
  formatDistanceKm,
  lastVerifiedLabel,
  sourceTrustLabel,
  sourceTrustTone,
} from "@/features/care/format";
import { useDebouncedValue } from "@/features/care/useDebouncedValue";

afterEach(() => {
  vi.useRealTimers();
});

describe("care formatting", () => {
  it("formats a straight-line distance to one decimal place", () => {
    expect(formatDistanceKm(0.385)).toBe("0.4");
    expect(formatDistanceKm(3.204)).toBe("3.2");
    expect(formatDistanceKm(12)).toBe("12");
    expect(formatDistanceKm(0)).toBe("0");
  });

  it("labels the distance from the area centre exactly as the scope asks", () => {
    expect(distanceFromCentre(0.385)).toBe("≈ 0.4 km from the area centre (straight line)");
  });

  it("labels the last verification date from the API timestamp", () => {
    expect(lastVerifiedLabel("2026-11-17T15:43:56.515Z")).toBe(
      "Directory details last verified 17 November 2026",
    );
    expect(lastVerifiedLabel(null)).toBe("Directory details have not been verified.");
    expect(lastVerifiedLabel("not a date")).toBe("Directory details have not been verified.");
  });

  it("humanises source trust without inventing a claim", () => {
    expect(sourceTrustLabel("unknown")).toBe("Source trust: unknown");
    expect(sourceTrustLabel("partner_verified")).toBe("Source trust: partner verified");
    expect(sourceTrustTone("verified")).toBe("success");
    expect(sourceTrustTone("pending")).toBe("warning");
    expect(sourceTrustTone("unknown")).toBe("neutral");
  });

  it("joins an area name and region once", () => {
    expect(areaLabel({ name: "Ikeja demo area", region: "Lagos" })).toBe("Ikeja demo area, Lagos");
    expect(areaLabel({ name: "Ikeja demo area", region: null })).toBe("Ikeja demo area");
    expect(areaLabel({ name: "Lagos", region: "Lagos" })).toBe("Lagos");
  });
});

describe("useDebouncedValue", () => {
  it("holds a change until the delay has passed", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: "" },
    });

    rerender({ value: "i" });
    rerender({ value: "ik" });
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("ik");
  });

  it("keeps the latest value when typing continues", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: "" },
    });

    rerender({ value: "Ike" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: "Ikeja" });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBe("Ikeja");
  });
});
