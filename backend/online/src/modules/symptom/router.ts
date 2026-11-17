import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { threadIdFor } from '../../ai/agents.js';
import { defaultChatModel } from '../../ai/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
import { deleteObject, uploadObject } from '../../services/s3.js';
import { defaultSymptomAi, type SymptomAi } from './ai.js';
import {
  processAttachments,
  type AttachmentStorage,
  type ProcessedAttachments,
} from './attachments.js';
import { prismaSymptomStore, type SymptomStore } from './store.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      callback(null, true);
      return;
    }
    callback(
      new AppError(400, 'Only image and PDF attachments are supported', 'invalid_attachment'),
    );
  },
});

const uploadImages = upload.array('images', 5);

const uploadMiddleware: RequestHandler = (req, res, next) => {
  uploadImages(req, res, (error: unknown) => {
    if (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      const code = (error as { code?: string }).code;
      if (code === 'LIMIT_FILE_SIZE') {
        next(new AppError(400, 'Attachment is too large', 'attachment_too_large'));
        return;
      }
      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
        next(new AppError(400, 'Too many attachments', 'invalid_attachment'));
        return;
      }
      next(error);
      return;
    }
    next();
  });
};

const messageSchema = z.object({
  message: z.string().trim().min(1).max(8000),
});

const severitySchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toUpperCase();
    return normalized === 'SEVERITY' ? 'SEVERE' : normalized;
  },
  z.enum(['MILD', 'MODERATE', 'SEVERE']),
);

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    severity: severitySchema.optional(),
  })
  .strict();

const idSchema = z.string().uuid();

export interface SymptomRouterDeps {
  store: SymptomStore;
  ai: SymptomAi;
  aiFactory?: () => SymptomAi;
  storage: AttachmentStorage;
  auth: RequestHandler;
}

const defaultStorage: AttachmentStorage = {
  uploadObject,
  deleteObject,
};

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object'
    ? (req.body as Record<string, unknown>)
    : {};
}

function requireAccountId(req: Request): string {
  const accountId = req.auth?.accountId;
  if (!accountId) {
    throw new AppError(401, 'Authentication required', 'unauthorized');
  }
  return accountId;
}

function parseId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = idSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new AppError(404, 'Symptom analysis record not found', 'not_found');
  }
  return parsed.data;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  throw new AppError(400, 'Expected a boolean value', 'validation_error');
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed =
    typeof candidate === 'string' ? Number.parseInt(candidate, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function filesOf(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

async function cleanupAttachments(storage: AttachmentStorage, keys: string[]) {
  if (!keys.length) return;
  await Promise.allSettled(keys.map((key) => storage.deleteObject(key)));
}

export function createSymptomRouter(overrides: Partial<SymptomRouterDeps> = {}): Router {
  const store = overrides.store ?? prismaSymptomStore;
  const ai = overrides.aiFactory ? overrides.aiFactory() : (overrides.ai ?? defaultSymptomAi);
  const storage = overrides.storage ?? defaultStorage;
  const auth = overrides.auth ?? requireAuth;

  const router = Router();
  router.use(auth);

  router.post('/', uploadMiddleware, async (req, res, next) => {
    try {
      const accountId = requireAccountId(req);
      const raw = bodyOf(req);
      const body = messageSchema.parse(raw);
      const includeRecords = parseBoolean(raw.includeRecords, true);
      const modifyHistory = parseBoolean(raw.modifyHistory, true);

      if (!ai.isConfigured()) {
        throw new AppError(503, 'AI provider is not configured', 'ai_unavailable');
      }

      const patientId = await store.findPatientId(accountId);
      if (!patientId) {
        throw new AppError(404, 'Patient profile not found', 'not_found');
      }

      const model = defaultChatModel();
      let symptom = await store.create({
        patient_id: patientId,
        account_id: accountId,
        include_records: includeRecords,
        modify_history: modifyHistory,
        thread_id: null,
        model_version: model,
      });

      const threadId = threadIdFor(symptom.id);
      symptom =
        (await store.updateOwned(symptom.id, accountId, {
          thread_id: threadId,
          model_version: model,
        })) ?? symptom;

      let uploaded: string[] = [];
      try {
        const attachments = await processAttachments(filesOf(req), symptom.id, storage);
        uploaded = attachments.keys;

        if (uploaded.length) {
          symptom =
            (await store.updateOwned(symptom.id, accountId, {
              files: uploaded,
              model_version: model,
            })) ?? symptom;
        }

        const messages = await ai.invoke(
          {
            accountId,
            patientId,
            symptomId: symptom.id,
            includeRecords,
            modifyHistory,
            model,
            requestId: req.requestId,
          },
          { text: body.message, images: attachments.images },
        );

        const current = (await store.findOwned(symptom.id, accountId)) ?? symptom;
        res.status(201).json({ symptom: current, messages });
      } catch (error) {
        await cleanupAttachments(storage, uploaded);
        await ai.clear(threadId).catch(() => undefined);
        await store.deleteOwned(symptom.id, accountId).catch(() => false);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const accountId = requireAccountId(req);
      const page = parsePositiveInt(req.query.page, 1, 100_000);
      const limit = parsePositiveInt(req.query.limit, 10, 100);
      const { items, total } = await store.listByAccount(accountId, (page - 1) * limit, limit);
      res.json({
        symptoms: items,
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const accountId = requireAccountId(req);
      const id = parseId(req.params.id);
      const symptom = await store.findOwned(id, accountId);
      if (!symptom) {
        throw new AppError(404, 'Symptom analysis record not found', 'not_found');
      }

      const threadId = symptom.thread_id ?? threadIdFor(symptom.id);
      const messages = await ai.history(threadId);
      res.json({ symptom, messages });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/follow-up', uploadMiddleware, async (req, res, next) => {
    try {
      const accountId = requireAccountId(req);
      const id = parseId(req.params.id);
      const body = messageSchema.parse(bodyOf(req));

      const symptom = await store.findOwned(id, accountId);
      if (!symptom) {
        throw new AppError(404, 'Symptom analysis record not found', 'not_found');
      }

      if (!ai.isConfigured()) {
        throw new AppError(503, 'AI provider is not configured', 'ai_unavailable');
      }

      const model = defaultChatModel();
      let uploaded: string[] = [];
      try {
        let attachments: ProcessedAttachments = { keys: [], images: [] };
        attachments = await processAttachments(filesOf(req), symptom.id, storage);
        uploaded = attachments.keys;

        const messages = await ai.invoke(
          {
            accountId,
            patientId: symptom.patient_id,
            symptomId: symptom.id,
            includeRecords: symptom.include_records,
            modifyHistory: symptom.modify_history,
            model,
            requestId: req.requestId,
          },
          { text: body.message, images: attachments.images },
        );

        const files = uploaded.length ? [...symptom.files, ...uploaded] : symptom.files;
        const updated =
          (await store.updateOwned(symptom.id, accountId, {
            files,
            model_version: model,
          })) ?? symptom;

        res.json({ symptom: updated, messages: messages.slice(-2) });
      } catch (error) {
        await cleanupAttachments(storage, uploaded);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const accountId = requireAccountId(req);
      const id = parseId(req.params.id);
      const patch = patchSchema.parse(bodyOf(req));

      if (patch.name === undefined && patch.severity === undefined) {
        throw new AppError(400, 'No symptom analysis fields to update', 'invalid_update');
      }

      const updated = await store.updateOwned(id, accountId, patch);
      if (!updated) {
        throw new AppError(404, 'Symptom analysis record not found', 'not_found');
      }
      res.json({ symptom: updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const accountId = requireAccountId(req);
      const id = parseId(req.params.id);
      const symptom = await store.findOwned(id, accountId);
      if (!symptom) {
        throw new AppError(404, 'Symptom analysis record not found', 'not_found');
      }

      await ai.clear(symptom.thread_id ?? threadIdFor(symptom.id)).catch(() => undefined);
      await cleanupAttachments(storage, symptom.files);
      await store.deleteOwned(id, accountId);

      res.json({ deleted: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const symptomRouter = createSymptomRouter();
