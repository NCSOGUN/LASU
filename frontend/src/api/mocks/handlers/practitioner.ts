import { http, HttpResponse } from "msw";
import { grantClose, grantOpen, grantRead, grantReadEnded } from "../fixtures";

const readSessionId = grantOpen.read_session_id;

let grantActive = true;
let sessionOpen = true;

/** The fixtures use a captured timestamp; refresh it so a session is always live when opened. */
function liveProjection<T extends { expires_at: string }>(projection: T): T {
  return { ...projection, expires_at: new Date(Date.now() + 14 * 60_000).toISOString() };
}

/** Tests call this between cases, then flip the grant to check the ended screen. */
export function resetPractitionerMocks() {
  grantActive = true;
  sessionOpen = true;
}

export function revokePractitionerGrant() {
  grantActive = false;
}

export function closePractitionerSession() {
  sessionOpen = false;
}

export const practitionerHandlers = [
  http.post("/api/v1/records/grant/open", async ({ request }) => {
    const body = (await request.json()) as { patient_code?: string; grant_code?: string };
    if (!body?.patient_code || !body?.grant_code) {
      return HttpResponse.json(
        {
          error: "validation_error",
          request_id: "mock-grant-open-validation",
          issues: [
            ...(body?.patient_code ? [] : [{ path: "patient_code", message: "Required" }]),
            ...(body?.grant_code ? [] : [{ path: "grant_code", message: "Required" }]),
          ],
        },
        { status: 400 },
      );
    }
    if (body.patient_code === "123456789012" && body.grant_code === "48219367" && grantActive) {
      sessionOpen = true;
      return HttpResponse.json(liveProjection(grantOpen));
    }
    return HttpResponse.json({ available: false, fields: [] });
  }),

  http.get("/api/v1/records/grant/:id", ({ params }) => {
    if (String(params.id) !== readSessionId) {
      return HttpResponse.json({ error: "not_found", message: "Record not found" }, { status: 404 });
    }
    if (!grantActive || !sessionOpen) return HttpResponse.json(grantReadEnded);
    return HttpResponse.json(liveProjection(grantRead));
  }),

  http.post("/api/v1/records/grant/:id/close", ({ params }) => {
    if (String(params.id) !== readSessionId) {
      return HttpResponse.json({ error: "not_found", message: "Record not found" }, { status: 404 });
    }
    sessionOpen = false;
    return HttpResponse.json(grantClose);
  }),
];
