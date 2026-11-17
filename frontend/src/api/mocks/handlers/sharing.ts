import { http, HttpResponse } from "msw";
import type { GrantCreateBody } from "@/api/schemas";
import {
  accessEvents,
  emergencyLookup,
  emergencyLookupUnavailable,
  fieldsResponse,
  grantCreated,
  grantRevoked,
  grants,
  patientCode,
  patientCodeRotated,
} from "../fixtures";

type GrantRow = (typeof grants)[number];
type AccessEventRow = {
  id: string;
  occurred_at: string;
  channel: string;
  action: string;
  outcome: string;
  reason_code: string | null;
  resource_type: string | null;
  resource_id: string | null;
  field_keys: string[];
};

type SharingState = {
  patientCode: typeof patientCode;
  grants: GrantRow[];
  events: AccessEventRow[];
  nextEventId: number;
};

const knownFieldKeys = new Set(fieldsResponse.fields.map((field) => field.key));

function initialState(): SharingState {
  return {
    patientCode: structuredClone(patientCode),
    grants: structuredClone(grants),
    events: structuredClone(accessEvents),
    nextEventId: 500,
  };
}

let state = initialState();

/** Tests call this between cases so one create or revoke cannot leak into the next. */
export function resetSharingMocks() {
  state = initialState();
}

function recordEvent(event: Omit<AccessEventRow, "id" | "occurred_at">) {
  const id = String(state.nextEventId);
  state.nextEventId += 1;
  state.events = [{ ...event, id, occurred_at: new Date().toISOString() }, ...state.events];
}

function limitFrom(url: URL, fallback: number): number {
  const parsed = Number(url.searchParams.get("limit") ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

export const sharingHandlers = [
  http.get("/api/v1/me/patient-code", () => HttpResponse.json(state.patientCode)),

  http.post("/api/v1/me/patient-code/rotate", () => {
    const rotatedAt = new Date().toISOString();
    state.patientCode = { ...patientCodeRotated, rotated_at: rotatedAt };
    state.grants = state.grants.map((grant) =>
      grant.status === "active" ? { ...grant, status: "revoked", revoked_at: rotatedAt } : grant,
    );
    recordEvent({
      channel: "WEB",
      action: "patient_code_rotate",
      outcome: "ALLOWED",
      reason_code: null,
      resource_type: "patient_code",
      resource_id: null,
      field_keys: [],
    });
    return HttpResponse.json(state.patientCode);
  }),

  http.get("/api/v1/me/grants", ({ request }) => {
    const limit = limitFrom(new URL(request.url), 50);
    return HttpResponse.json(state.grants.slice(0, limit));
  }),

  http.post("/api/v1/me/grants", async ({ request }) => {
    const body = (await request.json()) as GrantCreateBody;
    const keys = Array.isArray(body?.field_keys) ? [...new Set(body.field_keys)] : [];
    if (keys.length === 0) {
      return HttpResponse.json(
        {
          error: "invalid_field",
          message: "At least one field is required",
          request_id: "mock-grant-fields",
        },
        { status: 400 },
      );
    }
    const unknown = keys.find((key) => !knownFieldKeys.has(key));
    if (unknown) {
      return HttpResponse.json(
        {
          error: "invalid_field",
          message: `Unknown field: ${unknown}`,
          request_id: "mock-grant-field",
        },
        { status: 400 },
      );
    }

    const minutes = body.expires_in_minutes ?? 30;
    const now = Date.now();
    const id = crypto.randomUUID();
    const created = {
      ...grantCreated,
      id,
      grant_id: id,
      expires_at: new Date(now + minutes * 60_000).toISOString(),
      created_at: new Date(now).toISOString(),
      field_keys: keys,
      channels: body.channels?.length ? body.channels : (["WEB_PRACTITIONER"] as const),
    };

    state.grants = [
      {
        id,
        grant_id: id,
        status: "active",
        expires_at: created.expires_at,
        revoked_at: null,
        created_at: created.created_at,
        field_keys: created.field_keys,
        channels: [...created.channels],
      },
      ...state.grants,
    ];
    recordEvent({
      channel: "WEB",
      action: "grant_create",
      outcome: "ALLOWED",
      reason_code: null,
      resource_type: "access_grant",
      resource_id: id,
      field_keys: keys,
    });

    return HttpResponse.json(created, { status: 201 });
  }),

  http.delete("/api/v1/me/grants/:id", ({ params }) => {
    const id = String(params.id);
    const target = state.grants.find((grant) => grant.id === id);
    if (!target) {
      return HttpResponse.json({ error: "not_found", message: "Grant not found" }, { status: 404 });
    }
    const revokedAt = new Date().toISOString();
    state.grants = state.grants.map((grant) =>
      grant.id === id ? { ...grant, status: "revoked", revoked_at: revokedAt } : grant,
    );
    recordEvent({
      channel: "WEB",
      action: "grant_revoke",
      outcome: "ALLOWED",
      reason_code: null,
      resource_type: "access_grant",
      resource_id: id,
      field_keys: [],
    });
    return HttpResponse.json({ ...grantRevoked, id });
  }),

  http.get("/api/v1/me/access-events", ({ request }) => {
    const limit = limitFrom(new URL(request.url), 50);
    return HttpResponse.json(state.events.slice(0, limit));
  }),

  http.post("/api/v1/records/emergency", async ({ request }) => {
    const body = (await request.json()) as { patient_code?: string };
    if (body?.patient_code === patientCode.code) return HttpResponse.json(emergencyLookup);
    return HttpResponse.json(emergencyLookupUnavailable);
  }),
];
