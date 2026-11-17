import { describe, expect, it } from "vitest";
import {
  changedFieldValues,
  changedKeys,
  conflictChanges,
  draftFor,
  formatIsoDate,
  issueMessages,
  isVersionConflict,
  readableServerValue,
  valueForDraft,
} from "@/features/record/helpers";
import { ApiError } from "@/api/errors";
import type { FieldDefinition } from "@/api/schemas";

const fields: FieldDefinition[] = [
  {
    key: "full_name",
    label: "Name",
    value_type: "STRING",
    emergency_eligible: true,
    sort_order: 10,
    value: "Bola Adeyemi",
    field_version: 1,
  },
  {
    key: "allergies",
    label: "Allergies",
    value_type: "STRING_ARRAY",
    emergency_eligible: true,
    sort_order: 20,
    value: ["Penicillin", "Peanuts"],
    field_version: 2,
  },
  {
    key: "weight",
    label: "Weight",
    value_type: "STRING",
    emergency_eligible: false,
    sort_order: 30,
    value: null,
    field_version: null,
  },
];

describe("record helpers", () => {
  it("builds a draft for both editable value types and handles nulls", () => {
    expect(draftFor(fields)).toEqual({
      full_name: "Bola Adeyemi",
      allergies: ["Penicillin", "Peanuts"],
      weight: "",
    });
    expect(valueForDraft(null)).toBe("");
    expect(valueForDraft(64)).toBe("64");
    expect(valueForDraft(["Asthma"])).toEqual(["Asthma"]);
  });

  it("lists only changed keys, including array order and empty arrays", () => {
    const draft = draftFor(fields);
    expect(changedKeys(draft, fields)).toEqual([]);

    draft.full_name = "Bola A.";
    expect(changedKeys(draft, fields)).toEqual(["full_name"]);

    draft.allergies = ["Peanuts", "Penicillin"];
    expect(changedKeys(draft, fields)).toEqual(["full_name", "allergies"]);

    draft.allergies = [];
    expect(changedKeys(draft, fields)).toEqual(["full_name", "allergies"]);
  });

  it("sends only the changed keys", () => {
    const draft = { ...draftFor(fields), full_name: "Ada", weight: "70" };
    expect(changedFieldValues(draft, fields, ["full_name"])).toEqual({ full_name: "Ada" });
  });

  it("describes both values for a version conflict", () => {
    const draft = { ...draftFor(fields), full_name: "Ada Okafor", allergies: [], weight: "" };
    const server = fields.map((field) =>
      field.key === "full_name" ? { ...field, value: "Bola Adeyemi" } : field,
    );
    expect(conflictChanges(draft, server)).toEqual([
      {
        key: "full_name",
        label: "Name",
        mine: "Ada Okafor",
        server: "Bola Adeyemi",
      },
      {
        key: "allergies",
        label: "Allergies",
        mine: "No values",
        server: "Penicillin, Peanuts",
      },
    ]);
  });

  it("renders values without leaking objects or undefined", () => {
    expect(readableServerValue(["A", "B"])).toBe("A, B");
    expect(readableServerValue([])).toBe("No values");
    expect(readableServerValue(null)).toBe("No value");
    expect(readableServerValue("")).toBe("Empty");
    expect(readableServerValue(72)).toBe("72");
  });

  it("formats date-only values from the calendar part without a timezone shift", () => {
    expect(formatIsoDate("2015-06-01T00:00:00.000Z")).toBe("1 Jun 2015");
    expect(formatIsoDate("2015-06-01")).toBe("1 Jun 2015");
    expect(formatIsoDate(null)).toBeNull();
  });

  it("maps validation issue paths onto form field names", () => {
    const error = new ApiError({
      status: 400,
      code: "validation_error",
      issues: [
        { path: "fields.allergies", message: "Enter at least one value" },
        { path: "email", message: "Invalid email" },
      ],
    });
    expect(issueMessages(error, ["allergies", "email"])).toEqual({
      allergies: "Enter at least one value",
      email: "Invalid email",
    });
  });

  it("recognises version conflicts only by error code", () => {
    expect(isVersionConflict(new ApiError({ status: 409, code: "version_conflict" }))).toBe(true);
    expect(isVersionConflict(new ApiError({ status: 400, code: "invalid_fields" }))).toBe(false);
  });
});
