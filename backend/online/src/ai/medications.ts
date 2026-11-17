import { AppError } from '../middleware/error.js';
import { defaultSchedulerModel } from './models.js';
import {
  runMedicationAdder,
  runMedicationScheduler,
  type AgentImage,
  type MedicationAgentContext,
} from './agents.js';
import {
  generatedAdditionSchema,
  generatedScheduleSchema,
  type GeneratedAddition,
  type GeneratedSchedule,
} from './schemas.js';

export interface GenerateScheduleInput {
  message: string;
  patientId: string;
  accountId?: string | null;
  requestId?: string;
  model?: string;
  extraPrompt?: string;
  images?: AgentImage[];
}

export interface GenerateAdditionInput extends GenerateScheduleInput {}

function extractJson(raw: string): unknown {
  const fenced = raw.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new AppError(502, 'AI returned an invalid response', 'ai_invalid_response');
  }
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    throw new AppError(502, 'AI returned an invalid response', 'ai_invalid_response');
  }
}

function contextFrom(
  input: GenerateScheduleInput,
  model: string,
): MedicationAgentContext {
  return {
    patientId: input.patientId,
    accountId: input.accountId ?? null,
    requestId: input.requestId,
    model,
    extraPrompt: input.extraPrompt,
  };
}

export async function generateSchedule(
  input: GenerateScheduleInput,
): Promise<GeneratedSchedule & { model: string }> {
  if (!input.message.trim()) {
    throw new AppError(400, 'A message is required', 'invalid_request');
  }

  const model = input.model ?? defaultSchedulerModel();
  const raw = await runMedicationScheduler(contextFrom(input, model), {
    text: input.message,
    images: input.images,
  });

  const result = generatedScheduleSchema.safeParse(extractJson(raw));
  if (!result.success) {
    throw new AppError(502, 'AI returned an invalid medication schedule', 'ai_invalid_response');
  }
  return { ...result.data, model };
}

export async function generateAddition(
  input: GenerateAdditionInput,
): Promise<GeneratedAddition & { model: string }> {
  if (!input.message.trim()) {
    throw new AppError(400, 'A message is required', 'invalid_request');
  }

  const model = input.model ?? defaultSchedulerModel();
  const raw = await runMedicationAdder(contextFrom(input, model), {
    text: input.message,
    images: input.images,
  });

  const result = generatedAdditionSchema.safeParse(extractJson(raw));
  if (!result.success) {
    throw new AppError(502, 'AI returned an invalid medication addition', 'ai_invalid_response');
  }
  return { ...result.data, model };
}

export type { GeneratedAddition, GeneratedSchedule } from './schemas.js';
