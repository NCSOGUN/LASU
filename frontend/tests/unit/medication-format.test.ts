import { describe, expect, it } from "vitest";
import {
  formatMomentDay,
  formatMomentTime,
  formatScheduleDate,
  formatScheduleRange,
  formatScore,
  groupMomentsByDay,
  localDateFromUtc,
  parseDecimal,
  toIsoDate,
} from "@/features/medications/format";
import { scheduleDecimal } from "@/api/mocks/fixtures";

describe("medication formatting", () => {
  it("shows a UTC moment in the viewer's time zone", () => {
    const time = "2026-11-17T07:00:00.000Z";

    expect(formatMomentTime(time, "Africa/Lagos")).toBe("08:00");
    expect(formatMomentTime(time, "UTC")).toBe("07:00");
    expect(formatMomentTime(time, "America/New_York")).toBe("02:00");
  });

  it("groups moments by the local day using Intl, not the ISO string", () => {
    const groups = groupMomentsByDay(
      [
        { id: "a", time: "2026-11-17T23:30:00.000Z" },
        { id: "b", time: "2026-11-18T00:30:00.000Z" },
        { id: "c", time: "2026-11-19T07:00:00.000Z" },
      ],
      "Africa/Lagos",
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.moments.map((moment) => moment.id)).toEqual(["a", "b"]);
    expect(groups[0]?.label).toBe(formatMomentDay("2026-11-17T23:30:00.000Z", "Africa/Lagos"));
    expect(groups[1]?.moments.map((moment) => moment.id)).toEqual(["c"]);
  });

  it("parses Decimal strings without losing fractions, and tolerates bad values", () => {
    expect(parseDecimal("66.67")).toBeCloseTo(66.67, 5);
    expect(parseDecimal("0")).toBe(0);
    expect(parseDecimal("not-a-number")).toBe(0);
    expect(parseDecimal(null)).toBe(0);
    expect(parseDecimal(scheduleDecimal.schedule.progress)).toBeCloseTo(66.67, 5);
    expect(formatScore(scheduleDecimal.schedule.score)).toMatch(/83[.,]5/);
  });

  it("formats schedule calendar dates in UTC so the chosen day does not shift", () => {
    expect(formatScheduleDate("2026-11-17T00:00:00.000Z")).toMatch(/Nov 17, 2026/);
    expect(formatScheduleRange("2026-11-17T00:00:00.000Z", "2026-11-19T00:00:00.000Z")).toMatch(
      /Nov 17, 2026 to Nov 19, 2026/,
    );
    expect(formatScheduleRange("2026-11-17T00:00:00.000Z", "2026-11-17T00:00:00.000Z")).toMatch(/Nov 17, 2026/);
  });

  it("round-trips a local calendar date for the API", () => {
    const local = localDateFromUtc("2026-11-17T00:00:00.000Z");
    expect(toIsoDate(local)).toBe("2026-11-17");
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
