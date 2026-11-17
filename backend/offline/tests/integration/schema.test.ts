import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const connectionString = process.env.TEST_DATABASE_URL;
const schemaPath = fileURLToPath(new URL('../../../database_structure.sql', import.meta.url));

type Role = 'healthaccess_web' | 'healthaccess_telecom';
interface Projection {
  available: boolean;
  fields?: Array<{ key: string; label: string; value: string | string[] }>;
  read_session_id?: string;
}
interface Facility {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  distance_km: number | null;
}
interface ReviewedContent {
  id: string;
  topic: string;
  language: string;
  version: number;
  body: string;
  reviewer: string;
  reviewed_at: string;
}

const ids = {
  patientAccount: '10000000-0000-4000-8000-000000000001',
  doctorAccount: '10000000-0000-4000-8000-000000000002',
  otherWebAccount: '10000000-0000-4000-8000-000000000003',
  patientProfile: '10000000-0000-4000-8000-000000000004',
  patientAuth: '10000000-0000-4000-8000-000000000005',
  doctorAuth: '10000000-0000-4000-8000-000000000006',
  otherWebAuth: '10000000-0000-4000-8000-000000000007',
  area: '10000000-0000-4000-8000-000000000008',
  closeFacility: '10000000-0000-4000-8000-000000000009',
  farFacility: '10000000-0000-4000-8000-00000000000a',
  unverifiedFacility: '10000000-0000-4000-8000-00000000000b',
  grantBoth: '10000000-0000-4000-8000-00000000000c',
  grantWeb: '10000000-0000-4000-8000-00000000000d',
  ussdSession: '10000000-0000-4000-8000-00000000000e',
  reviewedContent: '10000000-0000-4000-8000-00000000000f',
} as const;

const digest = (value: string) => value.repeat(64);
const patientCode = digest('a');
const grantBothCode = digest('b');
const grantWebCode = digest('c');
const phoneDigest = digest('d');
const otherPhoneDigest = digest('e');
const patientToken = digest('1');
const doctorToken = digest('2');
const otherWebToken = digest('3');
const ownerCreatedGrantCode = digest('f');

function actor(phone = phoneDigest, sessionId?: string) {
  return JSON.stringify({
    phone_digest: phone,
    request_id: 'schema-test',
    ...(sessionId ? { session_id: sessionId } : {}),
  });
}

async function one<T>(client: pg.Client, text: string, values: unknown[] = []): Promise<T> {
  const result = await client.query(text, values);
  const row = result.rows[0] as T | undefined;
  if (!row) throw new Error('Expected one row');
  return row;
}

async function withRole<T>(role: Role, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(`SET SESSION AUTHORIZATION ${role}`);
    return await work(client);
  } finally {
    await client.end();
  }
}

async function applySchema(client: pg.Client): Promise<void> {
  const sql = await readFile(schemaPath, 'utf8');
  await client.query(sql);
}

async function seed(client: pg.Client): Promise<void> {
  await client.query(
    `INSERT INTO healthaccess.accounts (id,email_normalized,password_hash,display_name,status) VALUES
    ($1,'patient@example.test','x','Patient One','active'),
    ($2,'doctor@example.test','x','Dr Ada Example','active'),
    ($3,'other-web@example.test','x','Other Web User','active')
    ON CONFLICT (id) DO UPDATE SET status='active'`,
    [ids.patientAccount, ids.doctorAccount, ids.otherWebAccount],
  );
  await client.query(
    `INSERT INTO healthaccess.account_roles (account_id,role) VALUES
    ($1,'patient'),($2,'practitioner') ON CONFLICT DO NOTHING`,
    [ids.patientAccount, ids.doctorAccount],
  );
  await client.query(
    `INSERT INTO healthaccess.auth_sessions (id,account_id,token_digest,expires_at,recent_auth_at) VALUES
    ($1,$2,$3,now()+interval '1 hour',now()),
    ($4,$5,$6,now()+interval '1 hour',now()),
    ($7,$8,$9,now()+interval '1 hour',now())
    ON CONFLICT (id) DO UPDATE SET expires_at=now()+interval '1 hour', recent_auth_at=now(), revoked_at=NULL`,
    [
      ids.patientAuth,
      ids.patientAccount,
      patientToken,
      ids.doctorAuth,
      ids.doctorAccount,
      doctorToken,
      ids.otherWebAuth,
      ids.otherWebAccount,
      otherWebToken,
    ],
  );
  await client.query(
    `INSERT INTO healthaccess.patient_profiles (id,account_id,preferred_language) VALUES ($1,$2,'en')
    ON CONFLICT (id) DO UPDATE SET version=1`,
    [ids.patientProfile, ids.patientAccount],
  );
  await client.query(
    `INSERT INTO healthaccess.practitioner_profiles (account_id,verification_status,verified_at) VALUES ($1,'approved',now())
    ON CONFLICT (account_id) DO UPDATE SET verification_status='approved', verified_at=now()`,
    [ids.doctorAccount],
  );
  await client.query(
    `INSERT INTO healthaccess.patient_field_values (patient_id,field_key,value,version,source) VALUES
    ($1,'full_name','"Patient One"'::jsonb,1,'patient'),
    ($1,'allergies','["Penicillin"]'::jsonb,1,'patient'),
    ($1,'current_medications','["Amlodipine"]'::jsonb,1,'patient'),
    ($1,'conditions','["Hypertension"]'::jsonb,1,'patient')
    ON CONFLICT (patient_id,field_key) DO UPDATE SET value=EXCLUDED.value, version=1`,
    [ids.patientProfile],
  );
  await client.query(`DELETE FROM healthaccess.emergency_fields WHERE patient_id=$1`, [
    ids.patientProfile,
  ]);
  await client.query(
    `INSERT INTO healthaccess.emergency_fields (patient_id,field_key,display_order) VALUES ($1,'allergies',1)`,
    [ids.patientProfile],
  );
  await client.query(
    `INSERT INTO healthaccess.patient_codes (patient_id,code_digest,code_ciphertext,key_version,code_version) VALUES ($1,$2,'sealed',1,1)
    ON CONFLICT (patient_id) DO UPDATE SET code_digest=EXCLUDED.code_digest, code_ciphertext=EXCLUDED.code_ciphertext, code_version=1`,
    [ids.patientProfile, patientCode],
  );
  await client.query(`DELETE FROM healthaccess.access_grants WHERE code_digest=$1`, [
    ownerCreatedGrantCode,
  ]);
  await client.query(
    `INSERT INTO healthaccess.access_grants (id,patient_id,code_digest,expires_at,revoked_at,created_by_account_id) VALUES
    ($1,$3,$4,now()+interval '1 hour',NULL,$5),
    ($2,$3,$6,now()+interval '1 hour',NULL,$5)
    ON CONFLICT (id) DO UPDATE SET expires_at=now()+interval '1 hour', revoked_at=NULL`,
    [
      ids.grantBoth,
      ids.grantWeb,
      ids.patientProfile,
      grantBothCode,
      ids.patientAccount,
      grantWebCode,
    ],
  );
  await client.query(`DELETE FROM healthaccess.access_grant_fields WHERE grant_id IN ($1,$2)`, [
    ids.grantBoth,
    ids.grantWeb,
  ]);
  await client.query(
    `INSERT INTO healthaccess.access_grant_fields (grant_id,field_key) VALUES
    ($1,'allergies'),($1,'current_medications'),($2,'allergies')`,
    [ids.grantBoth, ids.grantWeb],
  );
  await client.query(`DELETE FROM healthaccess.access_grant_channels WHERE grant_id IN ($1,$2)`, [
    ids.grantBoth,
    ids.grantWeb,
  ]);
  await client.query(
    `INSERT INTO healthaccess.access_grant_channels (grant_id,channel) VALUES
    ($1,'ussd'),($1,'web_practitioner'),($2,'web_practitioner')`,
    [ids.grantBoth, ids.grantWeb],
  );
  await client.query(
    `INSERT INTO telecom.channel_links (id,patient_id,phone_envelope,phone_digest,verified_at,revoked_at) VALUES
    ('10000000-0000-4000-8000-000000000010',$1,'sealed-phone',$2,now(),NULL)
    ON CONFLICT (patient_id,phone_digest) WHERE revoked_at IS NULL DO UPDATE SET verified_at=now(), revoked_at=NULL`,
    [ids.patientProfile, phoneDigest],
  );
  await client.query(`DELETE FROM healthaccess.record_read_sessions WHERE telecom_session_id=$1`, [
    ids.ussdSession,
  ]);
  await client.query(
    `INSERT INTO telecom.ussd_sessions (id,provider,provider_session_id,phone_digest,service_code,state,context,path_depth,expires_at,ended_at,read_session_id) VALUES
    ($1,'africastalking','schema-test-session',$2,'*123#','MAIN','{}',-1,now()+interval '30 minutes',NULL,NULL)
    ON CONFLICT (provider,provider_session_id) DO UPDATE SET expires_at=now()+interval '30 minutes', ended_at=NULL,
      read_session_id=NULL, phone_digest=EXCLUDED.phone_digest, state='MAIN', context='{}', path_depth=-1`,
    [ids.ussdSession, phoneDigest],
  );
  await client.query(
    `INSERT INTO directory.areas (id,region,city,name,center_latitude,center_longitude) VALUES
    ($1,'Lagos','Ikeja','Test Ikeja',6.6018,3.3515) ON CONFLICT (id) DO UPDATE SET active=true`,
    [ids.area],
  );
  await client.query(
    `INSERT INTO directory.facilities (id,name,address,area_id,latitude,longitude,status,is_demo) VALUES
    ($1,'Close General Clinic','1 Close Road, Ikeja',$4,6.6020,3.3520,'approved',true),
    ($2,'Far Child Hospital','2 Far Road, Ikeja',$4,6.7000,3.5000,'approved',true),
    ($3,'Unverified Child Clinic','3 Hidden Road, Ikeja',$4,6.6019,3.3519,'approved',true)
    ON CONFLICT (id) DO UPDATE SET status='approved', area_id=EXCLUDED.area_id`,
    [ids.closeFacility, ids.farFacility, ids.unverifiedFacility, ids.area],
  );
  await client.query(`DELETE FROM directory.facility_services WHERE facility_id IN ($1,$2,$3)`, [
    ids.closeFacility,
    ids.farFacility,
    ids.unverifiedFacility,
  ]);
  await client.query(
    `INSERT INTO directory.facility_services (facility_id,service_code,verification_status,verified_at) VALUES
    ($1,'general','approved',now()),($2,'pediatrics','approved',now()),($3,'pediatrics','unverified',NULL)`,
    [ids.closeFacility, ids.farFacility, ids.unverifiedFacility],
  );
  await client.query(
    `INSERT INTO content.reviewed_health_content
    (id,topic_code,language,version,title,body,status,reviewer_account_id,reviewed_at,published_at)
    VALUES ($1,'child_fever','en',1,'Child fever','Fever information reviewed for the demonstration.','published',$2,now(),now())
    ON CONFLICT (id) DO UPDATE SET status='published', reviewer_account_id=EXCLUDED.reviewer_account_id,
      reviewed_at=now(), published_at=now()`,
    [ids.reviewedContent, ids.doctorAccount],
  );
}

test('database schema and shared access policy', { skip: !connectionString }, async (t) => {
  if (!connectionString) return;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  t.after(async () => {
    try {
      await admin.query("DELETE FROM telecom.outbox WHERE logical_key LIKE 'schema-test-outbox-%'");
      await admin.query(
        "DELETE FROM telecom.sms_inbox WHERE provider_message_id LIKE 'schema-test-%'",
      );
      await admin.query("DELETE FROM telecom.rate_limits WHERE scope LIKE 'schema-test-%'");
      await admin.query('DELETE FROM telecom.channel_preferences WHERE phone_digest=$1', [
        phoneDigest,
      ]);
      await admin.query('DELETE FROM healthaccess.record_read_sessions WHERE patient_id=$1', [
        ids.patientProfile,
      ]);
      await admin.query('DELETE FROM telecom.ussd_sessions WHERE id=$1', [ids.ussdSession]);
      await admin.query('DELETE FROM telecom.channel_links WHERE patient_id=$1', [
        ids.patientProfile,
      ]);
      await admin.query('DELETE FROM content.reviewed_health_content WHERE id=$1', [
        ids.reviewedContent,
      ]);
      await admin.query('DELETE FROM directory.facility_services WHERE facility_id IN ($1,$2,$3)', [
        ids.closeFacility,
        ids.farFacility,
        ids.unverifiedFacility,
      ]);
      await admin.query('DELETE FROM directory.facilities WHERE id IN ($1,$2,$3)', [
        ids.closeFacility,
        ids.farFacility,
        ids.unverifiedFacility,
      ]);
      await admin.query('DELETE FROM directory.areas WHERE id=$1', [ids.area]);
      await admin.query('DELETE FROM healthaccess.access_grants WHERE patient_id=$1', [
        ids.patientProfile,
      ]);
      await admin.query('DELETE FROM healthaccess.accounts WHERE id IN ($1,$2,$3)', [
        ids.patientAccount,
        ids.doctorAccount,
        ids.otherWebAccount,
      ]);
    } finally {
      await admin.end();
    }
  });

  await applySchema(admin);
  await applySchema(admin);
  await seed(admin);

  await t.test(
    'restricted telecom has telecom CRUD and shared reads but no patient table or web access',
    async () => {
      await withRole('healthaccess_telecom', async (client) => {
        const sms = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.sms_read_emergency_summary($1,$2::jsonb) AS data',
          [patientCode, actor()],
        );
        assert.equal(sms.data.available, true);
        assert.deepEqual(
          sms.data.fields?.map((field) => field.key),
          ['allergies'],
        );
        await assert.rejects(
          client.query('SELECT count(*) FROM healthaccess.patient_field_values'),
          /permission denied/,
        );
        await assert.rejects(
          client.query('SELECT healthaccess_api.web_read_emergency_summary($1,$2::jsonb)', [
            patientCode,
            '{}',
          ]),
          /permission denied/,
        );

        const inbox = await one<{ id: string }>(
          client,
          `INSERT INTO telecom.sms_inbox
        (provider_message_id,phone_digest,body_envelope,status,expires_at)
        VALUES ($1,$2,'sealed','processed',now()+interval '1 hour') RETURNING id`,
          [`schema-test-${Date.now()}`, phoneDigest],
        );
        assert.ok(inbox.id);
        const outbox = await one<{ id: string }>(
          client,
          `INSERT INTO telecom.outbox
        (logical_key,kind,recipient_phone_envelope,render_ref,status,expires_at)
        VALUES ($1,'web_lead','sealed-phone','{}'::jsonb,'delivered',now()+interval '1 hour') RETURNING id`,
          [`schema-test-outbox-${Date.now()}`],
        );
        assert.ok(outbox.id);
        await client.query(
          `INSERT INTO telecom.rate_limits(scope,window_start,hits) VALUES ($1,now(),1)
        ON CONFLICT (scope,window_start) DO UPDATE SET hits=telecom.rate_limits.hits+1`,
          [`schema-test-${Date.now()}`],
        );
        await client.query(
          `INSERT INTO telecom.channel_preferences(phone_digest,opted_out) VALUES ($1,true)
        ON CONFLICT (phone_digest) DO UPDATE SET opted_out=true`,
          [phoneDigest],
        );
      });
    },
  );

  await t.test(
    'USSD grant reads are field scoped, session and phone bound, and rechecked',
    async () => {
      await withRole('healthaccess_telecom', async (client) => {
        const open = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.ussd_open_granted_record($1,$2,$3::jsonb) AS data',
          [patientCode, grantBothCode, actor(phoneDigest, ids.ussdSession)],
        );
        assert.equal(open.data.available, true);
        assert.deepEqual(
          open.data.fields?.map((field) => field.key),
          ['allergies', 'current_medications'],
        );
        assert.ok(open.data.read_session_id);

        const replay = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.ussd_read_granted_record($1,$2::jsonb) AS data',
          [open.data.read_session_id, actor(phoneDigest, ids.ussdSession)],
        );
        assert.equal(replay.data.available, true);
        assert.deepEqual(
          replay.data.fields?.map((field) => field.key),
          ['allergies', 'current_medications'],
        );

        const crossPhone = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.ussd_read_granted_record($1,$2::jsonb) AS data',
          [open.data.read_session_id, actor(otherPhoneDigest, ids.ussdSession)],
        );
        assert.equal(crossPhone.data.available, false);

        const wrongChannel = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.ussd_open_granted_record($1,$2,$3::jsonb) AS data',
          [patientCode, grantWebCode, actor(phoneDigest, ids.ussdSession)],
        );
        assert.equal(wrongChannel.data.available, false);

        await admin.query(
          `UPDATE telecom.ussd_sessions SET expires_at=now()-interval '1 second' WHERE id=$1`,
          [ids.ussdSession],
        );
        const expiredSession = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.ussd_read_granted_record($1,$2::jsonb) AS data',
          [open.data.read_session_id, actor(phoneDigest, ids.ussdSession)],
        );
        assert.equal(expiredSession.data.available, false);

        await admin.query(
          `UPDATE telecom.ussd_sessions SET expires_at=now()+interval '30 minutes' WHERE id=$1`,
          [ids.ussdSession],
        );
        await admin.query(`UPDATE healthaccess.access_grants SET revoked_at=now() WHERE id=$1`, [
          ids.grantBoth,
        ]);
        const revokedGrant = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.ussd_read_granted_record($1,$2::jsonb) AS data',
          [open.data.read_session_id, actor(phoneDigest, ids.ussdSession)],
        );
        assert.equal(revokedGrant.data.available, false);
        await admin.query(`UPDATE healthaccess.access_grants SET revoked_at=NULL WHERE id=$1`, [
          ids.grantBoth,
        ]);
      });
    },
  );

  await t.test(
    'web grant access requires an approved practitioner bound to the authenticated session',
    async () => {
      await withRole('healthaccess_web', async (client) => {
        const open = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.web_open_granted_record($1,$2,$3,$4::jsonb) AS data',
          [doctorToken, patientCode, grantWebCode, '{}'],
        );
        assert.equal(open.data.available, true);
        assert.deepEqual(
          open.data.fields?.map((field) => field.key),
          ['allergies'],
        );
        assert.ok(open.data.read_session_id);

        const read = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.web_read_granted_record($1,$2,$3::jsonb) AS data',
          [doctorToken, open.data.read_session_id, '{}'],
        );
        assert.equal(read.data.available, true);

        const notPractitioner = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.web_open_granted_record($1,$2,$3,$4::jsonb) AS data',
          [otherWebToken, patientCode, grantWebCode, '{}'],
        );
        assert.equal(notPractitioner.data.available, false);
      });
    },
  );

  await t.test(
    'owner routines derive the patient from the authenticated session and create scoped grants',
    async () => {
      await withRole('healthaccess_web', async (client) => {
        const profile = await one<{ data: { available: boolean; patient_id: string } }>(
          client,
          'SELECT healthaccess_api.web_get_my_profile($1) AS data',
          [patientToken],
        );
        assert.equal(profile.data.available, true);
        assert.equal(profile.data.patient_id, ids.patientProfile);

        const summary = await one<{ data: Projection }>(
          client,
          'SELECT healthaccess_api.web_get_my_emergency_summary($1) AS data',
          [patientToken],
        );
        assert.equal(summary.data.available, true);
        assert.deepEqual(
          summary.data.fields?.map((field) => field.key),
          ['allergies'],
        );

        const created = await one<{ data: { available: boolean; grant_id: string } }>(
          client,
          'SELECT healthaccess_api.web_create_read_grant($1,$2::text[],$3::text[],$4,$5,$6::jsonb) AS data',
          [patientToken, ['allergies'], ['ussd'], 3600, ownerCreatedGrantCode, '{}'],
        );
        assert.equal(created.data.available, true);
        assert.ok(created.data.grant_id);

        const revoked = await one<{ data: { available: boolean } }>(
          client,
          'SELECT healthaccess_api.web_revoke_read_grant($1,$2,$3::jsonb) AS data',
          [patientToken, created.data.grant_id, '{}'],
        );
        assert.equal(revoked.data.available, true);
      });
    },
  );

  await t.test(
    'directory filters by approved service before distance and reviewed content is published-only',
    async () => {
      await withRole('healthaccess_web', async (client) => {
        const pediatric = await one<{ data: Facility[] }>(
          client,
          'SELECT healthaccess_api.find_facilities($1,$2,$3,$4) AS data',
          ['pediatrics', ids.area, 50, 3],
        );
        assert.deepEqual(
          pediatric.data.map((facility) => facility.id),
          [ids.farFacility],
        );
        assert.equal(pediatric.data[0]?.distance_km !== null, true);

        const general = await one<{ data: Facility[] }>(
          client,
          'SELECT healthaccess_api.find_facilities($1,$2,$3,$4) AS data',
          ['general', ids.area, 50, 3],
        );
        assert.deepEqual(
          general.data.map((facility) => facility.id),
          [ids.closeFacility],
        );

        const reviewed = await one<{ data: ReviewedContent[] }>(
          client,
          'SELECT healthaccess_api.find_reviewed_content($1,$2) AS data',
          ['fever', 3],
        );
        assert.equal(reviewed.data.length, 1);
        assert.equal(reviewed.data[0]?.reviewer, 'Dr Ada Example');
        assert.equal(reviewed.data[0]?.id, ids.reviewedContent);
      });
    },
  );

  await t.test('referral recording is idempotent for a repeated request id', async () => {
    const requestId = `referral-${randomUUID()}`;
    try {
      await withRole('healthaccess_telecom', async (client) => {
        const first = await one<{ data: { available: boolean; referral_id: string } }>(
          client,
          'SELECT healthaccess_api.telecom_record_referral($1,$2,$3,$4,$5::jsonb) AS data',
          [
            'general',
            ids.area,
            [ids.closeFacility],
            null,
            JSON.stringify({ phone_digest: phoneDigest, request_id: requestId }),
          ],
        );
        const second = await one<{ data: { available: boolean; referral_id: string } }>(
          client,
          'SELECT healthaccess_api.telecom_record_referral($1,$2,$3,$4,$5::jsonb) AS data',
          [
            'general',
            ids.area,
            [ids.closeFacility],
            null,
            JSON.stringify({ phone_digest: phoneDigest, request_id: requestId }),
          ],
        );
        assert.equal(first.data.available, true);
        assert.equal(second.data.referral_id, first.data.referral_id);
      });
      const count = await one<{ count: number }>(
        admin,
        'SELECT count(*)::int AS count FROM directory.referral_requests WHERE request_id=$1',
        [requestId],
      );
      assert.equal(count.count, 1);
    } finally {
      await admin.query('DELETE FROM directory.referral_requests WHERE request_id=$1', [requestId]);
    }
  });

  await t.test(
    'radius search crosses area boundaries and preserves fictional-data labels',
    async () => {
      const nearbyArea = randomUUID();
      const nearbyFacility = randomUUID();
      try {
        await admin.query(
          `INSERT INTO directory.areas(id,region,city,name,center_latitude,center_longitude)
        VALUES($1,'Lagos','Neighbouring area','Neighbouring test area',6.602,3.352)`,
          [nearbyArea],
        );
        await admin.query(
          `INSERT INTO directory.facilities(id,name,address,area_id,latitude,longitude,status,is_demo)
        VALUES($1,'Cross-area test hospital','Fictional address',$2,6.602,3.352,'approved',true)`,
          [nearbyFacility, nearbyArea],
        );
        await admin.query(
          `INSERT INTO directory.facility_services(facility_id,service_code,verification_status,verified_at)
        VALUES($1,'pediatrics','approved',now())`,
          [nearbyFacility],
        );
        await withRole('healthaccess_telecom', async (client) => {
          const result = await one<{ data: Array<Facility & { is_demo: boolean }> }>(
            client,
            'SELECT healthaccess_api.find_facilities($1,$2,25,10) AS data',
            ['pediatrics', ids.area],
          );
          assert.equal(result.data[0].id, nearbyFacility);
          assert.equal(result.data[0].is_demo, true);
          assert.ok(Number(result.data[0].distance_km) < 1);
        });
      } finally {
        await admin.query('DELETE FROM directory.facilities WHERE id=$1', [nearbyFacility]);
        await admin.query('DELETE FROM directory.areas WHERE id=$1', [nearbyArea]);
      }
    },
  );
});
