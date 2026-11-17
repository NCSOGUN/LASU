import { describe, expect, it } from "vitest";
import {
  areaLabel,
  distanceFromCentre,
  formatDistanceKm,
  lastVerifiedLabel,
  sourceTrustLabel,
  sourceTrustTone,
} from "@/features/care/format";

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
