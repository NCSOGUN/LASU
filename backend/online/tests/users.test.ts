import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';

const app = createApp();
const runId = randomUUID().slice(0, 8);
const createdAccountIds: string[] = [];

function emailFor(name: string) {
  return `users-${runId}-${name}@example.test`;
}

async function register(name: string, password = 'password123') {
  const email = emailFor(name);
  const response = await request(app)
    .post('/v1/auth/register')
    .send({
      firstName: 'Test',
      lastName: name,
      email,
      password,
      password_confirmation: password,
    })
    .expect(201);
  createdAccountIds.push(response.body.account.id);
  return {
    id: response.body.account.id,
    email,
    password,
    token: response.body.tokens.access_token as string,
  };
}

function authorized(token: string) {
  return { Authorization: `Bearer ${token}` };
}

after(async () => {
  if (createdAccountIds.length > 0) {
    await prisma.outbox.deleteMany({
      where: {
        OR: createdAccountIds.map((id) => ({
          logical_key: { startsWith: `phone-verify:${id}:` },
        })),
      },
    });
    await prisma.auditEvent.deleteMany({
      where: { actor_account_id: { in: createdAccountIds } },
    });
    await prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } });
  }
  await prisma.$disconnect();
});

test('GET /me returns the account, profile and empty medical collections', async () => {
  const { token, email } = await register('shape');

  const response = await request(app)
    .get('/v1/me')
    .set(authorized(token))
    .expect(200);

  assert.equal(response.body.account.email, email);
  assert.equal(response.body.account.password_hash, undefined);
  assert.equal(response.body.account.phone_digest, undefined);
  assert.deepEqual(response.body.roles, ['PATIENT']);
  assert.ok(response.body.profile.id);
  assert.deepEqual(response.body.fields, []);
  assert.deepEqual(response.body.field_values, {});
  assert.deepEqual(response.body.allergies, []);
  assert.deepEqual(response.body.medical_events, []);
  assert.equal(response.body.avatar_url, null);
});

test('PATCH /me updates names, email, password and date of birth', async () => {
  const { token, email, password, id } = await register('patch');
  const newEmail = emailFor('patch-updated');

  const patched = await request(app)
    .patch('/v1/me')
    .set(authorized(token))
    .send({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: newEmail,
      password: 'newpassword123',
      dob: '1985-12-09',
    })
    .expect(200);

  assert.equal(patched.body.account.display_name, 'Grace Hopper');
  assert.equal(patched.body.account.email, newEmail);
  assert.equal(patched.body.field_values.full_name, 'Grace Hopper');
  assert.equal(patched.body.field_values.date_of_birth, '1985-12-09');

  const account = await prisma.account.findUniqueOrThrow({ where: { id } });
  assert.match(account.password_hash, /^\$2[aby]\$12\$/);

  await request(app)
    .post('/v1/auth/login')
    .send({ email: newEmail, password })
    .expect(401);

  await request(app)
    .post('/v1/auth/login')
    .send({ email: newEmail, password: 'newpassword123' })
    .expect(200);
});

test('PATCH /me rejects an email owned by another account', async () => {
  const first = await register('email-first');
  const second = await register('email-second');

  const response = await request(app)
    .patch('/v1/me')
    .set(authorized(second.token))
    .send({ email: first.email })
    .expect(409);
  assert.equal(response.body.error, 'email_taken');
});

test('PUT /me/medical maps fields, replaces collections and writes an audit event', async () => {
  const { token, id } = await register('medical');

  const updated = await request(app)
    .put('/v1/me/medical')
    .set(authorized(token))
    .send({
      height: '180',
      weight: 75,
      gender: 'female',
      bloodType: 'O+',
      genoType: 'AA',
      bloodPressure: '120/80',
      existingMedicalConditions: ['Asthma', 'Migraine'],
      existingMedications: ['Ventolin'],
      emergencyContactName: 'Grace Hopper',
      emergencyContactPhone: '+2348011111111',
      allergies: [
        { name: 'Penicillin', severity: 'severe', diagnosisDate: '2020-01-01' },
      ],
      medicalEvents: [
        {
          name: 'Appendectomy',
          recoveryTime: '6 weeks',
          occurredOn: '2019-03-04',
          description: 'Appendix removed',
        },
      ],
    })
    .expect(200);

  const values = updated.body.field_values as Record<string, unknown>;
  assert.equal(values.height, '180');
  assert.equal(values.weight, '75');
  assert.equal(values.gender, 'female');
  assert.equal(values.blood_group, 'O+');
  assert.equal(values.genotype, 'AA');
  assert.equal(values.blood_pressure, '120/80');
  assert.deepEqual(values.conditions, ['Asthma', 'Migraine']);
  assert.deepEqual(values.current_medications, ['Ventolin']);
  assert.equal(values.emergency_contact_name, 'Grace Hopper');
  assert.equal(values.emergency_contact_phone, '+2348011111111');
  assert.equal(updated.body.allergies.length, 1);
  assert.equal(updated.body.allergies[0].name, 'Penicillin');
  assert.equal(updated.body.allergies[0].severity, 'SEVERE');
  assert.equal(updated.body.medical_events.length, 1);
  assert.equal(updated.body.medical_events[0].name, 'Appendectomy');

  const audit = await prisma.auditEvent.findFirst({
    where: { actor_account_id: id, action: 'profile.medical.update' },
    orderBy: { id: 'desc' },
  });
  assert.ok(audit);
  assert.equal(audit.channel, 'WEB');
  assert.equal(audit.outcome, 'ALLOWED');
  assert.ok(audit.field_keys.includes('height'));
  assert.ok(audit.field_keys.includes('conditions'));
  assert.equal(audit.request_id.length > 0, true);
});

test('PUT /me/medical replaces provided collections and never writes nulls', async () => {
  const { token } = await register('replace');

  await request(app)
    .put('/v1/me/medical')
    .set(authorized(token))
    .send({
      height: '170',
      allergies: [{ name: 'Peanuts' }, { name: 'Dust' }],
      medicalEvents: [{ name: 'Fracture' }],
    })
    .expect(200);

  const replaced = await request(app)
    .put('/v1/me/medical')
    .set(authorized(token))
    .send({
      height: null,
      weight: null,
      allergies: [{ name: 'Shellfish' }],
      medicalEvents: [],
    })
    .expect(200);

  assert.equal(replaced.body.field_values.height, '170');
  assert.equal(replaced.body.field_values.weight, undefined);
  assert.equal(replaced.body.allergies.length, 1);
  assert.equal(replaced.body.allergies[0].name, 'Shellfish');
  assert.deepEqual(replaced.body.medical_events, []);
});

test('location fields are stored only when their definitions exist', async () => {
  const { token } = await register('location');
  const definition = await prisma.fieldDefinition.findUnique({
    where: { field_key: 'city' },
  });

  const updated = await request(app)
    .put('/v1/me/medical')
    .set(authorized(token))
    .send({ city: 'Ikeja', state: 'Lagos', country: 'NG' })
    .expect(200);

  if (definition) {
    assert.equal(updated.body.field_values.city, 'Ikeja');
    assert.equal(updated.body.field_values.state, 'Lagos');
    assert.equal(updated.body.field_values.country, 'NG');
  } else {
    assert.equal(updated.body.field_values.city, undefined);
    assert.equal(updated.body.field_values.state, undefined);
    assert.equal(updated.body.field_values.country, undefined);
  }
});

test('medical deletions are scoped to the account and missing rows return 404', async () => {
  const owner = await register('delete-owner');
  const other = await register('delete-other');

  const created = await request(app)
    .put('/v1/me/medical')
    .set(authorized(owner.token))
    .send({
      allergies: [{ name: 'Penicillin' }],
      medicalEvents: [{ name: 'Appendectomy' }],
    })
    .expect(200);

  const allergyId = created.body.allergies[0].id as string;
  const eventId = created.body.medical_events[0].id as string;

  await request(app)
    .delete(`/v1/me/allergies/${allergyId}`)
    .set(authorized(other.token))
    .expect(404);
  await request(app)
    .delete(`/v1/me/medical-events/${eventId}`)
    .set(authorized(other.token))
    .expect(404);

  await request(app)
    .delete(`/v1/me/allergies/${allergyId}`)
    .set(authorized(owner.token))
    .expect(204);
  await request(app)
    .delete(`/v1/me/medical-events/${eventId}`)
    .set(authorized(owner.token))
    .expect(204);
  await request(app)
    .delete(`/v1/me/allergies/${allergyId}`)
    .set(authorized(owner.token))
    .expect(404);

  const me = await request(app).get('/v1/me').set(authorized(owner.token)).expect(200);
  assert.deepEqual(me.body.allergies, []);
  assert.deepEqual(me.body.medical_events, []);
});

test('PATCH /me/medical-events/:id updates the owned event only', async () => {
  const owner = await register('event-owner');
  const other = await register('event-other');

  const created = await request(app)
    .put('/v1/me/medical')
    .set(authorized(owner.token))
    .send({ medicalEvents: [{ name: 'Fracture', occurredOn: '2018-01-01' }] })
    .expect(200);
  const eventId = created.body.medical_events[0].id as string;

  const patched = await request(app)
    .patch(`/v1/me/medical-events/${eventId}`)
    .set(authorized(owner.token))
    .send({ description: 'Healed', date: '2020-02-02' })
    .expect(200);
  assert.equal(patched.body.event.description, 'Healed');
  assert.match(patched.body.event.occurred_on, /^2020-02-02/);

  await request(app)
    .patch(`/v1/me/medical-events/${eventId}`)
    .set(authorized(other.token))
    .send({ description: 'Not allowed' })
    .expect(404);
});

test('avatar upload returns 503 when storage is unconfigured', async () => {
  const { token } = await register('avatar');
  if (
    config.s3.region &&
    config.s3.accessKeyId &&
    config.s3.secretAccessKey &&
    config.s3.bucket
  ) {
    await request(app)
      .post('/v1/me/avatar')
      .set(authorized(token))
      .expect(400);
    return;
  }

  const response = await request(app)
    .post('/v1/me/avatar')
    .set(authorized(token))
    .expect(503);
  assert.equal(response.body.error, 'storage_unavailable');
});

test('profile endpoints require authentication', async () => {
  await request(app).get('/v1/me').expect(401);
  await request(app).patch('/v1/me').send({ firstName: 'No' }).expect(401);
  await request(app).put('/v1/me/medical').send({ height: '170' }).expect(401);
});
