import type { BaseLanguageModelInterface } from '@langchain/core/language_models/base';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { FakeEmbeddings } from '@langchain/core/utils/testing';
import type { Prisma, Severity } from '@prisma/client';
import axios from 'axios';
import { WebBrowser } from 'langchain/tools/webbrowser';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { createScheduleWithMoments, type ScheduledMedication } from '../domain/medications.js';
import { AppError } from '../middleware/error.js';
import { recordAiAudit } from '../services/audit.js';
import { getModel } from './models.js';
import { scheduledMedicationSchema } from './schemas.js';

export interface AgentToolContext {
  model: string;
  accountId?: string | null;
  patientId: string;
  symptomId?: string;
  requestId?: string;
}

export interface PatientDetails {
  displayName: string;
  preferredLanguage: string;
  homeArea: {
    name: string;
    city: string;
    region: string;
    countryCode: string;
  } | null;
  fields: Record<string, unknown>;
  fieldLabels: Record<string, string>;
  allergies: Array<{ name: string; severity: Severity; diagnosisDate: string | null }>;
  medicalEvents: Array<{
    name: string;
    occurredOn: string | null;
    recoveryTime: string | null;
    description: string | null;
  }>;
  recentSymptoms: string[];
}

const PHONE_KEY = /phone|mobile|whatsapp|telephone|msisdn/i;

function looksLikePhone(value: string): boolean {
  if (!/^[+\d\s().-]+$/.test(value.trim())) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function sanitizeText(value: string): string {
  if (looksLikePhone(value)) return '[redacted]';
  return value.replace(/\+?\d[\d\s().-]{8,}\d/g, (match) => {
    const digits = match.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 ? '[redacted]' : match;
  });
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (PHONE_KEY.test(key)) continue;
      sanitized[key] = sanitizeValue(item);
    }
    return sanitized;
  }
  return value;
}

export async function lookupPatientDetails(
  patientId: string,
  context?: AgentToolContext,
): Promise<PatientDetails> {
  const profile = await prisma.patientProfile.findUnique({
    where: { id: patientId },
    select: {
      preferred_language: true,
      home_area: { select: { name: true, city: true, region: true, country_code: true } },
      account: { select: { display_name: true } },
      field_values: {
        select: { field_key: true, value: true, field: { select: { label: true } } },
      },
      allergies: {
        select: { name: true, severity: true, diagnosis_date: true },
        orderBy: { created_at: 'desc' },
      },
      medical_events: {
        select: { name: true, occurred_on: true, recovery_time: true, description: true },
        orderBy: { created_at: 'desc' },
        take: 25,
      },
      symptom_analyses: {
        where: { name: { not: null } },
        select: { name: true },
        orderBy: { created_at: 'desc' },
        take: 10,
      },
    },
  });

  if (!profile) {
    if (context?.model) {
      await recordAiAudit({
        requestId: context.requestId,
        actorAccountId: context.accountId,
        patientId,
        action: 'patient.details.read',
        resourceType: 'patient_profile',
        resourceId: patientId,
        outcome: 'DENIED',
        reasonCode: 'not_found',
        model: context.model,
      });
    }
    throw new AppError(404, 'Patient profile not found', 'not_found');
  }

  const fields: Record<string, unknown> = {};
  const fieldLabels: Record<string, string> = {};
  for (const value of profile.field_values) {
    if (PHONE_KEY.test(value.field_key)) continue;
    fields[value.field_key] = sanitizeValue(value.value);
    fieldLabels[value.field_key] = value.field.label;
  }

  const details: PatientDetails = {
    displayName: profile.account.display_name,
    preferredLanguage: profile.preferred_language,
    homeArea: profile.home_area
      ? {
          name: profile.home_area.name,
          city: profile.home_area.city,
          region: profile.home_area.region,
          countryCode: profile.home_area.country_code,
        }
      : null,
    fields,
    fieldLabels,
    allergies: profile.allergies.map((allergy) => ({
      name: allergy.name,
      severity: allergy.severity,
      diagnosisDate: allergy.diagnosis_date
        ? allergy.diagnosis_date.toISOString().slice(0, 10)
        : null,
    })),
    medicalEvents: profile.medical_events.map((event) => ({
      name: event.name,
      occurredOn: event.occurred_on ? event.occurred_on.toISOString().slice(0, 10) : null,
      recoveryTime: event.recovery_time,
      description:
        typeof event.description === 'string' ? sanitizeText(event.description) : null,
    })),
    recentSymptoms: profile.symptom_analyses
      .map((symptom) => symptom.name)
      .filter((name): name is string => Boolean(name)),
  };

  if (context?.model) {
    await recordAiAudit({
      requestId: context.requestId,
      actorAccountId: context.accountId,
      patientId,
      action: 'patient.details.read',
      resourceType: 'patient_profile',
      resourceId: patientId,
      outcome: 'ALLOWED',
      fieldKeys: Object.keys(fields),
      model: context.model,
      metadata: {
        allergy_count: details.allergies.length,
        medical_event_count: details.medicalEvents.length,
        symptom_count: details.recentSymptoms.length,
      },
    });
  }

  return details;
}

const severitySchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toUpperCase();
  return normalized === 'SEVERITY' ? 'SEVERE' : normalized;
}, z.enum(['MILD', 'MODERATE', 'SEVERE']));

function normalizeSeverity(value: string): Severity {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'MILD') return 'MILD';
  if (normalized === 'MODERATE') return 'MODERATE';
  if (normalized === 'SEVERE' || normalized === 'SEVERITY') return 'SEVERE';
  throw new AppError(400, `Invalid severity: ${value}`, 'invalid_severity');
}

export interface EditSymptomAnalysisInput {
  id: string;
  accountId: string;
  patientId?: string | null;
  symptomName?: string;
  summary?: string;
  severity?: string;
  model: string;
  requestId?: string;
}

export async function editSymptomAnalysis(input: EditSymptomAnalysisInput): Promise<void> {
  const data: Prisma.SymptomAnalysisUpdateManyMutationInput = {};
  const fieldKeys: string[] = [];

  if (input.symptomName !== undefined && input.symptomName.trim() !== '') {
    data.name = input.symptomName.trim();
    fieldKeys.push('name');
  }
  if (input.summary !== undefined) {
    data.summary = input.summary;
    fieldKeys.push('summary');
  }
  if (input.severity !== undefined) {
    data.severity = normalizeSeverity(input.severity);
    fieldKeys.push('severity');
  }

  if (!fieldKeys.length) {
    throw new AppError(400, 'No symptom analysis fields to update', 'invalid_update');
  }

  const result = await prisma.symptomAnalysis.updateMany({
    where: { id: input.id, account_id: input.accountId },
    data,
  });

  if (result.count === 0) {
    await recordAiAudit({
      requestId: input.requestId,
      actorAccountId: input.accountId,
      patientId: input.patientId ?? null,
      action: 'symptom_analysis.update',
      resourceType: 'symptom_analysis',
      resourceId: input.id,
      outcome: 'DENIED',
      reasonCode: 'not_found',
      fieldKeys,
      model: input.model,
    });
    throw new AppError(404, 'Symptom analysis record not found', 'not_found');
  }

  await recordAiAudit({
    requestId: input.requestId,
    actorAccountId: input.accountId,
    patientId: input.patientId ?? null,
    action: 'symptom_analysis.update',
    resourceType: 'symptom_analysis',
    resourceId: input.id,
    outcome: 'ALLOWED',
    fieldKeys,
    model: input.model,
  });
}

export async function searchOnline(
  query: string,
  context?: AgentToolContext,
): Promise<string> {
  if (!config.ai.serper) {
    throw new AppError(503, 'Online search is not configured', 'ai_unavailable');
  }

  let data: unknown;
  try {
    const response = await axios.post(
      'https://google.serper.dev/search',
      { q: query },
      {
        headers: {
          'X-API-KEY': config.ai.serper,
          'Content-Type': 'application/json',
        },
        timeout: 20_000,
      },
    );
    data = response.data;
  } catch {
    throw new AppError(502, 'Online search failed', 'search_failed');
  }

  if (context?.model) {
    await recordAiAudit({
      requestId: context.requestId,
      actorAccountId: context.accountId,
      patientId: context.patientId,
      action: 'web.search',
      resourceType: 'web_search',
      outcome: 'ALLOWED',
      model: context.model,
      metadata: { query_length: query.length },
    });
  }

  return JSON.stringify(data);
}

let webBrowser: WebBrowser | null = null;

export function getWebBrowser(): WebBrowser {
  if (!webBrowser) {
    webBrowser = new WebBrowser({
      model: getModel('deepSeekChat') as unknown as BaseLanguageModelInterface,
      embeddings: new FakeEmbeddings(),
    });
  }
  return webBrowser;
}

export interface CreateMedicationScheduleInput {
  patientId: string;
  model: string;
  accountId?: string | null;
  requestId?: string;
  title?: string;
  description?: string;
  summary: string;
  medications: ScheduledMedication[];
  startDate: Date;
  endDate: Date;
}

export async function createMedicationSchedule(input: CreateMedicationScheduleInput) {
  const schedule = await createScheduleWithMoments({
    patientId: input.patientId,
    title: input.title ?? null,
    description: input.description ?? null,
    summary: input.summary,
    medications: input.medications,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  await recordAiAudit({
    requestId: input.requestId,
    actorAccountId: input.accountId ?? null,
    patientId: input.patientId,
    action: 'medication_schedule.create',
    resourceType: 'medication_schedule',
    resourceId: schedule.id,
    outcome: 'ALLOWED',
    model: input.model,
    metadata: {
      medication_count: input.medications.length,
      start_date: input.startDate.toISOString().slice(0, 10),
      end_date: input.endDate.toISOString().slice(0, 10),
    },
  });

  return schedule;
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new AppError(400, 'Expected a date in YYYY-MM-DD format', 'invalid_date');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new AppError(400, 'Invalid date', 'invalid_date');
  }
  return date;
}

const editSymptomAnalysisSchema = z.object({
  symptomName: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  severity: severitySchema.optional(),
});

const searchOnlineSchema = z.object({
  query: z.string().min(1),
});

const browserSchema = z.object({
  url: z.string().url(),
});

const medicationScheduleToolSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  summary: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  medications: z.array(scheduledMedicationSchema).min(1),
});

function webBrowserTool(context: AgentToolContext): StructuredToolInterface {
  const browser = getWebBrowser();
  return tool(
    async ({ url }) => {
      const result = await browser.invoke(url);
      await recordAiAudit({
        requestId: context.requestId,
        actorAccountId: context.accountId,
        patientId: context.patientId,
        action: 'web.browse',
        resourceType: 'web_page',
        outcome: 'ALLOWED',
        model: context.model,
        metadata: { host: new URL(url).host },
      });
      return result;
    },
    {
      name: 'webBrowser',
      description:
        'Open a web page and summarize its content. Input is the absolute URL to browse.',
      schema: browserSchema,
    },
  );
}

function editSymptomTool(context: AgentToolContext): StructuredToolInterface {
  return tool(
    async ({ symptomName, summary, severity }) => {
      if (!context.symptomId || !context.accountId) {
        throw new AppError(500, 'Symptom context is missing', 'missing_context');
      }
      await editSymptomAnalysis({
        id: context.symptomId,
        accountId: context.accountId,
        patientId: context.patientId,
        model: context.model,
        requestId: context.requestId,
        symptomName,
        summary,
        severity,
      });
      return 'Symptom analysis updated successfully';
    },
    {
      name: 'editSymptomAnalysis',
      description:
        'Update the name, severity and summary of the current symptom analysis record so it matches the conversation.',
      schema: editSymptomAnalysisSchema,
    },
  );
}

export function buildSymptomTools(
  context: AgentToolContext,
  options: { includeRecords: boolean },
): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [];

  if (options.includeRecords) {
    tools.push(
      tool(
        async () => JSON.stringify(await lookupPatientDetails(context.patientId, context)),
        {
          name: 'lookupPatientDetails',
          description:
            "Look up the current patient's profile fields, allergies, medical events and recent symptom names.",
          schema: z.object({}),
        },
      ),
    );
  }

  tools.push(editSymptomTool(context));

  if (config.ai.serper) {
    tools.push(
      tool(async ({ query }) => searchOnline(query, context), {
        name: 'searchOnline',
        description: 'Search the web for current medical information related to the query.',
        schema: searchOnlineSchema,
      }),
    );
  }

  if (config.ai.deepseek) {
    tools.push(webBrowserTool(context));
  }

  return tools;
}

export function createMedicationScheduleTool(context: AgentToolContext): StructuredToolInterface {
  return tool(
    async ({ title, description, summary, startDate, endDate, medications }) => {
      const schedule = await createMedicationSchedule({
        patientId: context.patientId,
        accountId: context.accountId,
        requestId: context.requestId,
        model: context.model,
        title,
        description,
        summary,
        medications,
        startDate: parseDateOnly(startDate),
        endDate: parseDateOnly(endDate),
      });
      return JSON.stringify({ id: schedule.id });
    },
    {
      name: 'createMedicationSchedule',
      description: 'Create a medication schedule with scheduled doses for the current patient.',
      schema: medicationScheduleToolSchema,
    },
  );
}

export function buildMedicationTools(context: AgentToolContext): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [
    tool(async () => JSON.stringify(await lookupPatientDetails(context.patientId, context)), {
      name: 'lookupPatientDetails',
      description:
        "Look up the current patient's profile fields, allergies, medical events and recent symptom names.",
      schema: z.object({}),
    }),
  ];

  if (config.ai.serper) {
    tools.push(
      tool(async ({ query }) => searchOnline(query, context), {
        name: 'searchOnline',
        description: 'Search the web for medication information related to the query.',
        schema: searchOnlineSchema,
      }),
    );
  }

  if (config.ai.deepseek) {
    tools.push(webBrowserTool(context));
  }

  return tools;
}

export function buildMedicationAdderTools(context: AgentToolContext): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [];

  if (config.ai.serper) {
    tools.push(
      tool(async ({ query }) => searchOnline(query, context), {
        name: 'searchOnline',
        description: 'Search the web for medication information related to the query.',
        schema: searchOnlineSchema,
      }),
    );
  }

  if (config.ai.deepseek) {
    tools.push(webBrowserTool(context));
  }

  return tools;
}
