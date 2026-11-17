import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import type { RequestHandler } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import type { AgentMessageInput, ConversationEntry } from '../src/ai/agents.js';
import { errorHandler, notFound } from '../src/middleware/error.js';
import type { SymptomAi, SymptomAiContext } from '../src/modules/symptom/ai.js';
import type { AttachmentStorage } from '../src/modules/symptom/attachments.js';
import {
  createSymptomRouter,
  type SymptomRouterDeps,
} from '../src/modules/symptom/router.js';
import type {
  CreateSymptomRecordInput,
  SymptomRecord,
  SymptomRecordPatch,
  SymptomStore,
} from '../src/modules/symptom/store.js';

class MemorySymptomStore implements SymptomStore {
  records = new Map<string, SymptomRecord>();
  patients = new Map<string, string>();

  addPatient(accountId: string, patientId = randomUUID()) {
    this.patients.set(accountId, patientId);
    return patientId;
  }

  seed(accountId: string, overrides: Partial<SymptomRecord> = {}): SymptomRecord {
    const id = randomUUID();
    const now = new Date();
    const record: SymptomRecord = {
      id,
      patient_id: this.patients.get(accountId) ?? randomUUID(),
      account_id: accountId,
      name: 'Headache',
      severity: 'MILD',
      summary: null,
      include_records: true,
      modify_history: true,
      files: [],
      thread_id: `symptom_${id}`,
      model_version: 'test-model',
      created_at: now,
      updated_at: now,
      ...overrides,
    };
    this.records.set(id, record);
    return record;
  }

  async findPatientId(accountId: string) {
    return this.patients.get(accountId) ?? null;
  }

  async create(input: CreateSymptomRecordInput) {
    const now = new Date();
    const record: SymptomRecord = {
      id: randomUUID(),
      ...input,
      name: null,
      severity: null,
      summary: null,
      files: [],
      created_at: now,
      updated_at: now,
    };
    this.records.set(record.id, record);
    return { ...record };
  }

  async listByAccount(accountId: string, skip: number, take: number) {
    const all = [...this.records.values()]
      .filter((record) => record.account_id === accountId)
      .sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
    return {
      items: all.slice(skip, skip + take).map((record) => ({ ...record })),
      total: all.length,
    };
  }

  async findOwned(id: string, accountId: string) {
    const record = this.records.get(id);
    if (!record || record.account_id !== accountId) return null;
    return { ...record };
  }

  async updateOwned(id: string, accountId: string, patch: SymptomRecordPatch) {
    const record = this.records.get(id);
    if (!record || record.account_id !== accountId) return null;
    const updated: SymptomRecord = { ...record, ...patch, updated_at: new Date() };
    this.records.set(id, updated);
    return { ...updated };
  }

  async deleteOwned(id: string, accountId: string) {
    const record = this.records.get(id);
    if (!record || record.account_id !== accountId) return false;
    this.records.delete(id);
    return true;
  }
}

interface FakeAi extends SymptomAi {
  invocations: Array<{ context: SymptomAiContext; input: AgentMessageInput }>;
  cleared: string[];
}

function fakeAi(options: {
  configured?: boolean;
  history?: ConversationEntry[];
  response?: ConversationEntry[];
} = {}): FakeAi {
  const invocations: FakeAi['invocations'] = [];
  const cleared: string[] = [];
  return {
    invocations,
    cleared,
    isConfigured: () => options.configured ?? true,
    async invoke(context, input) {
      invocations.push({ context, input });
      return options.response ?? [{ type: 'AI', content: 'Assessment ready' }];
    },
    async history() {
      return options.history ?? [];
    },
    async clear(threadId) {
      cleared.push(threadId);
    },
  };
}

function mockStorage() {
  const uploads: Array<{ key: string; body: Buffer | Uint8Array; contentType: string }> = [];
  const deleted: string[] = [];
  const storage: AttachmentStorage = {
    async uploadObject(input) {
      uploads.push(input);
      return input.key;
    },
    async deleteObject(key) {
      deleted.push(key);
    },
  };
  return { storage, uploads, deleted };
}

function authAs(accountId: string): RequestHandler {
  return (req, _res, next) => {
    req.auth = { accountId, sessionId: 'test-session', roles: ['PATIENT'] };
    req.requestId = 'test-request';
    next();
  };
}

function buildApp(deps: {
  store: MemorySymptomStore;
  ai: FakeAi;
  storage: AttachmentStorage;
  accountId?: string;
}) {
  const app = express();
  app.use(express.json());
  const overrides: Partial<SymptomRouterDeps> = {
    store: deps.store,
    aiFactory: () => deps.ai,
    storage: deps.storage,
    auth: authAs(deps.accountId ?? 'acct-a'),
  };
  app.use('/v1/symptom', createSymptomRouter(overrides));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function pngBuffer() {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();
}

test('POST /v1/symptom returns 503 and creates no record when AI is unconfigured', async () => {
  const store = new MemorySymptomStore();
  store.addPatient('acct-a');
  const ai = fakeAi({ configured: false });
  const { storage } = mockStorage();
  const app = buildApp({ store, ai, storage });

  const response = await request(app)
    .post('/v1/symptom')
    .field('message', 'I have a headache');

  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'ai_unavailable');
  assert.equal(store.records.size, 0);
});

test('POST /v1/symptom stores normalized image keys and thread id', async () => {
  const store = new MemorySymptomStore();
  const patientId = store.addPatient('acct-a');
  const ai = fakeAi();
  const { storage, uploads } = mockStorage();
  const app = buildApp({ store, ai, storage });
  const png = await pngBuffer();

  const response = await request(app)
    .post('/v1/symptom')
    .field('message', 'Rash on my arm')
    .field('includeRecords', 'false')
    .field('modifyHistory', 'false')
    .attach('images', png, { filename: 'rash.png', contentType: 'image/png' });

  assert.equal(response.status, 201);
  assert.equal(response.body.messages.length, 1);
  assert.equal(response.body.symptom.include_records, false);
  assert.equal(response.body.symptom.modify_history, false);
  assert.equal(store.records.size, 1);

  const record = [...store.records.values()][0];
  assert.equal(record.account_id, 'acct-a');
  assert.equal(record.patient_id, patientId);
  assert.equal(record.thread_id, `symptom_${record.id}`);
  assert.equal(record.files.length, 1);
  assert.match(record.files[0], new RegExp(`^symptom/${record.id}/[0-9a-f-]{36}\\.webp$`));
  assert.deepEqual(response.body.symptom.files, record.files);

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].key, record.files[0]);
  assert.equal(uploads[0].contentType, 'image/webp');
  assert.equal(Buffer.from(uploads[0].body).subarray(0, 4).toString('ascii'), 'RIFF');

  assert.equal(ai.invocations.length, 1);
  assert.equal(ai.invocations[0].context.patientId, patientId);
  assert.equal(ai.invocations[0].context.includeRecords, false);
  assert.equal(ai.invocations[0].input.images?.length, 1);
  assert.equal(ai.invocations[0].input.images?.[0].mimeType, 'image/webp');
});

test('POST /v1/symptom passes PDFs through unchanged', async () => {
  const store = new MemorySymptomStore();
  store.addPatient('acct-a');
  const ai = fakeAi();
  const { storage, uploads } = mockStorage();
  const app = buildApp({ store, ai, storage });
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8');

  const response = await request(app)
    .post('/v1/symptom')
    .field('message', 'Please read this report')
    .attach('images', pdf, { filename: 'report.pdf', contentType: 'application/pdf' });

  assert.equal(response.status, 201);
  const record = [...store.records.values()][0];
  assert.match(record.files[0], new RegExp(`^symptom/${record.id}/[0-9a-f-]{36}\\.pdf$`));
  assert.equal(uploads[0].contentType, 'application/pdf');
  assert.deepEqual(Buffer.from(uploads[0].body), pdf);
});

test('list excludes other accounts and paginates', async () => {
  const store = new MemorySymptomStore();
  store.addPatient('acct-a');
  store.addPatient('acct-b');
  const base = Date.now();
  store.seed('acct-a', { name: 'One', created_at: new Date(base - 3000) });
  store.seed('acct-a', { name: 'Two', created_at: new Date(base - 2000) });
  store.seed('acct-a', { name: 'Three', created_at: new Date(base - 1000) });
  store.seed('acct-b', { name: 'Other' });
  const app = buildApp({ store, ai: fakeAi(), storage: mockStorage().storage });

  const response = await request(app).get('/v1/symptom?page=1&limit=2');

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 3);
  assert.equal(response.body.totalPages, 2);
  assert.equal(response.body.page, 1);
  assert.equal(response.body.limit, 2);
  assert.equal(response.body.symptoms.length, 2);
  assert.deepEqual(
    response.body.symptoms.map((symptom: SymptomRecord) => symptom.name),
    ['Three', 'Two'],
  );
  assert.ok(
    response.body.symptoms.every((symptom: SymptomRecord) => symptom.account_id === 'acct-a'),
  );
});

test('GET /v1/symptom/:id returns checkpoint history for the owner', async () => {
  const store = new MemorySymptomStore();
  store.addPatient('acct-a');
  const record = store.seed('acct-a');
  const history: ConversationEntry[] = [
    { type: 'Human', content: 'I have a headache' },
    { type: 'AI', content: 'How long has it lasted?' },
  ];
  const app = buildApp({ store, ai: fakeAi({ history }), storage: mockStorage().storage });

  const response = await request(app).get(`/v1/symptom/${record.id}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.symptom.id, record.id);
  assert.deepEqual(response.body.messages, history);
});

test('ownership isolation returns 404 across read, follow-up, patch and delete', async () => {
  const store = new MemorySymptomStore();
  store.addPatient('acct-a');
  store.addPatient('acct-b');
  const foreign = store.seed('acct-b');
  const ai = fakeAi();
  const { storage, deleted } = mockStorage();
  const app = buildApp({ store, ai, storage, accountId: 'acct-a' });

  const read = await request(app).get(`/v1/symptom/${foreign.id}`);
  const followUp = await request(app)
    .post(`/v1/symptom/${foreign.id}/follow-up`)
    .field('message', 'Hello');
  const patch = await request(app).patch(`/v1/symptom/${foreign.id}`).send({ name: 'Stolen' });
  const remove = await request(app).delete(`/v1/symptom/${foreign.id}`);

  assert.equal(read.status, 404);
  assert.equal(followUp.status, 404);
  assert.equal(patch.status, 404);
  assert.equal(remove.status, 404);
  assert.equal(ai.invocations.length, 0);
  assert.equal(store.records.get(foreign.id)?.name, 'Headache');
  assert.equal(deleted.length, 0);
});

test('PATCH /v1/symptom/:id updates name and severity with validation', async () => {
  const store = new MemorySymptomStore();
  store.addPatient('acct-a');
  const record = store.seed('acct-a');
  const app = buildApp({ store, ai: fakeAi(), storage: mockStorage().storage });

  const response = await request(app)
    .patch(`/v1/symptom/${record.id}`)
    .send({ name: 'Migraine', severity: 'SEVERE' });

  assert.equal(response.status, 200);
  assert.equal(response.body.symptom.name, 'Migraine');
  assert.equal(response.body.symptom.severity, 'SEVERE');
  assert.equal(store.records.get(record.id)?.name, 'Migraine');

  const invalid = await request(app)
    .patch(`/v1/symptom/${record.id}`)
    .send({ severity: 'EXTREME' });
  assert.equal(invalid.status, 400);

  const empty = await request(app).patch(`/v1/symptom/${record.id}`).send({});
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error, 'invalid_update');
});

test('follow-up appends an attachment key and returns the latest messages', async () => {
  const store = new MemorySymptomStore();
  const patientId = store.addPatient('acct-a');
  const record = store.seed('acct-a', { files: ['symptom/existing/old.webp'] });
  const reply: ConversationEntry[] = [
    { type: 'Human', content: 'It got worse' },
    { type: 'AI', content: 'Seek urgent care' },
  ];
  const ai = fakeAi({ response: reply });
  const { storage, uploads } = mockStorage();
  const app = buildApp({ store, ai, storage });
  const png = await pngBuffer();

  const response = await request(app)
    .post(`/v1/symptom/${record.id}/follow-up`)
    .field('message', 'It got worse')
    .attach('images', png, { filename: 'worse.png', contentType: 'image/png' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.messages, reply);
  assert.equal(uploads.length, 1);

  const updated = store.records.get(record.id);
  assert.equal(updated?.files.length, 2);
  assert.equal(updated?.files[0], 'symptom/existing/old.webp');
  assert.match(updated?.files[1] ?? '', /^symptom\/[0-9a-f-]+\/[0-9a-f-]+\.webp$/);

  assert.equal(ai.invocations[0].context.patientId, patientId);
  assert.equal(ai.invocations[0].context.includeRecords, true);
  assert.equal(ai.invocations[0].context.modifyHistory, true);
});

test('follow-up is 503 without AI while list, get, patch and delete keep working', async () => {
  const store = new MemorySymptomStore();
  store.addPatient('acct-a');
  const record = store.seed('acct-a', { files: ['symptom/x/one.webp'] });
  const ai = fakeAi({ configured: false });
  const { storage, deleted } = mockStorage();
  const app = buildApp({ store, ai, storage });

  const followUp = await request(app)
    .post(`/v1/symptom/${record.id}/follow-up`)
    .field('message', 'Still there');

  assert.equal(followUp.status, 503);
  assert.equal(followUp.body.error, 'ai_unavailable');

  const list = await request(app).get('/v1/symptom');
  const get = await request(app).get(`/v1/symptom/${record.id}`);
  const patch = await request(app).patch(`/v1/symptom/${record.id}`).send({ name: 'Tension' });
  const remove = await request(app).delete(`/v1/symptom/${record.id}`);

  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  assert.equal(get.status, 200);
  assert.equal(patch.status, 200);
  assert.equal(remove.status, 200);
  assert.deepEqual(deleted, ['symptom/x/one.webp']);
  assert.equal(store.records.size, 0);
});

test('DELETE /v1/symptom/:id clears checkpoints, files and the record', async () => {
  const store = new MemorySymptomStore();
  store.addPatient('acct-a');
  const record = store.seed('acct-a', {
    files: ['symptom/a/one.webp', 'symptom/a/two.pdf'],
  });
  const ai = fakeAi();
  const { storage, deleted } = mockStorage();
  const app = buildApp({ store, ai, storage });

  const response = await request(app).delete(`/v1/symptom/${record.id}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.deleted, true);
  assert.deepEqual(deleted.sort(), ['symptom/a/one.webp', 'symptom/a/two.pdf']);
  assert.deepEqual(ai.cleared, [`symptom_${record.id}`]);
  assert.equal(store.records.size, 0);
});
