import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { generateText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import type { Service } from '../types.js';
import type { Source } from './web-search.js';

const PROMPT_BASE = new URL('../../../prompts/', import.meta.url);
const MAX_INPUT_LENGTH = 1000;
const MAX_ANSWER_LENGTH = 1200;
const MAX_EXCERPT_LENGTH = 1500;
const MAX_REVIEWED_EXCERPTS = 5;
const MAX_WEB_SOURCES = 6;
const MAX_CITATIONS = 10;
const WEB_LABEL = 'AI-assisted web information, not clinically reviewed';
const FALLBACK_TEXT =
  'I cannot give a safe answer right now. Please speak to a qualified health professional or visit the nearest health facility. If this is an emergency, seek urgent care immediately.';

const ClassificationSchema = z
  .object({
    intent: z.enum(['find_care', 'health_question', 'clarification', 'unsupported']),
    service_code: z.string().max(64).nullable(),
    location_query: z.string().max(120).nullable(),
    question: z.string().max(500).nullable(),
  })
  .strict();

const AnswerSchema = z
  .object({
    answer_text: z.string().max(MAX_ANSWER_LENGTH),
    citations: z.array(z.string().max(2048)).max(MAX_CITATIONS),
  })
  .strict();

type ClassificationOutput = z.infer<typeof ClassificationSchema>;
type AnswerOutput = z.infer<typeof AnswerSchema>;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

const DOSE_PATTERN = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ml|g|iu|units?|tablets?|capsules?|puffs?)\b/i;
const PRESCRIBE_PATTERN = /\bprescrib(?:e|ed|ing|ption)\b/i;
const HEDGED_DIAGNOSIS_PATTERN =
  /\b(?:you|patient)\s+(?:likely|probably|may|might|could)\s+(?:have|be suffering from)\b/i;
const DIRECT_DIAGNOSIS_PATTERN =
  /\b(?:you|patient)\s+(?:have|has)\s+(?:a\s+|an\s+)?(?:malaria|typhoid|diabetes|hypertension|infection|disease|condition|fever|cancer|covid)\b/i;
const MEDICATION_ACTION_PATTERN =
  /\b(?:take|start|stop|increase|decrease|double)\s+(?:\w+\s+){0,3}(?:mg|tablet|capsule|medicine|medication|drug|antibiotic)\b/i;
const WEB_REVIEW_CLAIM_PATTERN =
  /\b(?:clinically|medically)\s+reviewed\b|\breviewed\s+by\s+(?:a\s+)?(?:doctor|clinician|physician|medical professional)\b/i;
const VERIFICATION_CLAIM_PATTERN =
  /\bverified\s+(?:hospital|facility|clinic|service|provider)\b|\b(?:hospital|facility|clinic|service|provider)\s+(?:is\s+)?verified\b/i;

export type AssistantIntent = 'find_care' | 'health_question' | 'clarification' | 'unsupported';

export interface Classification {
  intent: AssistantIntent;
  service_code: string | null;
  location_query: string | null;
  question: string | null;
}

export type AnswerKind = 'reviewed' | 'web_unreviewed' | 'fallback';

export interface AssistantAnswer {
  text: string;
  sources: Source[];
  reviewedContentIds: string[];
  kind: AnswerKind;
}

export interface ReviewedContentRow {
  id: string;
  topic: string;
  language: string;
  version: string | number;
  body: string;
  reviewer: string;
  reviewed_at: string | Date;
}

export interface AssistantRepository {
  findReviewedContent(query: string): Promise<unknown[]>;
}

export interface AssistantSearch {
  searchHealth(query: string): Promise<Source[]>;
}

export interface AssistantConfig {
  aiEnabled: boolean;
  openrouterApiKey?: string;
  openrouterModel?: string;
  aiTimeoutMs?: number;
  aiMaxOutputTokens?: number;
  allowLiveWeb?: boolean;
}

export interface ClassifyOptions {
  services?: Service[];
}

export interface Assistant {
  classify(message: string, options?: ClassifyOptions): Promise<Classification>;
  answer(question: string): Promise<AssistantAnswer>;
}

export interface GenerateRequest {
  model: LanguageModel | string;
  system: string;
  prompt: string;
  schema: z.ZodType;
  maxOutputTokens: number;
  abortSignal: AbortSignal;
}

export interface GenerateResult {
  output?: unknown;
  object?: unknown;
}

export type GenerateLike = (request: GenerateRequest) => Promise<GenerateResult>;

export interface AssistantOptions {
  search?: AssistantSearch;
  repository?: AssistantRepository;
  model?: LanguageModel | string;
  generateImpl?: GenerateLike;
}

interface NormalizedConfig {
  aiEnabled: boolean;
  apiKey: string | null;
  modelName: string | null;
  aiTimeoutMs: number;
  aiMaxOutputTokens: number;
  allowLiveWeb: boolean;
}

interface ReviewedExcerpt {
  id: string;
  topic: string;
  language: string;
  version: string;
  body: string;
  reviewer: string;
  reviewed_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function loadPrompt(name: string): string | null {
  try {
    return readFileSync(new URL(name, PROMPT_BASE), 'utf8').trim();
  } catch {
    return null;
  }
}

const PROMPTS = {
  classify: loadPrompt('assistant-classify.txt'),
  answerReviewed: loadPrompt('assistant-answer-reviewed.txt'),
  answerWeb: loadPrompt('assistant-answer-web.txt'),
};

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function hasLetter(value: string): boolean {
  return /[\p{L}]/u.test(value);
}

function redactLongNumbers(value: string): string {
  return value
    .replace(/\d{6,}/g, '[number removed]')
    .replace(/(?:\+?\d{1,4}[\s().-]+){2,}\d{1,4}/g, '[number removed]');
}

function cleanUserText(value: unknown, maxLength: number): string {
  const text = cleanText(value, maxLength * 2);
  if (!text || !hasLetter(text)) return '';
  return redactLongNumbers(text).replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
}

function normalizeAssistantConfig(config: AssistantConfig): NormalizedConfig {
  if (!config || typeof config !== 'object') {
    throw new TypeError('assistant config is required');
  }
  const aiTimeoutMs = config.aiTimeoutMs ?? 10000;
  if (!Number.isInteger(aiTimeoutMs) || aiTimeoutMs < 10 || aiTimeoutMs > 60000) {
    throw new TypeError('aiTimeoutMs must be an integer between 10 and 60000');
  }
  const aiMaxOutputTokens = config.aiMaxOutputTokens ?? 400;
  if (!Number.isInteger(aiMaxOutputTokens) || aiMaxOutputTokens < 32 || aiMaxOutputTokens > 4096) {
    throw new TypeError('aiMaxOutputTokens must be an integer between 32 and 4096');
  }
  return {
    aiEnabled: config.aiEnabled === true,
    apiKey:
      typeof config.openrouterApiKey === 'string' && config.openrouterApiKey.trim()
        ? config.openrouterApiKey.trim()
        : null,
    modelName:
      typeof config.openrouterModel === 'string' && config.openrouterModel.trim()
        ? config.openrouterModel.trim()
        : null,
    aiTimeoutMs,
    aiMaxOutputTokens,
    allowLiveWeb: config.allowLiveWeb === true,
  };
}

function safeSourceUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input || input.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host || host.includes('%') || isIP(host)) return null;
  if (host === 'localhost' || host.endsWith('.localhost')) return null;
  if (
    ['.local', '.internal', '.lan', '.home', '.test', '.invalid', '.example'].some((suffix) =>
      host.endsWith(suffix),
    )
  ) {
    return null;
  }
  return url;
}

function normalizeServices(services: Service[]): Service[] {
  const output: Service[] = [];
  const seen = new Set<string>();
  for (const service of services.slice(0, 50)) {
    const code = cleanText(service?.service_code, 64);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    output.push({ service_code: code, label: cleanText(service.label, 120) || code });
  }
  return output;
}

function clarificationResult(): Classification {
  return {
    intent: 'clarification',
    service_code: null,
    location_query: null,
    question: null,
  };
}

function normalizeClassification(value: ClassificationOutput, services: Service[]): Classification {
  if (value.intent === 'unsupported') {
    return { intent: 'unsupported', service_code: null, location_query: null, question: null };
  }
  if (value.intent === 'clarification') {
    return {
      intent: 'clarification',
      service_code: null,
      location_query: null,
      question: cleanText(value.question, 300) || null,
    };
  }
  if (value.intent === 'health_question') {
    const question = cleanText(value.question, 500);
    if (!question) return clarificationResult();
    return { intent: 'health_question', service_code: null, location_query: null, question };
  }
  const codes = new Set(services.map((service) => service.service_code));
  const serviceCode =
    typeof value.service_code === 'string' && codes.has(value.service_code)
      ? value.service_code
      : null;
  const locationQuery = cleanText(value.location_query, 120) || null;
  const question = cleanText(value.question, 300) || null;
  if (!serviceCode && !locationQuery && !question) return clarificationResult();
  return {
    intent: 'find_care',
    service_code: serviceCode,
    location_query: locationQuery,
    question,
  };
}

function normalizeReviewedContent(rows: unknown): ReviewedExcerpt[] {
  if (!Array.isArray(rows)) return [];
  const reviewed: ReviewedExcerpt[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = cleanText(row.id, 128);
    const body = cleanText(row.body, MAX_EXCERPT_LENGTH);
    const reviewer = cleanText(row.reviewer, 120);
    const reviewedAt =
      row.reviewed_at instanceof Date
        ? row.reviewed_at.getTime()
        : Date.parse(String(row.reviewed_at));
    if (!id || seen.has(id) || !body || !reviewer || !Number.isFinite(reviewedAt)) continue;
    seen.add(id);
    reviewed.push({
      id,
      topic: cleanText(row.topic, 160),
      language: cleanText(row.language, 32),
      version: cleanText(String(row.version ?? ''), 32),
      body,
      reviewer,
      reviewed_at: new Date(reviewedAt).toISOString(),
    });
    if (reviewed.length >= MAX_REVIEWED_EXCERPTS) break;
  }
  return reviewed;
}

function normalizeSources(rawSources: unknown): Source[] {
  if (!Array.isArray(rawSources)) return [];
  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const source of rawSources) {
    if (!isRecord(source)) continue;
    const url = safeSourceUrl(source.url);
    if (!url || seen.has(url.href)) continue;
    seen.add(url.href);
    sources.push({
      title: cleanText(source.title, 300),
      url: url.href,
      snippet: cleanText(source.snippet, 800),
    });
    if (sources.length >= MAX_WEB_SOURCES) break;
  }
  return sources;
}

function normalizeCitations(values: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(values)) return [];
  const citations: string[] = [];
  for (const value of values.slice(0, MAX_CITATIONS)) {
    const citation = typeof value === 'string' ? value.trim() : '';
    if (!citation || !allowed.has(citation) || citations.includes(citation)) continue;
    citations.push(citation);
  }
  return citations;
}

function isSafeClinicalText(text: string): boolean {
  return ![
    DOSE_PATTERN,
    PRESCRIBE_PATTERN,
    HEDGED_DIAGNOSIS_PATTERN,
    DIRECT_DIAGNOSIS_PATTERN,
    MEDICATION_ACTION_PATTERN,
  ].some((pattern) => pattern.test(text));
}

function isSafeWebText(text: string): boolean {
  return (
    isSafeClinicalText(text) &&
    !WEB_REVIEW_CLAIM_PATTERN.test(text) &&
    !VERIFICATION_CLAIM_PATTERN.test(text)
  );
}

function fallbackResult(): AssistantAnswer {
  return {
    text: FALLBACK_TEXT,
    sources: [],
    reviewedContentIds: [],
    kind: 'fallback',
  };
}

function buildReviewedPrompt(question: string, excerpts: ReviewedExcerpt[]): string {
  return `Question:\n<<<\n${question}\n>>>\n\nReviewed excerpts:\n${JSON.stringify(excerpts)}`;
}

function buildWebPrompt(question: string, sources: Source[]): string {
  return `Question:\n<<<\n${question}\n>>>\n\nWeb sources:\n${JSON.stringify(sources)}`;
}

export function createAssistant(
  config: AssistantConfig,
  options: AssistantOptions = {},
): Assistant {
  const settings = normalizeAssistantConfig(config);
  const { search, repository, generateImpl } = options;
  let openrouter: ReturnType<typeof createOpenRouter> | undefined;
  let resolvedModel: LanguageModel | null =
    options.model && typeof options.model === 'object' ? options.model : null;
  const injectedModelId = typeof options.model === 'string' ? options.model : null;

  function resolveModel(): LanguageModel | string | null {
    if (resolvedModel) return resolvedModel;
    const modelName = injectedModelId ?? settings.modelName;
    if (!modelName) return null;
    if (settings.apiKey) {
      openrouter ??= createOpenRouter({ apiKey: settings.apiKey });
      resolvedModel = openrouter(modelName);
      return resolvedModel;
    }
    if (injectedModelId && generateImpl) return injectedModelId;
    return null;
  }

  function canGenerate(): boolean {
    if (!settings.aiEnabled) return false;
    if (generateImpl) return true;
    try {
      return resolveModel() !== null;
    } catch {
      return false;
    }
  }

  const execute: GenerateLike =
    generateImpl ??
    (async (request) => {
      const result = await generateText({
        model: request.model as LanguageModel,
        system: request.system,
        prompt: request.prompt,
        output: Output.object({ schema: request.schema }),
        maxOutputTokens: request.maxOutputTokens,
        abortSignal: request.abortSignal,
      });
      return { output: result.output };
    });

  async function generate<T>(
    schema: z.ZodType<T>,
    name: string,
    system: string | null,
    prompt: string,
  ): Promise<T | null> {
    if (!canGenerate() || !system) return null;
    const model = resolveModel();
    if (!model) return null;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = Promise.resolve().then(() =>
      execute({
        model,
        system,
        prompt,
        schema,
        maxOutputTokens: settings.aiMaxOutputTokens,
        abortSignal: controller.signal,
      }),
    );
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('ai request timed out'));
      }, settings.aiTimeoutMs);
    });
    try {
      const result = await Promise.race([work, deadline]);
      const candidate = result.output ?? result.object;
      const parsed = schema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    } catch {
      work.catch(() => undefined);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function classify(
    message: string,
    { services = [] }: ClassifyOptions = {},
  ): Promise<Classification> {
    const text = cleanUserText(message, MAX_INPUT_LENGTH);
    if (!text || !canGenerate() || !PROMPTS.classify) return clarificationResult();
    const serviceList = normalizeServices(services);
    const prompt = `Message:\n<<<\n${text}\n>>>\n\nService codes and labels:\n${JSON.stringify(serviceList)}`;
    const output = await generate(ClassificationSchema, 'HealthIntent', PROMPTS.classify, prompt);
    return output ? normalizeClassification(output, serviceList) : clarificationResult();
  }

  async function answer(question: string): Promise<AssistantAnswer> {
    const text = cleanUserText(question, MAX_INPUT_LENGTH);
    if (!text || !canGenerate()) return fallbackResult();

    let reviewedRows: unknown[];
    try {
      if (!repository) return fallbackResult();
      reviewedRows = await repository.findReviewedContent(text);
    } catch {
      return fallbackResult();
    }
    const reviewed = normalizeReviewedContent(reviewedRows);

    if (reviewed.length > 0) {
      if (!PROMPTS.answerReviewed) return fallbackResult();
      const output = await generate(
        AnswerSchema,
        'ReviewedHealthAnswer',
        PROMPTS.answerReviewed,
        buildReviewedPrompt(text, reviewed),
      );
      if (!output) return fallbackResult();
      const answerText = cleanText(output.answer_text, MAX_ANSWER_LENGTH);
      if (!answerText || !isSafeClinicalText(answerText)) return fallbackResult();
      const cited = normalizeCitations(output.citations, new Set(reviewed.map((row) => row.id)));
      if (cited.length === 0) return fallbackResult();
      return {
        text: answerText,
        sources: [],
        reviewedContentIds: cited,
        kind: 'reviewed',
      };
    }

    if (!settings.allowLiveWeb || !search) return fallbackResult();

    let rawSources: Source[];
    try {
      rawSources = await search.searchHealth(text);
    } catch {
      return fallbackResult();
    }
    const sources = normalizeSources(rawSources);
    if (sources.length === 0 || !PROMPTS.answerWeb) return fallbackResult();

    const output: AnswerOutput | null = await generate(
      AnswerSchema,
      'WebHealthAnswer',
      PROMPTS.answerWeb,
      buildWebPrompt(text, sources),
    );
    if (!output) return fallbackResult();
    const answerText = cleanText(output.answer_text, MAX_ANSWER_LENGTH);
    if (!answerText || !isSafeWebText(answerText)) return fallbackResult();
    const cited = normalizeCitations(
      output.citations,
      new Set(sources.map((source) => source.url)),
    );
    if (cited.length === 0) return fallbackResult();

    const sourceLines = cited.map((url) => `${new URL(url).hostname}: ${url}`).join('; ');
    return {
      text: `${WEB_LABEL}.\n\n${answerText}\n\nSources: ${sourceLines}`,
      sources,
      reviewedContentIds: [],
      kind: 'web_unreviewed',
    };
  }

  return { classify, answer };
}
