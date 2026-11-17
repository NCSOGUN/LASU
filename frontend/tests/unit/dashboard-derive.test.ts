import { describe, expect, it } from "vitest";
import { fieldsResponse, grants, scheduleDetail, symptomList } from "@/api/mocks/fixtures";
import {
  activeGrantCount,
  emergencyStatus,
  isFieldFilled,
  latestSymptoms,
  profileCompleteness,
  todaysMoments,
} from "@/features/dashboard/derive";
import type { SymptomRecord } from "@/api/schemas";

describe("overview derivations", () => {
  it("counts filled fields without counting empty arrays or nulls", () => {
    const result = profileCompleteness(fieldsResponse.fields);
    expect(result.total).toBe(fieldsResponse.fields.length);
    expect(result.filled).toBe(fieldsResponse.fields.filter((field) => isFieldFilled(field.value)).length);
    expect(result.filled).toBeLessThan(result.total);
  });

  it("treats false as a chosen value and empty strings as missing", () => {
    expect(isFieldFilled(false)).toBe(true);
    expect(isFieldFilled("")).toBe(false);
    expect(isFieldFilled([])).toBe(false);
    expect(isFieldFilled(null)).toBe(false);
  });

  it("counts only active grants", () => {
    expect(activeGrantCount(grants)).toBe(grants.filter((grant) => grant.status === "active").length);
    expect(activeGrantCount(grants)).toBe(1);
  });

  it("reports emergency availability and the selected field count", () => {
    expect(emergencyStatus({ available: true, fields: [{ key: "a", label: "A", value: "x" }, { key: "b", label: "B", value: "y" }] })).toEqual({
      available: true,
      count: 2,
    });
    expect(emergencyStatus({ available: false })).toEqual({ available: false, count: 0 });
    expect(emergencyStatus(undefined)).toEqual({ available: false, count: 0 });
  });

  it("returns the three newest symptom records", () => {
    const base = symptomList.symptoms[0];
    const records: SymptomRecord[] = [1, 2, 3, 4].map((index) => ({
      ...base,
      id: String(index),
      created_at: `2026-11-${String(10 + index).padStart(2, "0")}T10:00:00.000Z`,
    }));

    const latest = latestSymptoms(records);
    expect(latest).toHaveLength(3);
    expect(latest.map((record) => record.id)).toEqual(["4", "3", "2"]);
  });

  it("selects today's doses in the user's timezone", () => {
    const moments = scheduleDetail.schedule.moments ?? [];
    const today = todaysMoments(moments, new Date("2026-11-17T12:00:00.000Z"), "Africa/Lagos");
    expect(today).toHaveLength(3);
    expect(today.every((moment) => moment.time.startsWith("2026-11-17"))).toBe(true);
  });
});
