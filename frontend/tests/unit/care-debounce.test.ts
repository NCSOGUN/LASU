import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "@/features/care/useDebouncedValue";

afterEach(() => {
  vi.useRealTimers();
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
