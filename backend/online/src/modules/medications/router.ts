import type { Request, RequestHandler } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import {
  appendMedications,
  createScheduleWithMoments,
  recomputeScheduleProgress,
  removeMedication,
  type ScheduledMedication,
} from '../../domain/medications.js';
import { logger } from '../../logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
import { recordAudit } from '../../services/audit.js';
import {
  generateAddition,
  generateSchedule,
  type MedicationDocumentInput,
} from './ai.js';

const timeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const textValue = z.preprocess((value) => (value == null ? '' : value), z.string().trim());

const medicationSchema = z.object({
  drug: z.string().trim().min(1),
  dose: textValue,
  frequency: textValue,
  times: z.array(timeSchema).min(1),
});

const medicationsSchema = z.array(medicationSchema).min(1);

const removeSchema = z.object({
  drug: z.string().trim().min(1),
  from: z.unknown().optional(),
});

const momentStatusSchema = z.object({
  status: z.enum(['TAKEN', 'MISSED', 'PENDING']),
});

const deviceSchema = z.object({
  token: z.string().trim().min(1).max(4096),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadDocument: RequestHandler = (req, res, next) => {
  upload.single('document')(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new AppError(400, 'Invalid document upload', 'invalid_document'));
      return;
    }
    next(error);
  });
};

function accountId(req: Request) {
  if (!req.auth) throw new AppError(401, 'Authentication required', 'unauthorized');
  return req.auth.accountId;
}

function bodyOf(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

function optionalString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseDateField(value: unknown, name: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AppError(400, `${name} is invalid`, 'invalid_schedule');
    }
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, `${name} is required`, 'invalid_schedule');
  }
  const raw = value.trim();
  const calendar = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = Number(calendar[2]);
    const day = Number(calendar[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new AppError(400, `${name} is invalid`, 'invalid_schedule');
    }
    return date;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `${name} is invalid`, 'invalid_schedule');
  }
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function ensureRange(startDate: Date, endDate: Date) {
  if (endDate.getTime() < startDate.getTime()) {
    throw new AppError(400, 'End date must not precede start date', 'invalid_schedule');
  }
}

function uuidParam(value: string | string[] | undefined, message: string) {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id || !UUID_PATTERN.test(id)) {
    throw new AppError(404, message, 'not_found');
  }
  return id;
}

function positiveInt(value: unknown, fallback: number, max: number) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' && typeof raw !== 'number') return fallback;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseMedicationValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function structuredMedications(value: unknown): ScheduledMedication[] | null {
  const candidate = parseMedicationValue(value);
  if (!Array.isArray(candidate) || candidate.length === 0) return null;
  const parsed = medicationsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function looksStructuredMedications(value: unknown) {
  const candidate = parseMedicationValue(value);
  return (
    Array.isArray(candidate) &&
    candidate.some(
      (item) => item !== null && typeof item === 'object' && 'drug' in (item as object),
    )
  );
}

function normalizeAiMedications(value: unknown): ScheduledMedication[] {
  const parsed = medicationsSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(502, 'AI returned an invalid medication schedule', 'ai_invalid_response');
  }
  return parsed.data;
}

function hasMedicationInput(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value != null;
}

function defaultSummary(medications: ScheduledMedication[]) {
  return medications
    .map((medication) => `${medication.drug}${medication.dose ? ` ${medication.dose}` : ''}`)
    .join(', ');
}

function documentInput(req: Request): MedicationDocumentInput | undefined {
  if (!req.file) return undefined;
  return {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    filename: req.file.originalname,
  };
}

async function patientIdFor(account: string) {
  const profile = await prisma.patientProfile.findUnique({
    where: { account_id: account },
    select: { id: true },
  });
  if (!profile) {
    throw new AppError(403, 'A patient profile is required', 'patient_profile_required');
  }
  return profile.id;
}

async function auditAiSchedule(input: {
  req: Request;
  patientId: string;
  action: string;
  resourceId: string;
  model?: string;
}) {
  const model = input.model ?? config.ai.schedulerModel;
  try {
    await recordAudit({
      requestId: input.req.requestId,
      actorAccountId: input.req.auth?.accountId ?? null,
      patientId: input.patientId,
      channel: 'SYSTEM',
      action: input.action,
      resourceType: 'medication_schedule',
      resourceId: input.resourceId,
      outcome: 'ALLOWED',
      actorRef: `ai:${model}`,
      metadata: { model },
    });
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : 'unknown' },
      'failed to audit AI medication write',
    );
  }
}

export const medicationsRouter = Router();
export const devicesRouter = Router();

medicationsRouter.use(requireAuth);
devicesRouter.use(requireAuth);

medicationsRouter.post('/', uploadDocument, async (req, res) => {
  const account = accountId(req);
  const patientId = await patientIdFor(account);
  const body = bodyOf(req);
  const startDate = parseDateField(body.startDate, 'startDate');
  const endDate = parseDateField(body.endDate, 'endDate');
  ensureRange(startDate, endDate);

  const structured = structuredMedications(body.medications);
  if (!structured && looksStructuredMedications(body.medications)) {
    throw new AppError(400, 'Invalid medication entry', 'invalid_schedule');
  }
  const document = documentInput(req);
  const title = optionalString(body.title);
  const description = optionalString(body.description);
  const summary = optionalString(body.summary);

  let medications: ScheduledMedication[];
  let resolvedTitle: string | null;
  let resolvedDescription: string | null;
  let resolvedSummary: string;
  let aiModel: string | undefined;
  let aiAssisted = false;

  if (structured) {
    medications = structured;
    resolvedTitle = title ?? null;
    resolvedDescription = description ?? null;
    resolvedSummary = summary ?? defaultSummary(medications);
  } else {
    if (!hasMedicationInput(body.medications) && !document) {
      throw new AppError(400, 'Medications or a document is required', 'invalid_schedule');
    }
    const draft = await generateSchedule({
      patientId,
      accountId: account,
      requestId: req.requestId,
      medications: body.medications,
      startDate,
      endDate,
      document,
    });
    medications = normalizeAiMedications(draft.medications);
    resolvedTitle = title ?? draft.title ?? null;
    resolvedDescription = description ?? draft.description ?? null;
    resolvedSummary = summary ?? optionalString(draft.summary) ?? defaultSummary(medications);
    aiModel = draft.model;
    aiAssisted = true;
  }

  const schedule = await createScheduleWithMoments({
    patientId,
    title: resolvedTitle,
    description: resolvedDescription,
    summary: resolvedSummary,
    medications,
    startDate,
    endDate,
  });

  if (aiAssisted) {
    await auditAiSchedule({
      req,
      patientId,
      action: 'medication_schedule.create',
      resourceId: schedule.id,
      model: aiModel,
    });
  }

  res.status(201).json({ schedule });
});

medicationsRouter.get('/', async (req, res) => {
  const patientId = await patientIdFor(accountId(req));
  const page = positiveInt(req.query.page, 1, 1_000_000);
  const limit = positiveInt(req.query.limit, 10, 50);

  const [schedules, total] = await Promise.all([
    prisma.medicationSchedule.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.medicationSchedule.count({ where: { patient_id: patientId } }),
  ]);

  res.json({
    schedules,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

medicationsRouter.patch('/moments/:id', async (req, res) => {
  const patientId = await patientIdFor(accountId(req));
  const momentId = uuidParam(req.params.id, 'Medication moment not found');
  const { status } = momentStatusSchema.parse(bodyOf(req));

  const moment = await prisma.medicationMoment.findUnique({
    where: { id: momentId },
    include: { schedule: { select: { id: true, patient_id: true } } },
  });
  if (!moment || moment.schedule.patient_id !== patientId) {
    throw new AppError(404, 'Medication moment not found', 'not_found');
  }

  const updated = await prisma.medicationMoment.update({
    where: { id: momentId },
    data: { status },
  });
  const schedule = await recomputeScheduleProgress(moment.medication_schedule_id);

  res.json({
    moment: updated,
    progress: schedule.progress,
    score: schedule.score,
  });
});

medicationsRouter.get('/:id', async (req, res) => {
  const patientId = await patientIdFor(accountId(req));
  const id = uuidParam(req.params.id, 'Medication schedule not found');

  const schedule = await prisma.medicationSchedule.findFirst({
    where: { id, patient_id: patientId },
    include: { moments: { orderBy: { time: 'asc' } } },
  });
  if (!schedule) {
    throw new AppError(404, 'Medication schedule not found', 'not_found');
  }

  res.json({ schedule });
});

medicationsRouter.delete('/:id', async (req, res) => {
  const patientId = await patientIdFor(accountId(req));
  const id = uuidParam(req.params.id, 'Medication schedule not found');

  const result = await prisma.medicationSchedule.deleteMany({
    where: { id, patient_id: patientId },
  });
  if (result.count === 0) {
    throw new AppError(404, 'Medication schedule not found', 'not_found');
  }

  res.json({ message: 'Medication schedule deleted' });
});

medicationsRouter.patch('/:id/add', uploadDocument, async (req, res) => {
  const account = accountId(req);
  const patientId = await patientIdFor(account);
  const id = uuidParam(req.params.id, 'Medication schedule not found');
  const body = bodyOf(req);
  const startDate = parseDateField(body.startDate, 'startDate');
  const endDate = parseDateField(body.endDate, 'endDate');
  ensureRange(startDate, endDate);

  const schedule = await prisma.medicationSchedule.findFirst({
    where: { id, patient_id: patientId },
  });
  if (!schedule) {
    throw new AppError(404, 'Medication schedule not found', 'not_found');
  }

  const structured = structuredMedications(body.medications);
  if (!structured && looksStructuredMedications(body.medications)) {
    throw new AppError(400, 'Invalid medication entry', 'invalid_schedule');
  }
  const document = documentInput(req);

  let medications: ScheduledMedication[];
  let aiModel: string | undefined;

  if (structured) {
    medications = structured;
  } else {
    if (!hasMedicationInput(body.medications) && !document) {
      throw new AppError(400, 'Medications or a document is required', 'invalid_schedule');
    }
    const existing = (schedule.medications as unknown as ScheduledMedication[]) ?? [];
    const draft = await generateAddition({
      patientId,
      accountId: account,
      requestId: req.requestId,
      existing,
      medications: body.medications,
      startDate,
      endDate,
      document,
    });
    medications = normalizeAiMedications(draft.medications);
    aiModel = draft.model;
  }

  const updated = await appendMedications(id, patientId, medications, startDate, endDate);

  if (!structured) {
    await auditAiSchedule({
      req,
      patientId,
      action: 'medication_schedule.add',
      resourceId: id,
      model: aiModel,
    });
  }

  res.status(201).json({ schedule: updated });
});

medicationsRouter.patch('/:id/remove', async (req, res) => {
  const patientId = await patientIdFor(accountId(req));
  const id = uuidParam(req.params.id, 'Medication schedule not found');
  const { drug, from } = removeSchema.parse(bodyOf(req));
  const fromDate = from === undefined || from === null ? undefined : parseDateField(from, 'from');

  const updated = await removeMedication(id, patientId, drug, fromDate);
  res.json({ schedule: updated });
});

devicesRouter.post('/', async (req, res) => {
  const account = accountId(req);
  const { token, platform } = deviceSchema.parse(bodyOf(req));

  const device = await prisma.notificationToken.upsert({
    where: { token },
    create: {
      account_id: account,
      token,
      platform,
      last_used_at: new Date(),
    },
    update: {
      account_id: account,
      platform,
      last_used_at: new Date(),
    },
  });

  res.status(201).json({ device: { id: device.id, platform: device.platform } });
});
