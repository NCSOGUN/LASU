import { http, HttpResponse } from "msw";
import {
  scheduleAdd,
  scheduleCreate,
  scheduleCreateAi,
  scheduleDelete,
  scheduleDetail,
} from "../fixtures/medications";
import type { MedicationMoment, Schedule } from "@/api/schemas/medications";

type ScheduleWithMoments = Schedule & { moments?: MedicationMoment[] };

type StoreEntry = { schedule: ScheduleWithMoments };

const initialSchedule = scheduleDetail.schedule as ScheduleWithMoments;

let entries: StoreEntry[] = [];
let nextId = 0;

export function resetMedicationHandlers() {
  entries = [
    {
      schedule: {
        ...initialSchedule,
        medications: initialSchedule.medications.map((entry) => ({ ...entry, times: entry.times.map((time) => ({ ...time })) })),
        moments: initialSchedule.moments?.map((moment) => ({ ...moment })),
      },
    },
  ];
  nextId = 0;
}

resetMedicationHandlers();

function parsePage(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 50) : 10;
}

function withoutMoments(schedule: ScheduleWithMoments): Schedule {
  const rest = { ...schedule };
  delete rest.moments;
  return rest;
}

function progressFor(moments: MedicationMoment[]) {
  const decided = moments.filter((moment) => moment.status !== "PENDING");
  if (!decided.length) return "0";
  const taken = decided.filter((moment) => moment.status === "TAKEN").length;
  return String(Math.round((taken / decided.length) * 10_000) / 100);
}

function find(id: string) {
  return entries.find((entry) => entry.schedule.id === id);
}

function isoDate(value: unknown) {
  return String(value ?? "").slice(0, 10);
}

export const medicationHandlers = [
  http.get("/api/v1/medications", ({ request }) => {
    const url = new URL(request.url);
    const page = parsePage(url.searchParams.get("page"));
    const limit = parseLimit(url.searchParams.get("limit"));
    const total = entries.length;
    const start = (page - 1) * limit;
    const schedules = entries.slice(start, start + limit).map((entry) => withoutMoments(entry.schedule));
    return HttpResponse.json({
      schedules,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }),

  http.post("/api/v1/medications", async ({ request }) => {
    const contentType = request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    if (isMultipart) {
      const form = await request.formData();
      const startDate = isoDate(form.get("startDate"));
      const endDate = isoDate(form.get("endDate"));
      const text = String(form.get("medications") ?? "").trim();
      const document = form.get("document");
      if (!startDate || !endDate) {
        return HttpResponse.json({ error: "validation_error", message: "Dates are required" }, { status: 400 });
      }
      if (endDate < startDate) {
        return HttpResponse.json({ error: "invalid_schedule", message: "End date must not precede start date" }, { status: 400 });
      }
      if (!text && !(document && typeof document === "object" && "name" in document)) {
        return HttpResponse.json({ error: "invalid_schedule", message: "Medications or a document is required" }, { status: 400 });
      }

      const schedule: ScheduleWithMoments = {
        ...(scheduleCreateAi.schedule as ScheduleWithMoments),
        start_date: `${startDate}T00:00:00.000Z`,
        end_date: `${endDate}T00:00:00.000Z`,
        moments: [],
      };
      entries = [{ schedule }, ...entries];
      return HttpResponse.json({ schedule: withoutMoments(schedule) }, { status: 201 });
    }

    const body = (await request.json()) as {
      title?: string;
      description?: string;
      summary?: string;
      startDate?: string;
      endDate?: string;
      medications?: Array<{ drug: string; dose?: string; frequency?: string; times: Array<{ hour: number; minute: number }> }>;
    };
    const startDate = isoDate(body.startDate);
    const endDate = isoDate(body.endDate);
    if (!startDate || !endDate || endDate < startDate) {
      return HttpResponse.json({ error: "invalid_schedule", message: "Check the dates" }, { status: 400 });
    }
    if (!Array.isArray(body.medications) || body.medications.length === 0) {
      return HttpResponse.json({ error: "invalid_schedule", message: "Medications or a document is required" }, { status: 400 });
    }

    const id = nextId === 0 ? (scheduleCreate.schedule.id as string) : `ff5c2b3f-81ea-4038-9b93-adce5efcdf${String(nextId).padStart(2, "0")}`;
    nextId += 1;
    const medicationSummary = body.medications
      .map((entry) => [entry.drug, entry.dose].filter(Boolean).join(" "))
      .join(", ");
    const schedule: ScheduleWithMoments = {
      ...(scheduleCreate.schedule as ScheduleWithMoments),
      id,
      title: body.title ?? null,
      description: body.description ?? null,
      summary: body.summary ?? medicationSummary,
      medications: body.medications.map((entry) => ({
        drug: entry.drug,
        dose: entry.dose ?? null,
        frequency: entry.frequency ?? null,
        times: entry.times,
      })),
      start_date: `${startDate}T00:00:00.000Z`,
      end_date: `${endDate}T00:00:00.000Z`,
      progress: "0",
      score: "100",
      moments: [],
    };
    entries = [{ schedule }, ...entries];
    return HttpResponse.json({ schedule: withoutMoments(schedule) }, { status: 201 });
  }),

  http.get("/api/v1/medications/:id", ({ params }) => {
    const entry = find(String(params.id));
    if (!entry) {
      return HttpResponse.json({ error: "not_found", message: "Medication schedule not found" }, { status: 404 });
    }
    return HttpResponse.json({ schedule: entry.schedule });
  }),

  http.patch("/api/v1/medications/moments/:id", async ({ params, request }) => {
    const momentId = String(params.id);
    const body = (await request.json()) as { status?: string };
    if (!body.status || !["TAKEN", "MISSED", "PENDING"].includes(body.status)) {
      return HttpResponse.json({ error: "validation_error", message: "Choose a status" }, { status: 400 });
    }

    for (const entry of entries) {
      const moment = entry.schedule.moments?.find((candidate) => candidate.id === momentId);
      if (!moment) continue;
      moment.status = body.status as MedicationMoment["status"];
      const progress = progressFor(entry.schedule.moments ?? []);
      entry.schedule.progress = progress;
      return HttpResponse.json({ moment, progress, score: entry.schedule.score });
    }

    return HttpResponse.json({ error: "not_found", message: "Dose not found" }, { status: 404 });
  }),

  http.patch("/api/v1/medications/:id/add", async ({ params, request }) => {
    const entry = find(String(params.id));
    if (!entry) {
      return HttpResponse.json({ error: "not_found", message: "Medication schedule not found" }, { status: 404 });
    }
    const body = (await request.json()) as {
      startDate?: string;
      endDate?: string;
      medications?: Array<{ drug: string; dose?: string; frequency?: string; times: Array<{ hour: number; minute: number }> }>;
    };
    if (!body.medications?.length) {
      return HttpResponse.json({ error: "invalid_schedule", message: "Add at least one drug" }, { status: 400 });
    }
    entry.schedule = {
      ...entry.schedule,
      medications: [
        ...entry.schedule.medications,
        ...body.medications.map((medication) => ({
          drug: medication.drug,
          dose: medication.dose ?? null,
          frequency: medication.frequency ?? null,
          times: medication.times,
        })),
      ],
      updated_at: scheduleAdd.schedule.updated_at,
    };
    return HttpResponse.json({ schedule: withoutMoments(entry.schedule) }, { status: 201 });
  }),

  http.patch("/api/v1/medications/:id/remove", async ({ params, request }) => {
    const entry = find(String(params.id));
    if (!entry) {
      return HttpResponse.json({ error: "not_found", message: "Medication schedule not found" }, { status: 404 });
    }
    const body = (await request.json()) as { drug?: string; from?: string };
    const drug = String(body.drug ?? "").trim().toLowerCase();
    if (!drug) {
      return HttpResponse.json({ error: "invalid_value", message: "Choose a drug" }, { status: 400 });
    }
    entry.schedule = {
      ...entry.schedule,
      medications: entry.schedule.medications.filter((medication) => medication.drug.trim().toLowerCase() !== drug),
      moments: entry.schedule.moments?.filter((moment) => {
        if (moment.drug.trim().toLowerCase() !== drug || moment.status !== "PENDING") return true;
        if (!body.from) return false;
        return moment.time < `${body.from}T00:00:00.000Z`;
      }),
    };
    return HttpResponse.json({ schedule: withoutMoments(entry.schedule) });
  }),

  http.delete("/api/v1/medications/:id", ({ params }) => {
    const id = String(params.id);
    const exists = entries.some((entry) => entry.schedule.id === id);
    if (!exists) {
      return HttpResponse.json({ error: "not_found", message: "Medication schedule not found" }, { status: 404 });
    }
    entries = entries.filter((entry) => entry.schedule.id !== id);
    return HttpResponse.json(scheduleDelete);
  }),
];
