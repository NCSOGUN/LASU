import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';

const app = createApp();
const accountIds: string[] = [];

interface TestPatient {
  accountId: string;
  patientId: string;
  token: string;
}

function accessToken(accountId: string, sessionId: string) {
  return jwt.sign(
    { sub: accountId, sid: sessionId, typ: 'access', roles: ['PATIENT'] },
    config.jwtSecret,
    { expiresIn: '15m' },
  );
}

async function createAccountWithSession() {
  const account = await prisma.account.create({
    data: {
      email: `meds-test-${randomUUID()}@example.test`,
      password_hash: 'not-a-real-hash',
      display_name: 'Medication Test Patient',
      status: 'ACTIVE',
      roles: { create: { role: 'PATIENT' } },
    },
  });
  accountIds.push(account.id);

  const session = await prisma.authSession.create({
    data: {
      account_id: account.id,
      refresh_token_hash: createHash('sha256').update(randomUUID()).digest('hex'),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return { account, token: accessToken(account.id, session.id) };
}

async function createPatient(): Promise<TestPatient> {
  const { account, token } = await createAccountWithSession();
  const profile = await prisma.patientProfile.create({ data: { account_id: account.id } });
  return { accountId: account.id, patientId: profile.id, token };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const structuredPayload = (overrides: Record<string, unknown> = {}) => ({
  title: 'Blood pressure plan',
  description: 'Daily medication plan',
  summary: 'Take medication twice daily',
  startDate: '2026-11-17',
  endDate: '2026-11-19',
  medications: [
    {
      drug: 'Paracetamol',
      dose: '500mg',
      frequency: 'Twice daily',
      times: [
        { hour: 8, minute: 0 },
        { hour: 20, minute: 0 },
      ],
    },
  ],
  ...overrides,
});

test('medications module', async (t) => {
  t.after(async () => {
    if (accountIds.length > 0) {
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    await prisma.$disconnect();
  });

  await t.test('creates a structured schedule with moments', async () => {
    const patient = await createPatient();

    const response = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send(structuredPayload());

    assert.equal(response.status, 201);
    assert.equal(response.body.schedule.patient_id, patient.patientId);
    assert.equal(response.body.schedule.title, 'Blood pressure plan');
    assert.equal(response.body.schedule.summary, 'Take medication twice daily');

    const detail = await request(app)
      .get(`/v1/medications/${response.body.schedule.id}`)
      .set(auth(patient.token));

    assert.equal(detail.status, 200);
    assert.equal(detail.body.schedule.moments.length, 6);
    assert.ok(detail.body.schedule.moments.every((moment: { status: string }) => moment.status === 'PENDING'));

    const times = detail.body.schedule.moments.map((moment: { time: string }) =>
      new Date(moment.time).getTime(),
    );
    assert.deepEqual(times, [...times].sort((left, right) => left - right));
  });

  await t.test('accepts structured medications serialized as a JSON string', async () => {
    const patient = await createPatient();
    const payload = structuredPayload();

    const response = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send({ ...payload, medications: JSON.stringify(payload.medications) });

    assert.equal(response.status, 201);

    const detail = await request(app)
      .get(`/v1/medications/${response.body.schedule.id}`)
      .set(auth(patient.token));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.schedule.moments.length, 6);
  });

  await t.test('rejects malformed structured medication entries', async () => {
    const patient = await createPatient();

    const response = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send(structuredPayload({ medications: [{ drug: 'Paracetamol', times: [] }] }));

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'invalid_schedule');
  });

  await t.test('accepts multipart form fields with structured medications', async () => {
    const patient = await createPatient();
    const payload = structuredPayload();

    const response = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .field('title', 'Multipart plan')
      .field('startDate', '2026-11-17')
      .field('endDate', '2026-11-19')
      .field('medications', JSON.stringify(payload.medications))
      .attach('document', Buffer.from('ignored document'), {
        filename: 'prescription.png',
        contentType: 'image/png',
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.schedule.title, 'Multipart plan');

    const detail = await request(app)
      .get(`/v1/medications/${response.body.schedule.id}`)
      .set(auth(patient.token));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.schedule.moments.length, 6);
  });

  await t.test('rejects schedules without medications or a document', async () => {
    const patient = await createPatient();

    const response = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send({ startDate: '2026-11-17', endDate: '2026-11-19' });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'invalid_schedule');
  });

  await t.test('rejects invalid and inverted date ranges', async () => {
    const patient = await createPatient();

    const inverted = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send(structuredPayload({ startDate: '2026-11-19', endDate: '2026-11-17' }));
    assert.equal(inverted.status, 400);

    const invalid = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send(structuredPayload({ startDate: 'not-a-date' }));
    assert.equal(invalid.status, 400);
  });

  await t.test('paginates only the authenticated patient schedules', async () => {
    const patient = await createPatient();
    const stranger = await createPatient();

    for (let index = 0; index < 3; index += 1) {
      const created = await request(app)
        .post('/v1/medications')
        .set(auth(patient.token))
        .send(structuredPayload({ title: `Plan ${index}` }));
      assert.equal(created.status, 201);
    }

    const strangerCreated = await request(app)
      .post('/v1/medications')
      .set(auth(stranger.token))
      .send(structuredPayload({ title: 'Stranger plan' }));
    assert.equal(strangerCreated.status, 201);

    const firstPage = await request(app)
      .get('/v1/medications?page=1&limit=2')
      .set(auth(patient.token));

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.total, 3);
    assert.equal(firstPage.body.totalPages, 2);
    assert.equal(firstPage.body.schedules.length, 2);
    assert.ok(
      firstPage.body.schedules.every(
        (schedule: { patient_id: string }) => schedule.patient_id === patient.patientId,
      ),
    );
    assert.ok(
      !firstPage.body.schedules.some(
        (schedule: { id: string }) => schedule.id === strangerCreated.body.schedule.id,
      ),
    );

    const secondPage = await request(app)
      .get('/v1/medications?page=2&limit=2')
      .set(auth(patient.token));
    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.schedules.length, 1);
  });

  await t.test('enforces ownership on read and delete', async () => {
    const owner = await createPatient();
    const stranger = await createPatient();

    const created = await request(app)
      .post('/v1/medications')
      .set(auth(owner.token))
      .send(structuredPayload());
    assert.equal(created.status, 201);
    const scheduleId = created.body.schedule.id;

    const foreignRead = await request(app)
      .get(`/v1/medications/${scheduleId}`)
      .set(auth(stranger.token));
    assert.equal(foreignRead.status, 404);

    const foreignDelete = await request(app)
      .delete(`/v1/medications/${scheduleId}`)
      .set(auth(stranger.token));
    assert.equal(foreignDelete.status, 404);

    const ownDelete = await request(app)
      .delete(`/v1/medications/${scheduleId}`)
      .set(auth(owner.token));
    assert.equal(ownDelete.status, 200);

    const afterDelete = await request(app)
      .get(`/v1/medications/${scheduleId}`)
      .set(auth(owner.token));
    assert.equal(afterDelete.status, 404);

    const malformed = await request(app)
      .get('/v1/medications/not-a-uuid')
      .set(auth(owner.token));
    assert.equal(malformed.status, 404);
  });

  await t.test('adds and removes medications with moment updates', async () => {
    const patient = await createPatient();

    const created = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send(
        structuredPayload({
          startDate: '2026-11-17',
          endDate: '2026-11-19',
          medications: [
            {
              drug: 'Paracetamol',
              dose: '500mg',
              frequency: 'Once daily',
              times: [{ hour: 9, minute: 0 }],
            },
          ],
        }),
      );
    assert.equal(created.status, 201);
    const scheduleId = created.body.schedule.id;

    const added = await request(app)
      .patch(`/v1/medications/${scheduleId}/add`)
      .set(auth(patient.token))
      .send({
        startDate: '2026-11-20',
        endDate: '2026-11-21',
        medications: [
          {
            drug: 'Amoxicillin',
            dose: '250mg',
            frequency: 'Twice daily',
            times: [
              { hour: 8, minute: 0 },
              { hour: 20, minute: 0 },
            ],
          },
        ],
      });
    assert.equal(added.status, 201);

    const afterAdd = await request(app)
      .get(`/v1/medications/${scheduleId}`)
      .set(auth(patient.token));
    assert.equal(afterAdd.body.schedule.moments.length, 7);
    assert.equal(afterAdd.body.schedule.medications.length, 2);

    const removed = await request(app)
      .patch(`/v1/medications/${scheduleId}/remove`)
      .set(auth(patient.token))
      .send({ drug: 'paracetamol' });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.schedule.medications.length, 1);
    assert.equal(removed.body.schedule.medications[0].drug, 'Amoxicillin');

    const afterRemove = await request(app)
      .get(`/v1/medications/${scheduleId}`)
      .set(auth(patient.token));
    assert.equal(afterRemove.body.schedule.moments.length, 4);
    assert.ok(
      afterRemove.body.schedule.moments.every(
        (moment: { drug: string }) => moment.drug === 'Amoxicillin',
      ),
    );

    const stranger = await createPatient();
    const foreignAdd = await request(app)
      .patch(`/v1/medications/${scheduleId}/add`)
      .set(auth(stranger.token))
      .send({
        startDate: '2026-11-22',
        endDate: '2026-11-22',
        medications: [
          {
            drug: 'Ibuprofen',
            dose: '200mg',
            frequency: 'Once daily',
            times: [{ hour: 12, minute: 0 }],
          },
        ],
      });
    assert.equal(foreignAdd.status, 404);
  });

  await t.test('updates moment status and recomputes progress', async () => {
    const patient = await createPatient();
    const stranger = await createPatient();

    const created = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send(
        structuredPayload({
          startDate: '2026-11-17',
          endDate: '2026-11-18',
          medications: [
            {
              drug: 'Metformin',
              dose: '500mg',
              frequency: 'Once daily',
              times: [{ hour: 8, minute: 0 }],
            },
          ],
        }),
      );
    assert.equal(created.status, 201);

    const detail = await request(app)
      .get(`/v1/medications/${created.body.schedule.id}`)
      .set(auth(patient.token));
    const [first, second] = detail.body.schedule.moments as Array<{ id: string }>;

    const taken = await request(app)
      .patch(`/v1/medications/moments/${first!.id}`)
      .set(auth(patient.token))
      .send({ status: 'TAKEN' });
    assert.equal(taken.status, 200);
    assert.equal(Number(taken.body.progress), 100);

    const missed = await request(app)
      .patch(`/v1/medications/moments/${second!.id}`)
      .set(auth(patient.token))
      .send({ status: 'MISSED' });
    assert.equal(missed.status, 200);
    assert.equal(Number(missed.body.progress), 50);

    const reset = await request(app)
      .patch(`/v1/medications/moments/${first!.id}`)
      .set(auth(patient.token))
      .send({ status: 'PENDING' });
    assert.equal(reset.status, 200);
    assert.equal(Number(reset.body.progress), 0);

    const invalidStatus = await request(app)
      .patch(`/v1/medications/moments/${first!.id}`)
      .set(auth(patient.token))
      .send({ status: 'DONE' });
    assert.equal(invalidStatus.status, 400);

    const foreignStatus = await request(app)
      .patch(`/v1/medications/moments/${second!.id}`)
      .set(auth(stranger.token))
      .send({ status: 'TAKEN' });
    assert.equal(foreignStatus.status, 404);
  });

  await t.test('registers and upserts notification devices for the authenticated account', async () => {
    const patient = await createPatient();
    const token = `device-${randomUUID()}`;

    const created = await request(app)
      .post('/v1/devices')
      .set(auth(patient.token))
      .send({ token, platform: 'ANDROID' });
    assert.equal(created.status, 201);

    const stored = await prisma.notificationToken.findUnique({ where: { token } });
    assert.equal(stored?.account_id, patient.accountId);
    assert.equal(stored?.platform, 'ANDROID');

    const updated = await request(app)
      .post('/v1/devices')
      .set(auth(patient.token))
      .send({ token, platform: 'WEB' });
    assert.equal(updated.status, 201);
    assert.equal(updated.body.device.id, created.body.device.id);

    const afterUpdate = await prisma.notificationToken.findUnique({ where: { token } });
    assert.equal(afterUpdate?.platform, 'WEB');

    const invalid = await request(app)
      .post('/v1/devices')
      .set(auth(patient.token))
      .send({ token, platform: 'DESKTOP' });
    assert.equal(invalid.status, 400);

    const anonymous = await request(app).post('/v1/devices').send({ token, platform: 'WEB' });
    assert.equal(anonymous.status, 401);
  });

  await t.test('stores date-only schedule dates at UTC midnight without shifting the day', async () => {
    const patient = await createPatient();
    const created = await request(app)
      .post('/v1/medications')
      .set(auth(patient.token))
      .send(structuredPayload());
    assert.equal(created.status, 201);
    assert.equal(created.body.schedule.start_date, '2026-11-17T00:00:00.000Z');
    assert.equal(created.body.schedule.end_date, '2026-11-19T00:00:00.000Z');

    const stored = await prisma.medicationSchedule.findUnique({
      where: { id: created.body.schedule.id },
    });
    assert.equal(stored?.start_date?.toISOString(), '2026-11-17T00:00:00.000Z');
    assert.equal(stored?.end_date?.toISOString(), '2026-11-19T00:00:00.000Z');
  });

  await t.test('requires a patient profile and authentication', async () => {
    const { token } = await createAccountWithSession();

    const withoutProfile = await request(app)
      .post('/v1/medications')
      .set(auth(token))
      .send(structuredPayload());
    assert.equal(withoutProfile.status, 403);
    assert.equal(withoutProfile.body.error, 'patient_profile_required');

    const anonymous = await request(app).get('/v1/medications');
    assert.equal(anonymous.status, 401);
  });
});
