import { describe, expect, it } from "vitest";
import {
  consentBodySchema,
  consentChannelSchema,
  consentResponseSchema,
  consentRevokeResponseSchema,
  fieldsResponseSchema,
  phoneBeginBodySchema,
  phoneBeginResponseSchema,
  phoneConfirmBodySchema,
  phoneConfirmResponseSchema,
} from "@/api/schemas";
import {
  consent,
  consentRevoked,
  consentUssd,
  fieldsResponse,
  phoneBegin,
  phoneConfirm,
} from "@/api/mocks/fixtures";
import {
  consentScopeCopy,
  fieldHasValue,
  fieldLabels,
  fieldsWithValues,
  formatLocalDateTime,
  isE164Phone,
  joinFieldLabels,
} from "@/features/channels/channel-data";

describe("channel schemas", () => {
  it("accepts the snapshot fixtures for phone verification", () => {
    expect(phoneBeginResponseSchema.parse(phoneBegin)).toMatchObject({ status: "sent", expires_in: 600 });
    expect(phoneConfirmResponseSchema.parse(phoneConfirm).verified).toBe(true);
    expect(phoneBeginBodySchema.safeParse({ phone: "+2348021234567" }).success).toBe(true);
    expect(phoneConfirmBodySchema.safeParse({ phone: "+2348021234567", code: "123456" }).success).toBe(true);
  });

  it("accepts the snapshot fixtures for both consent channels", () => {
    expect(consentResponseSchema.parse(consent)).toMatchObject({ channel: "SMS", available: true });
    expect(consentResponseSchema.parse(consentUssd)).toMatchObject({ channel: "USSD", available: true });
    expect(consentRevokeResponseSchema.parse(consentRevoked)).toEqual({ available: true, revoked: true });
  });

  it("uses only the uppercase channel enums", () => {
    expect(consentChannelSchema.options).toEqual(["SMS", "USSD"]);
    expect(consentChannelSchema.safeParse("SMS").success).toBe(true);
    expect(consentChannelSchema.safeParse("USSD").success).toBe(true);
    expect(consentChannelSchema.safeParse("sms").success).toBe(false);
    expect(consentChannelSchema.safeParse("PUSH").success).toBe(false);
  });

  it("rejects an empty field list and a code that is not six digits", () => {
    expect(consentBodySchema.safeParse({ field_keys: [] }).success).toBe(false);
    expect(consentBodySchema.safeParse({ field_keys: ["full_name"], expires_in_minutes: 0 }).success).toBe(false);
    expect(consentBodySchema.safeParse({ field_keys: ["full_name"], expires_in_minutes: 43200 }).success).toBe(true);
    expect(phoneConfirmBodySchema.safeParse({ phone: "+2348021234567", code: "12345" }).success).toBe(false);
    expect(phoneConfirmBodySchema.safeParse({ phone: "+2348021234567", code: "1234567" }).success).toBe(false);
  });
});

describe("channel field helpers", () => {
  const fields = fieldsResponseSchema.parse(fieldsResponse).fields;

  it("offers only fields that have a stored value", () => {
    const available = fieldsWithValues(fields);
    expect(available.map((field) => field.key)).toContain("full_name");
    expect(available.map((field) => field.key)).not.toContain("blood_pressure");
    expect(fieldHasValue({ ...fields[0]!, value: "  " })).toBe(false);
    expect(fieldHasValue({ ...fields[0]!, value: [] })).toBe(false);
    expect(fieldHasValue({ ...fields[0]!, value: 0 })).toBe(true);
    expect(fieldHasValue({ ...fields[0]!, value: false })).toBe(true);
  });

  it("names the exact fields a consent covers", () => {
    expect(consentScopeCopy("SMS", ["Name", "Allergies"])).toBe(
      "SMS can read only these fields: Name and Allergies. Nothing else in your record is readable through SMS.",
    );
    expect(consentScopeCopy("USSD", [])).toBe(
      "USSD can read nothing until you choose at least one field.",
    );
    expect(joinFieldLabels(["Name", "Allergies", "Conditions"])).toBe(
      "Name, Allergies, and Conditions",
    );
    expect(fieldLabels(["full_name", "missing_key"], fields)).toEqual(["Name", "missing_key"]);
  });

  it("validates E.164 numbers and keeps unparseable dates as text", () => {
    expect(isE164Phone("+2348021234567")).toBe(true);
    expect(isE164Phone("08021234567")).toBe(false);
    expect(isE164Phone("+0123456789")).toBe(false);
    expect(formatLocalDateTime("not-a-date")).toBe("not-a-date");
  });
});
