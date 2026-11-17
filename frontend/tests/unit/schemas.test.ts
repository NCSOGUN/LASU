import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import {
  accessEventsResponseSchema,
  authSuccessSchema,
  consentResponseSchema,
  consentRevokeResponseSchema,
  deviceResponseSchema,
  emergencyFieldsResponseSchema,
  emergencyLookupResponseSchema,
  emergencySummarySchema,
  facilityDetailSchema,
  facilitiesResponseSchema,
  fieldsResponseSchema,
  grantCloseResponseSchema,
  grantCreateResponseSchema,
  grantListSchema,
  grantProjectionSchema,
  grantRevokeResponseSchema,
  meResponseSchema,
  medicalEventResponseSchema,
  momentUpdateResponseSchema,
  patientCodeSchema,
  phoneBeginResponseSchema,
  phoneConfirmResponseSchema,
  refreshResponseSchema,
  scheduleCreateResponseSchema,
  scheduleDeleteResponseSchema,
  scheduleDetailResponseSchema,
  scheduleListResponseSchema,
  servicesResponseSchema,
  symptomCreateResponseSchema,
  symptomDeleteResponseSchema,
  symptomDetailResponseSchema,
  symptomListResponseSchema,
  symptomUpdateResponseSchema,
  areasResponseSchema,
} from "@/api/schemas";

type Snapshot = {
  groups: Array<{
    endpoints: Array<{
      id: string;
      method: string;
      path: string;
      responses: Array<{ status: number; body: unknown }>;
    }>;
  }>;
};

const snapshot = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "docs/api/healthaccess-api.json"), "utf8"),
) as Snapshot;

const schemas: Record<string, z.ZodType> = {
  "auth-register": authSuccessSchema,
  "auth-login": authSuccessSchema,
  "auth-refresh": refreshResponseSchema,
  "users-me-get": meResponseSchema,
  "users-me-patch": meResponseSchema,
  "users-me-medical-put": meResponseSchema,
  "users-me-medical-event-patch": medicalEventResponseSchema,
  "auth-phone-begin": phoneBeginResponseSchema,
  "auth-phone-confirm": phoneConfirmResponseSchema,
  "portal-fields-get": fieldsResponseSchema,
  "portal-fields-put": fieldsResponseSchema,
  "portal-emergency-fields-put": emergencyFieldsResponseSchema,
  "portal-emergency-summary": emergencySummarySchema,
  "portal-patient-code-get": patientCodeSchema,
  "portal-patient-code-rotate": patientCodeSchema,
  "portal-grants-list": grantListSchema,
  "portal-grants-create": grantCreateResponseSchema,
  "portal-grants-revoke": grantRevokeResponseSchema,
  "portal-access-events": accessEventsResponseSchema,
  "portal-consents-put": consentResponseSchema,
  "portal-consents-delete": consentRevokeResponseSchema,
  "records-emergency": emergencyLookupResponseSchema,
  "records-grant-open": grantProjectionSchema,
  "records-grant-read": grantProjectionSchema,
  "records-grant-close": grantCloseResponseSchema,
  "directory-services": servicesResponseSchema,
  "directory-areas": areasResponseSchema,
  "directory-facilities": facilitiesResponseSchema,
  "directory-facility-detail": facilityDetailSchema,
  "symptom-create": symptomCreateResponseSchema,
  "symptom-list": symptomListResponseSchema,
  "symptom-get": symptomDetailResponseSchema,
  "symptom-follow-up": symptomDetailResponseSchema,
  "symptom-update": symptomUpdateResponseSchema,
  "symptom-delete": symptomDeleteResponseSchema,
  "meds-schedule-create": scheduleCreateResponseSchema,
  "meds-schedule-create-ai": scheduleCreateResponseSchema,
  "meds-schedule-list": scheduleListResponseSchema,
  "meds-schedule-get": scheduleDetailResponseSchema,
  "meds-moment-update": momentUpdateResponseSchema,
  "meds-schedule-add": scheduleCreateResponseSchema,
  "meds-schedule-remove": scheduleCreateResponseSchema,
  "meds-device-register": deviceResponseSchema,
  "meds-schedule-delete": scheduleDeleteResponseSchema,
};

describe("snapshot schemas", () => {
  it("covers every endpoint that returns a 2xx body", () => {
    const expected = snapshot.groups
      .flatMap((group) => group.endpoints)
      .filter((endpoint) => endpoint.responses.some((response) => response.status >= 200 && response.status < 300))
      .filter((endpoint) => !endpoint.responses.some((response) => response.status === 204 || response.status === 503))
      .map((endpoint) => endpoint.id);

    expect(Object.keys(schemas).sort()).toEqual(expected.sort());
  });

  it.each(
    snapshot.groups
      .flatMap((group) => group.endpoints)
      .filter((endpoint) => endpoint.responses.some((response) => response.status >= 200 && response.status < 300))
      .filter((endpoint) => !endpoint.responses.some((response) => response.status === 204 || response.status === 503))
      .map((endpoint) => [endpoint.id, endpoint] as const),
  )("accepts the snapshot example for %s", (id, endpoint) => {
    const schema = schemas[id];
    expect(schema, `missing schema for ${endpoint.method} ${endpoint.path}`).toBeDefined();
    const success = endpoint.responses.find((response) => response.status >= 200 && response.status < 300);
    expect(success).toBeDefined();

    const result = schema.safeParse(success?.body);
    if (!result.success) {
      throw new Error(`${id}: ${JSON.stringify(result.error.issues)}`);
    }
    expect(result.success).toBe(true);
  });
});
