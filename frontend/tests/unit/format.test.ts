import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDistanceKm,
  formatTime,
  groupByLocalDay,
  localDayKey,
  parseDecimalString,
} from "@/lib/format";

describe("format", () => {
  it("renders a UTC instant in Africa/Lagos, not the UTC string", () => {
    expect(formatTime("2026-11-17T07:00:00.000Z", { timeZone: "Africa/Lagos" })).toBe("08:00");
    expect(localDayKey("2026-11-17T23:30:00.000Z", "Africa/Lagos")).toBe("2026-11-18");
  });

  it("formats dates and date-times with Intl", () => {
    expect(formatDate("2026-11-17T07:00:00.000Z", { timeZone: "UTC" })).toBe("17 Nov 2026");
    expect(formatDateTime("2026-11-17T07:00:00.000Z", { timeZone: "Africa/Lagos" })).toBe("17 Nov 2026, 08:00");
  });

  it("formats distances with at most one decimal", () => {
    expect(formatDistanceKm(0.385)).toBe("0.4");
    expect(formatDistanceKm(12)).toBe("12");
  });

  it("parses Decimal strings without treating an empty value as zero", () => {
    expect(parseDecimalString("100")).toBe(100);
    expect(parseDecimalString("12.50")).toBe(12.5);
    expect(parseDecimalString("0")).toBe(0);
    expect(parseDecimalString("")).toBeNull();
    expect(parseDecimalString("  ")).toBeNull();
    expect(parseDecimalString("not-a-number")).toBeNull();
    expect(parseDecimalString(null)).toBeNull();
  });

  it("groups moments by local day", () => {
    const groups = groupByLocalDay(
      [
        { time: "2026-11-17T07:00:00.000Z", id: "a" },
        { time: "2026-11-17T19:00:00.000Z", id: "b" },
        { time: "2026-11-18T07:00:00.000Z", id: "c" },
      ],
      "Africa/Lagos",
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].day).toBe("2026-11-17");
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups[1].day).toBe("2026-11-18");
  });
});
