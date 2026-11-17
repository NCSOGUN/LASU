import { http, HttpResponse } from "msw";
import {
  consent,
  consentRevoked,
  consentUssd,
  fieldsResponse,
  phoneBegin,
  phoneConfirm,
} from "../fixtures";

const consentIds: Record<string, string> = {
  SMS: consent.consent_id,
  USSD: consentUssd.consent_id,
};

export const channelsHandlers = [
  // The channels screen needs the patient's field list to describe consent scope.
  http.get("/api/v1/me/fields", () => HttpResponse.json(fieldsResponse)),

  http.post("/api/v1/auth/phone/begin", () => HttpResponse.json(phoneBegin)),

  http.post("/api/v1/auth/phone/confirm", () => HttpResponse.json(phoneConfirm)),

  http.put("/api/v1/me/consents/:channel", async ({ request, params }) => {
    const channel = String(params.channel).toUpperCase();
    if (channel !== "SMS" && channel !== "USSD") {
      return HttpResponse.json(
        { error: "invalid_channel", message: "Unsupported consent channel" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      field_keys?: unknown;
      expires_in_minutes?: unknown;
      phone_link_id?: unknown;
    };
    const fieldKeys = Array.isArray(body.field_keys)
      ? body.field_keys.filter((key): key is string => typeof key === "string")
      : [];
    if (fieldKeys.length === 0) {
      return HttpResponse.json(
        { error: "invalid_fields", message: "Choose at least one field" },
        { status: 400 },
      );
    }

    const minutes = typeof body.expires_in_minutes === "number" ? body.expires_in_minutes : 43200;
    return HttpResponse.json({
      ...consent,
      consent_id: consentIds[channel],
      channel,
      phone_link_id:
        typeof body.phone_link_id === "string" ? body.phone_link_id : consent.phone_link_id,
      expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      field_keys: fieldKeys,
    });
  }),

  http.delete("/api/v1/me/consents/:channel", ({ params }) => {
    const channel = String(params.channel).toUpperCase();
    if (channel !== "SMS" && channel !== "USSD") {
      return HttpResponse.json(
        { error: "invalid_channel", message: "Unsupported consent channel" },
        { status: 400 },
      );
    }
    return HttpResponse.json(consentRevoked);
  }),
];
