import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { sha256Hex } from '@healthaccess/shared';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config, crypto } from '../src/config.js';
import { prisma } from '../src/db.js';

const app = createApp();
const runId = randomUUID().slice(0, 8);
const createdAccountIds: string[] = [];
let phoneCounter = 200_000_000;

function nextPhone() {
  phoneCounter += 1;
  return `+234${phoneCounter}`;
}

function emailFor(name: string) {
  return `auth-${runId}-${name}@example.test`;
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
  return { email, password, body: response.body };
}

async function latestOtp(accountId: string) {
  const row = await prisma.outbox.findFirst({
    where: { logical_key: { startsWith: `phone-verify:${accountId}:` } },
    orderBy: { created_at: 'desc' },
  });
  assert.ok(row, 'outbox row should exist');
  const reference = row.render_ref as { envelope?: string };
  assert.ok(reference.envelope, 'outbox envelope should exist');
  const text = crypto.decrypt<string>(reference.envelope, 'sms-text');
  const match = text.match(/\b\d{6}\b/);
  assert.ok(match, 'SMS should contain a 6 digit code');
  return match[0];
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

test('register creates account, PATIENT role, profile and bcrypt cost 12', async () => {
  const email = emailFor('register');
  const response = await request(app)
    .post('/v1/auth/register')
    .send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: email.toUpperCase(),
      password: 'correcthorse',
      password_confirmation: 'correcthorse',
      dob: '1990-05-01',
      phone: nextPhone(),
    })
    .expect(201);

  createdAccountIds.push(response.body.account.id);
  assert.equal(response.body.account.email, email);
  assert.equal(response.body.account.display_name, 'Ada Lovelace');
  assert.deepEqual(response.body.roles, ['PATIENT']);
  assert.ok(response.body.tokens.access_token);
  assert.ok(response.body.tokens.refresh_token);
  assert.equal(response.body.tokens.token_type, 'Bearer');

  const account = await prisma.account.findUnique({
    where: { email },
    include: {
      roles: true,
      patient_profile: { include: { field_values: true } },
    },
  });
  assert.ok(account);
  assert.match(account.password_hash, /^\$2[aby]\$12\$/);
  assert.deepEqual(
    account.roles.map((role) => role.role),
    ['PATIENT'],
  );
  assert.ok(account.patient_profile);
  assert.equal(account.phone_verified_at, null);
  const dob = account.patient_profile?.field_values.find(
    (value) => value.field_key === 'date_of_birth',
  );
  assert.equal(dob?.value, '1990-05-01');
});

test('register rejects mismatched password confirmation', async () => {
  const response = await request(app)
    .post('/v1/auth/register')
    .send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: emailFor('mismatch'),
      password: 'correcthorse',
      password_confirmation: 'differenthorse',
    })
    .expect(400);
  assert.equal(response.body.error, 'validation_error');
});

test('register rejects a duplicate email', async () => {
  const { email } = await register('duplicate');
  const response = await request(app)
    .post('/v1/auth/register')
    .send({
      firstName: 'Test',
      lastName: 'Duplicate',
      email: email.toUpperCase(),
      password: 'password123',
      password_confirmation: 'password123',
    })
    .expect(409);
  assert.equal(response.body.error, 'email_taken');
});

test('login issues a usable access token and rejects wrong passwords', async () => {
  const { email, password } = await register('login');

  await request(app)
    .post('/v1/auth/login')
    .send({ email, password: 'wrongpassword' })
    .expect(401);

  const login = await request(app)
    .post('/v1/auth/login')
    .send({ email: email.toUpperCase(), password })
    .expect(200);

  const me = await request(app)
    .get('/v1/me')
    .set('Authorization', `Bearer ${login.body.tokens.access_token}`)
    .expect(200);
  assert.equal(me.body.account.email, email);

  await request(app).get('/v1/me').expect(401);
});

test('refresh rotates the token and invalidates the previous one', async () => {
  const { body } = await register('refresh');
  const original = body.tokens.refresh_token;

  const refreshed = await request(app)
    .post('/v1/auth/refresh')
    .send({ refresh_token: original })
    .expect(200);
  assert.notEqual(refreshed.body.tokens.refresh_token, original);

  await request(app)
    .post('/v1/auth/refresh')
    .send({ refresh_token: original })
    .expect(401);

  await request(app)
    .post('/v1/auth/refresh')
    .send({ refresh_token: refreshed.body.tokens.refresh_token })
    .expect(200);

  await request(app)
    .post('/v1/auth/refresh')
    .send({ refresh_token: 'not-a-real-token' })
    .expect(401);
});

test('logout revokes the session and its access token', async () => {
  const { body } = await register('logout');
  const refreshed = await request(app)
    .post('/v1/auth/refresh')
    .send({ refresh_token: body.tokens.refresh_token })
    .expect(200);

  await request(app)
    .post('/v1/auth/logout')
    .send({ refresh_token: refreshed.body.tokens.refresh_token })
    .expect(204);

  await request(app)
    .post('/v1/auth/refresh')
    .send({ refresh_token: refreshed.body.tokens.refresh_token })
    .expect(401);

  await request(app)
    .get('/v1/me')
    .set('Authorization', `Bearer ${refreshed.body.tokens.access_token}`)
    .expect(401);
});

test('phone verification begins a challenge and queues an encrypted OTP', async () => {
  const { body } = await register('phone-begin');
  const phone = nextPhone();

  const begin = await request(app)
    .post('/v1/auth/phone/begin')
    .set('Authorization', `Bearer ${body.tokens.access_token}`)
    .send({ phone })
    .expect(200);
  assert.equal(begin.body.status, 'sent');
  assert.equal(begin.body.expires_in, 600);
  assert.ok(!JSON.stringify(begin.body).includes(phone));

  const challenge = await prisma.authChallenge.findFirst({
    where: { account_id: body.account.id, purpose: 'PHONE_VERIFICATION' },
    orderBy: { created_at: 'desc' },
  });
  assert.ok(challenge);
  assert.equal(challenge.attempts, 0);
  assert.equal(challenge.phone_digest, crypto.digestPhone(phone));
  const decryptedTarget = crypto.decrypt<string>(
    challenge.delivery_target_envelope!,
    'auth-challenge',
  );
  assert.equal(decryptedTarget, phone);
  assert.equal(
    Math.round((challenge.expires_at.getTime() - challenge.created_at.getTime()) / 60000),
    10,
  );

  const otp = await latestOtp(body.account.id);
  assert.equal(challenge.token_digest, sha256Hex(otp));

  const profile = await prisma.patientProfile.findUnique({
    where: { account_id: body.account.id },
  });
  assert.ok(profile);
  const link = await prisma.channelLink.findFirst({
    where: { patient_id: profile.id, phone_digest: crypto.digestPhone(phone) },
  });
  assert.equal(link, null);
});

test('phone confirmation rejects a wrong code then verifies the right one', async () => {
  const { body } = await register('phone-confirm');
  const phone = nextPhone();
  const auth = { Authorization: `Bearer ${body.tokens.access_token}` };

  await request(app)
    .post('/v1/auth/phone/begin')
    .set(auth)
    .send({ phone })
    .expect(200);
  const otp = await latestOtp(body.account.id);

  await request(app)
    .post('/v1/auth/phone/confirm')
    .set(auth)
    .send({ phone, code: otp === '000000' ? '000001' : '000000' })
    .expect(400);

  const confirm = await request(app)
    .post('/v1/auth/phone/confirm')
    .set(auth)
    .send({ phone, code: otp })
    .expect(200);
  assert.equal(confirm.body.verified, true);

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: body.account.id },
  });
  assert.equal(account.phone_digest, crypto.digestPhone(phone));
  assert.ok(account.phone_verified_at);

  const profile = await prisma.patientProfile.findUniqueOrThrow({
    where: { account_id: body.account.id },
  });
  const link = await prisma.channelLink.findFirst({
    where: { patient_id: profile.id, phone_digest: crypto.digestPhone(phone) },
  });
  assert.ok(link);
  assert.ok(link.verified_at);
  assert.equal(
    crypto.decrypt<string>(link.phone_envelope, 'sms-recipient'),
    phone,
  );

  const challenge = await prisma.authChallenge.findFirst({
    where: { account_id: body.account.id, purpose: 'PHONE_VERIFICATION' },
    orderBy: { created_at: 'desc' },
  });
  assert.ok(challenge?.consumed_at);
});

test('phone confirmation accepts at most five wrong attempts', async () => {
  const { body } = await register('phone-attempts');
  const phone = nextPhone();
  const auth = { Authorization: `Bearer ${body.tokens.access_token}` };

  await request(app)
    .post('/v1/auth/phone/begin')
    .set(auth)
    .send({ phone })
    .expect(200);
  const otp = await latestOtp(body.account.id);
  const wrong = otp === '000000' ? '000001' : '000000';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app)
      .post('/v1/auth/phone/confirm')
      .set(auth)
      .send({ phone, code: wrong })
      .expect(400);
  }

  const challenge = await prisma.authChallenge.findFirst({
    where: { account_id: body.account.id, purpose: 'PHONE_VERIFICATION' },
    orderBy: { created_at: 'desc' },
  });
  assert.equal(challenge?.attempts, 5);

  await request(app)
    .post('/v1/auth/phone/confirm')
    .set(auth)
    .send({ phone, code: otp })
    .expect(400);

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: body.account.id },
  });
  assert.equal(account.phone_verified_at, null);
});

test('phone verification requires authentication', async () => {
  await request(app)
    .post('/v1/auth/phone/begin')
    .send({ phone: nextPhone() })
    .expect(401);
});

test('google sign-in reports unavailability when unconfigured', async () => {
  if (config.googleClientId && config.googleClientSecret) {
    const response = await request(app).get('/v1/auth/google');
    assert.equal(response.status, 302);
    assert.match(response.headers.location, /accounts\.google\.com/);
    return;
  }
  const response = await request(app).get('/v1/auth/google').expect(503);
  assert.equal(response.body.error, 'google_unavailable');
});
