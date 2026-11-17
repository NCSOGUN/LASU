import {
  generateAddition as runGenerateAddition,
  generateSchedule as runGenerateSchedule,
} from '../../ai/medications.js';
import type { ScheduledMedication } from '../../domain/medications.js';
import { AppError } from '../../middleware/error.js';

export interface MedicationDocumentInput {
  buffer: Buffer;
  mimetype: string;
  filename?: string;
}

export interface MedicationDraft {
  title?: string | null;
  description?: string | null;
  summary: string;
  medications: ScheduledMedication[];
  model?: string;
}

export interface MedicationAdditionDraft {
  medications: ScheduledMedication[];
  summary?: string;
  model?: string;
}

export interface GenerateScheduleInput {
  patientId: string;
  accountId?: string | null;
  requestId?: string;
  medications?: unknown;
  startDate: Date;
  endDate: Date;
  document?: MedicationDocumentInput;
}

export interface GenerateAdditionInput extends GenerateScheduleInput {
  existing: ScheduledMedication[];
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function medicationText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function imagesFor(document?: MedicationDocumentInput) {
  if (!document) return undefined;
  return [{ mimeType: document.mimetype, base64: document.buffer.toString('base64') }];
}

function translateError(error: unknown): never {
  if (error instanceof AppError) throw error;
  const candidate = error as { status?: unknown; code?: unknown } | null;
  if (candidate?.status === 503 || candidate?.code === 'ai_unavailable') {
    throw new AppError(503, 'AI medication service is unavailable', 'ai_unavailable');
  }
  throw new AppError(502, 'AI medication service failed', 'ai_error');
}

export async function generateSchedule(input: GenerateScheduleInput): Promise<MedicationDraft> {
  const startDate = isoDate(input.startDate);
  const endDate = isoDate(input.endDate);
  const message = input.document
    ? `The medication details: Start Date=${startDate}, End Date=${endDate}. The medication image is below.`
    : `Medication=${medicationText(input.medications)}. Start Date=${startDate}. End Date=${endDate}.`;

  try {
    const result = await runGenerateSchedule({
      message,
      patientId: input.patientId,
      accountId: input.accountId ?? null,
      requestId: input.requestId,
      extraPrompt:
        'Do not call createMedicationSchedule or write to the database. Return only the JSON object; the server persists it.',
      images: imagesFor(input.document),
    });
    if (result.err) throw new AppError(400, result.err, 'invalid_schedule');
    return {
      title: result.title ?? null,
      description: result.description ?? null,
      summary: result.summary,
      medications: result.medications,
      model: result.model,
    };
  } catch (error) {
    translateError(error);
  }
}

export async function generateAddition(
  input: GenerateAdditionInput,
): Promise<MedicationAdditionDraft> {
  const startDate = isoDate(input.startDate);
  const endDate = isoDate(input.endDate);
  const existing = input.existing
    .map((medication) => `${medication.drug} (${medication.dose}, ${medication.frequency})`)
    .join('; ');
  const message = `Existing Medication=${existing || 'none'}. New Medication=${medicationText(
    input.medications,
  )}. Start Date=${startDate}. End Date=${endDate}.`;

  try {
    const result = await runGenerateAddition({
      message,
      patientId: input.patientId,
      accountId: input.accountId ?? null,
      requestId: input.requestId,
      extraPrompt:
        'Do not create duplicate medications and do not write to the database. Return only the new medications as JSON; the server persists them.',
      images: imagesFor(input.document),
    });
    if (result.err) throw new AppError(400, result.err, 'invalid_schedule');
    return {
      medications: result.medications,
      summary: result.summary,
      model: result.model,
    };
  } catch (error) {
    translateError(error);
  }
}
