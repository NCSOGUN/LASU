import assert from 'node:assert/strict';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { AccountRoleType, Account } from '@prisma/client';
import { createApp } from '../src/app.js';
import { config, crypto as cryptoService } from '../src/config.js';
import { prisma } from '../src/db.js';
import { accountAttemptDigest } from '../src/modules/portal/service.js';

const suffix = randomUUID().slice(0, 8);
const app = createApp();

const accountIds: string[] = [];
const patientIds: string[] = [];

let tokenA = '';
let tokenB = '';
let tokenPractitioner = '';
let tokenPendingPractitioner = '';
let patientBAccountId = '';

let versionA = 1;
let patientCodeA = '';
let grantIdA = '';
let grantCodeA = '';
let scopedGrantCode = '';
let scopedGrantId = '';

function uniqueEmail(name: string) {
  return `${name}-${suffix}@portal.test`;
}

async function createAccount(input: {
  name: string;
  roles: AccountRoleType[];
  patient: boolean;
  practitionerStatus?: 'PENDING' | 'APPROVED';
}): Promise<Account> {
  const account = await prisma.account.create({
    data: {
      email: uniqueEmail(input.name),
      password_hash: 'test-password-hash',
      display_name: input.name,
      roles: { create: input.roles.map((role) => ({ role })) },
      ...(input.patient ? { patient_profile: { create: {} } } : {}),
      ...(input.practitionerStatus
        ? {
            practitioner_profile: {
              create: { verification_status: input.practitionerStatus },
            },
          }
        : {}),
    },
    include: { patient_profile: true },
  });
  accountIds.push(account.id);
  if (account.patient_profile) patientIds.push(account.patient_profile.id);
  return account;
}

async function issueToken(accountId: string, roles: AccountRoleType[]) {
  const session = await prisma.authSession.create({
    data: {
      account_id: accountId,
      refresh_token_hash: createHash('sha256')
        .update(`${accountId}:${randomUUID()}`)
        .digest('hex'),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return jwt.sign(
    { sub: accountId, sid: session.id, typ: 'access', roles },
    config.jwtSecret,
    { expiresIn: 600 },
  );
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function numericCode(digits: number) {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');
}

before(async () => {
  const definitions = await prisma.fieldDefinition.findMany({
    where: { field_key: { in: ['full_name', 'allergies', 'blood_group', 'weight'] } },
  });
  assert.equal(definitions.length, 4, 'seeded field definitions are required');

  const accountA = await createAccount({ name: 'patient-a', roles: ['PATIENT'], patient: true });
  const accountB = await createAccount({ name: 'patient-b', roles: ['PATIENT'], patient: true });
  const practitioner = await createAccount({
    name: 'practitioner',
    roles: ['PRACTITIONER'],
    patient: false,
    practitionerStatus: 'APPROVED',
  });
  const pending = await createAccount({
    name: 'pending-practitioner',
    roles: ['PRACTITIONER'],
    patient: false,
    practitionerStatus: 'PENDING',
  });

  patientBAccountId = accountB.id;
  tokenA = await issueToken(accountA.id, ['PATIENT']);
  tokenB = await issueToken(accountB.id, ['PATIENT']);
  tokenPractitioner = await issueToken(practitioner.id, ['PRACTITIONER']);
  tokenPendingPractitioner = await issueToken(pending.id, ['PRACTITIONER']);
});

after(async () => {
  await prisma.auditEvent.deleteMany({
    where: {
      OR: [{ actor_account_id: { in: accountIds } }, { patient_id: { in: patientIds } }],
    },
  });
  await prisma.accessAttempt.deleteMany({
    where: { target_digest: { in: accountIds.map(accountAttemptDigest) } },
  });
  await prisma.accessGrant.deleteMany({
    where: {
      OR: [{ created_by_account_id: { in: accountIds } }, { patient_id: { in: patientIds } }],
    },
  });
  await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.$disconnect();
});

describe('portal fields', () => {
  it('requires authentication', async () => {
    await request(app).get('/v1/me/fields').expect(401);
  });

  it('isolates profile fields per patient and guards the version', async () => {
    const initialB = await request(app).get('/v1/me/fields').set(auth(tokenB)).expect(200);
    assert.equal(initialB.body.version, 1);
    const initialBName = initialB.body.fields.find(
      (field: { key: string }) => field.key === 'full_name',
    );
    assert.equal(initialBName.value, null);

    const updated = await request(app)
      .put('/v1/me/fields')
      .set(auth(tokenA))
      .send({
        fields: { full_name: 'Ada Obi', allergies: ['penicillin'], blood_group: 'O+' },
        expected_version: 1,
      })
      .expect(200);
    assert.equal(updated.body.version, 2);
    assert.equal(
      updated.body.fields.find((field: { key: string }) => field.key === 'full_name').value,
      'Ada Obi',
    );
    versionA = updated.body.version;

    const conflicted = await request(app)
      .put('/v1/me/fields')
      .set(auth(tokenA))
      .send({ fields: { full_name: 'Stale' }, expected_version: 1 })
      .expect(409);
    assert.equal(conflicted.body.error, 'version_conflict');

    await request(app)
      .put('/v1/me/fields')
      .set(auth(tokenA))
      .send({ fields: { not_a_field: 'x' }, expected_version: versionA })
      .expect(400);

    const afterB = await request(app).get('/v1/me/fields').set(auth(tokenB)).expect(200);
    assert.equal(afterB.body.version, 1);
    assert.equal(
      afterB.body.fields.find((field: { key: string }) => field.key === 'full_name').value,
      null,
    );
  });

  it('stores emergency selections in order and enforces eligibility', async () => {
    const stored = await request(app)
      .put('/v1/me/emergency-fields')
      .set(auth(tokenA))
      .send({ field_keys: ['blood_group', 'full_name'], expected_version: versionA })
      .expect(200);
    assert.deepEqual(stored.body.field_keys, ['blood_group', 'full_name']);
    versionA = stored.body.version;

    const summary = await request(app)
      .get('/v1/me/emergency-summary')
      .set(auth(tokenA))
      .expect(200);
    assert.equal(summary.body.available, true);
    assert.deepEqual(summary.body.field_keys, ['blood_group', 'full_name']);
    assert.equal(summary.body.fields[0].value, 'O+');
    assert.equal(summary.body.fields[1].value, 'Ada Obi');

    await request(app)
      .put('/v1/me/emergency-fields')
      .set(auth(tokenA))
      .send({ field_keys: ['full_name', 'full_name'], expected_version: versionA })
      .expect(400);

    await request(app)
      .put('/v1/me/emergency-fields')
      .set(auth(tokenA))
      .send({ field_keys: ['weight'], expected_version: versionA })
      .expect(400);

    await request(app)
      .put('/v1/me/emergency-fields')
      .set(auth(tokenA))
      .send({ field_keys: ['full_name'], expected_version: versionA - 1 })
      .expect(409);
  });
});

describe('patient codes', () => {
  it('creates, encrypts and rotates the patient code', async () => {
    const first = await request(app).get('/v1/me/patient-code').set(auth(tokenA)).expect(200);
    assert.match(first.body.code, /^\d{12}$/);
    assert.equal(first.body.code_version, 1);
    patientCodeA = first.body.code;

    const stored = await prisma.patientCode.findUniqueOrThrow({
      where: { patient_id: patientIds[0] },
    });
    assert.equal(stored.code_digest, cryptoService.digestCode(patientCodeA, 'patient'));
    assert.notEqual(stored.code_ciphertext, patientCodeA);
    assert.equal(stored.code_ciphertext.includes(patientCodeA), false);
    assert.equal(
      cryptoService.decrypt<string>(stored.code_ciphertext, 'patient-code'),
      patientCodeA,
    );

    const rotated = await request(app)
      .post('/v1/me/patient-code/rotate')
      .set(auth(tokenA))
      .expect(200);
    assert.match(rotated.body.code, /^\d{12}$/);
    assert.equal(rotated.body.code_version, 2);
    assert.notEqual(rotated.body.code, patientCodeA);
    assert.ok(new Date(rotated.body.rotated_at) >= stored.rotated_at);

    patientCodeA = rotated.body.code;
    const refreshed = await request(app)
      .get('/v1/me/patient-code')
      .set(auth(tokenA))
      .expect(200);
    assert.equal(refreshed.body.code, patientCodeA);
    assert.equal(refreshed.body.code_version, 2);
  });
});

describe('grants', () => {
  it('creates a grant once, exposes the code once and hides digests', async () => {
    const created = await request(app)
      .post('/v1/me/grants')
      .set(auth(tokenA))
      .send({ field_keys: ['full_name', 'allergies'], expires_in_minutes: 60 })
      .expect(201);
    assert.match(created.body.code, /^\d{8}$/);
    assert.deepEqual(created.body.channels, ['WEB_PRACTITIONER']);
    assert.deepEqual(created.body.field_keys, ['full_name', 'allergies']);
    grantIdA = created.body.grant_id;
    grantCodeA = created.body.code;

    const stored = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grantIdA } });
    assert.equal(stored.code_digest, cryptoService.digestCode(grantCodeA, 'grant'));

    const listed = await request(app).get('/v1/me/grants').set(auth(tokenA)).expect(200);
    const listedGrant = listed.body.find((grant: { id: string }) => grant.id === grantIdA);
    assert.equal(listedGrant.status, 'active');
    assert.equal(listedGrant.code, undefined);
    assert.equal(listedGrant.code_digest, undefined);
    assert.deepEqual(listedGrant.field_keys, ['allergies', 'full_name']);

    await request(app)
      .post('/v1/me/grants')
      .set(auth(tokenA))
      .send({ field_keys: ['nope'] })
      .expect(400);
    await request(app)
      .post('/v1/me/grants')
      .set(auth(tokenA))
      .send({ field_keys: ['full_name'], expires_in_minutes: 24 * 60 + 1 })
      .expect(400);

    const otherPatientGrants = await request(app)
      .get('/v1/me/grants')
      .set(auth(tokenB))
      .expect(200);
    assert.equal(otherPatientGrants.body.length, 0);
  });

  it('scopes revocation to the owning patient', async () => {
    await request(app).delete(`/v1/me/grants/${grantIdA}`).set(auth(tokenB)).expect(404);
    const stillLive = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grantIdA } });
    assert.equal(stillLive.revoked_at, null);

    await request(app).delete(`/v1/me/grants/${grantIdA}`).set(auth(tokenA)).expect(200);
    const revoked = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grantIdA } });
    assert.ok(revoked.revoked_at);

    const listed = await request(app).get('/v1/me/grants').set(auth(tokenA)).expect(200);
    assert.equal(listed.body.find((grant: { id: string }) => grant.id === grantIdA).status, 'revoked');
  });
});

describe('granted record reads', () => {
  it('opens a practitioner session limited to the granted fields', async () => {
    const created = await request(app)
      .post('/v1/me/grants')
      .set(auth(tokenA))
      .send({ field_keys: ['allergies'], expires_in_minutes: 60 })
      .expect(201);
    scopedGrantId = created.body.grant_id;
    scopedGrantCode = created.body.code;

    const nonPractitioner = await request(app)
      .post('/v1/records/grant/open')
      .set(auth(tokenA))
      .send({ patient_code: patientCodeA, grant_code: scopedGrantCode })
      .expect(403);
    assert.equal(nonPractitioner.body.error, 'forbidden');

    await request(app)
      .post('/v1/records/grant/open')
      .set(auth(tokenPendingPractitioner))
      .send({ patient_code: patientCodeA, grant_code: scopedGrantCode })
      .expect(403);

    const opened = await request(app)
      .post('/v1/records/grant/open')
      .set(auth(tokenPractitioner))
      .send({ patient_code: patientCodeA, grant_code: scopedGrantCode })
      .expect(200);
    assert.equal(opened.body.available, true);
    assert.deepEqual(
      opened.body.fields.map((field: { key: string }) => field.key),
      ['allergies'],
    );
    assert.equal(
      opened.body.fields.some((field: { key: string }) => field.key === 'full_name'),
      false,
    );
    assert.ok(opened.body.read_session_id);
    assert.equal(opened.body.grant_id, scopedGrantId);

    const readSessionId = opened.body.read_session_id;

    const reread = await request(app)
      .get(`/v1/records/grant/${readSessionId}`)
      .set(auth(tokenPractitioner))
      .expect(200);
    assert.equal(reread.body.available, true);
    assert.deepEqual(
      reread.body.fields.map((field: { key: string }) => field.key),
      ['allergies'],
    );

    const foreignRead = await request(app)
      .get(`/v1/records/grant/${readSessionId}`)
      .set(auth(tokenB))
      .expect(200);
    assert.equal(foreignRead.body.available, false);

    const closed = await request(app)
      .post(`/v1/records/grant/${readSessionId}/close`)
      .set(auth(tokenPractitioner))
      .expect(200);
    assert.equal(closed.body.closed, true);

    const afterClose = await request(app)
      .get(`/v1/records/grant/${readSessionId}`)
      .set(auth(tokenPractitioner))
      .expect(200);
    assert.equal(afterClose.body.available, false);

    const closedAgain = await request(app)
      .post(`/v1/records/grant/${readSessionId}/close`)
      .set(auth(tokenPractitioner))
      .expect(200);
    assert.equal(closedAgain.body.closed, true);
  });

  it('denies unknown codes without revealing existence', async () => {
    const unknown = await request(app)
      .post('/v1/records/grant/open')
      .set(auth(tokenPractitioner))
      .send({ patient_code: patientCodeA, grant_code: numericCode(8) })
      .expect(200);
    assert.deepEqual(unknown.body, { available: false });

    const wrongPatient = await request(app)
      .post('/v1/records/grant/open')
      .set(auth(tokenPractitioner))
      .send({ patient_code: numericCode(12), grant_code: scopedGrantCode })
      .expect(200);
    assert.deepEqual(wrongPatient.body, { available: false });
  });

  it('denies expired grants and revokes the open read session on revalidation', async () => {
    const created = await request(app)
      .post('/v1/me/grants')
      .set(auth(tokenA))
      .send({ field_keys: ['full_name'], expires_in_minutes: 1 })
      .expect(201);

    const opened = await request(app)
      .post('/v1/records/grant/open')
      .set(auth(tokenPractitioner))
      .send({ patient_code: patientCodeA, grant_code: created.body.code })
      .expect(200);
    assert.equal(opened.body.available, true);

    await prisma.accessGrant.update({
      where: { id: created.body.grant_id },
      data: {
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expires_at: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const denied = await request(app)
      .get(`/v1/records/grant/${opened.body.read_session_id}`)
      .set(auth(tokenPractitioner))
      .expect(200);
    assert.equal(denied.body.available, false);

    const session = await prisma.recordReadSession.findUniqueOrThrow({
      where: { id: opened.body.read_session_id },
    });
    assert.ok(session.revoked_at);
  });

  it('counts repeated grant open failures and reports audit events', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const denied = await request(app)
        .post('/v1/records/grant/open')
        .set(auth(tokenPractitioner))
        .send({ patient_code: patientCodeA, grant_code: numericCode(8) })
        .expect(200);
      assert.deepEqual(denied.body, { available: false });
    }

    const events = await request(app)
      .get('/v1/me/access-events?limit=100')
      .set(auth(tokenA))
      .expect(200);
    const actions = events.body.map((event: { action: string }) => event.action);
    assert.ok(actions.includes('grant_open'));
    assert.ok(actions.includes('grant_read'));
    const deniedEvent = events.body.find(
      (event: { action: string; outcome: string }) =>
        event.action === 'grant_open' && event.outcome === 'DENIED',
    );
    assert.ok(deniedEvent);
    assert.equal(JSON.stringify(events.body).includes(patientCodeA), false);
  });
});

describe('emergency reads', () => {
  it('returns only emergency fields and audits the read', async () => {
    const read = await request(app)
      .post('/v1/records/emergency')
      .set(auth(tokenB))
      .send({ patient_code: patientCodeA })
      .expect(200);
    assert.equal(read.body.available, true);
    assert.deepEqual(
      read.body.fields.map((field: { key: string }) => field.key),
      ['blood_group', 'full_name'],
    );
    assert.deepEqual(
      read.body.fields.map((field: { key: string }) => field.value),
      ['O+', 'Ada Obi'],
    );

    const events = await request(app)
      .get('/v1/me/access-events?limit=10')
      .set(auth(tokenA))
      .expect(200);
    const allowed = events.body.find(
      (event: { action: string; outcome: string }) =>
        event.action === 'emergency_read' && event.outcome === 'ALLOWED',
    );
    assert.ok(allowed);
    assert.deepEqual(allowed.field_keys, ['blood_group', 'full_name']);
    assert.equal(JSON.stringify(events.body).includes(patientCodeA), false);
  });

  it('denies unknown or malformed codes, then throttles the account', async () => {
    const unknown = await request(app)
      .post('/v1/records/emergency')
      .set(auth(tokenB))
      .send({ patient_code: numericCode(12) })
      .expect(200);
    assert.deepEqual(unknown.body, { available: false });

    const malformed = await request(app)
      .post('/v1/records/emergency')
      .set(auth(tokenB))
      .send({ patient_code: 'not-a-code' })
      .expect(200);
    assert.deepEqual(malformed.body, { available: false });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const denied = await request(app)
        .post('/v1/records/emergency')
        .set(auth(tokenB))
        .send({ patient_code: numericCode(12) })
        .expect(200);
      assert.deepEqual(denied.body, { available: false });
    }

    await request(app)
      .post('/v1/records/emergency')
      .set(auth(tokenB))
      .send({ patient_code: numericCode(12) })
      .expect(200);

    const throttled = await prisma.accessAttempt.count({
      where: {
        action: 'emergency_read',
        target_digest: accountAttemptDigest(patientBAccountId),
        outcome: 'THROTTLED',
      },
    });
    assert.ok(throttled >= 1);
  });
});

describe('channel consents', () => {
  it('requires an active channel link', async () => {
    await request(app)
      .put('/v1/me/consents/SMS')
      .set(auth(tokenA))
      .send({ field_keys: ['full_name'] })
      .expect(400);

    await request(app)
      .put('/v1/me/consents/EMAIL')
      .set(auth(tokenA))
      .send({ field_keys: ['full_name'] })
      .expect(400);
  });

  it('upserts consent fields per channel and revokes', async () => {
    const link = await prisma.channelLink.create({
      data: {
        patient_id: patientIds[0],
        phone_envelope: 'test-envelope',
        phone_digest: cryptoService.digestPhone('+2348030000001'),
      },
    });
    const otherLink = await prisma.channelLink.create({
      data: {
        patient_id: patientIds[1],
        phone_envelope: 'test-envelope-b',
        phone_digest: cryptoService.digestPhone('+2348030000002'),
      },
    });

    const created = await request(app)
      .put('/v1/me/consents/SMS')
      .set(auth(tokenA))
      .send({ phone_link_id: link.id, field_keys: ['full_name'], expires_in_minutes: 120 })
      .expect(200);
    assert.equal(created.body.available, true);
    assert.equal(created.body.channel, 'SMS');
    assert.equal(created.body.version, 1);
    const consentId = created.body.consent_id;
    assert.ok(new Date(created.body.expires_at).getTime() > Date.now());

    const updated = await request(app)
      .put('/v1/me/consents/SMS')
      .set(auth(tokenA))
      .send({ phone_link_id: link.id, field_keys: ['allergies', 'full_name'] })
      .expect(200);
    assert.equal(updated.body.consent_id, consentId);
    assert.equal(updated.body.version, 2);
    assert.deepEqual(updated.body.field_keys, ['allergies', 'full_name']);

    const storedFields = await prisma.consentField.findMany({
      where: { consent_id: consentId },
      select: { field_key: true },
    });
    assert.deepEqual(
      storedFields.map((field) => field.field_key).sort(),
      ['allergies', 'full_name'],
    );

    await request(app)
      .put('/v1/me/consents/USSD')
      .set(auth(tokenA))
      .send({ phone_link_id: otherLink.id, field_keys: ['full_name'] })
      .expect(400);

    await request(app).delete('/v1/me/consents/SMS').set(auth(tokenA)).expect(200);
    const revoked = await prisma.profileUseConsent.findUniqueOrThrow({ where: { id: consentId } });
    assert.ok(revoked.revoked_at);

    const deleteAgain = await request(app)
      .delete('/v1/me/consents/SMS')
      .set(auth(tokenA))
      .expect(200);
    assert.equal(deleteAgain.body.available, true);
  });
});
