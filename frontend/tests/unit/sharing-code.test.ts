import { describe, expect, it } from "vitest";
import {
  GRANT_CODE_LENGTH,
  PATIENT_CODE_LENGTH,
  REVEAL_DURATION_MS,
  digitsOnly,
  formatFieldValue,
  groupCode,
  maskCode,
} from "@/features/sharing/code";
import {
  actionLabel,
  channelLabel,
  formatLocalDateTime,
  grantStatusLabel,
  humaniseKey,
  outcomeLabel,
  outcomeTone,
} from "@/features/sharing/labels";
import { formatRemaining } from "@/features/sharing/time";

describe("code display helpers", () => {
  it("groups patient and grant codes into readable blocks", () => {
    expect(groupCode("123456789012")).toBe("1234 5678 9012");
    expect(groupCode("48219367")).toBe("4821 9367");
    expect(groupCode(" 4821 9367 ")).toBe("4821 9367");
  });

  it("keeps the last four digits visible and masks the rest", () => {
    expect(maskCode("123456789012")).toBe("•••• •••• 9012");
    expect(maskCode("123456781234")).toBe("•••• •••• 1234");
    expect(maskCode("48219367", 2)).toBe("•••• ••67");
    expect(maskCode("12", 4)).toBe("12");
  });

  it("keeps only digits and applies the expected length", () => {
    expect(digitsOnly("12ab34 56", PATIENT_CODE_LENGTH)).toBe("123456");
    expect(digitsOnly("482193679999", GRANT_CODE_LENGTH)).toBe("48219367");
  });

  it("reveals for exactly 30 seconds", () => {
    expect(REVEAL_DURATION_MS).toBe(30_000);
  });

  it("formats field values without rendering raw JSON", () => {
    expect(formatFieldValue(["Penicillin", "Peanuts"])).toBe("Penicillin, Peanuts");
    expect(formatFieldValue([])).toBe("Not recorded");
    expect(formatFieldValue(null)).toBe("Not recorded");
    expect(formatFieldValue(false)).toBe("No");
    expect(formatFieldValue(64)).toBe("64");
  });
});

describe("sharing labels", () => {
  it("humanises audit actions and channels", () => {
    expect(actionLabel("grant_create")).toBe("Access code created");
    expect(actionLabel("grant_revoke")).toBe("Access code revoked");
    expect(actionLabel("grant_open")).toBe("Access code opened");
    expect(actionLabel("grant_read")).toBe("Shared record read");
    expect(actionLabel("patient_code_rotate")).toBe("Patient code rotated");
    expect(actionLabel("some_new_action")).toBe("Some new action");
    expect(channelLabel("WEB")).toBe("Web");
    expect(channelLabel("WEB_PRACTITIONER")).toBe("Verified practitioner portal");
    expect(channelLabel("USSD")).toBe("USSD");
    expect(humaniseKey("blood_group")).toBe("Blood group");
  });

  it("labels grant status and outcomes for both text and tone", () => {
    expect(grantStatusLabel("active")).toBe("Active");
    expect(grantStatusLabel("expired")).toBe("Expired");
    expect(grantStatusLabel("revoked")).toBe("Revoked");
    expect(outcomeLabel("ALLOWED")).toBe("Allowed");
    expect(outcomeLabel("DENIED")).toBe("Denied");
    expect(outcomeTone("ALLOWED")).toBe("success");
    expect(outcomeTone("DENIED")).toBe("danger");
    expect(outcomeTone("UNKNOWN")).toBe("neutral");
  });

  it("formats timestamps in the requested local zone", () => {
    expect(formatLocalDateTime("2026-11-17T16:49:00.000Z", "Africa/Lagos")).toBe("17 Nov 2026, 17:49");
    expect(formatLocalDateTime("2026-11-17T16:49:00.000Z", "UTC")).toBe("17 Nov 2026, 16:49");
  });

  it("formats remaining time without a date library", () => {
    expect(formatRemaining(14 * 60_000 + 32_000)).toBe("14 min 32 s");
    expect(formatRemaining(2 * 3_600_000 + 5 * 60_000)).toBe("2 h 5 min");
    expect(formatRemaining(-1000)).toBe("0 s");
  });
});
