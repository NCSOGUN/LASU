import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { loadConfig } from '../../src/config.js';
import { createCrypto } from '../../src/security/crypto.js';
import { Repository } from '../../src/repository.js';
import { createSmsEngine } from '../../src/channels/sms.js';
import { createUssdEngine } from '../../src/channels/ussd.js';
import { createUssdHandler } from '../../src/channels/ussd-handler.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'PostgreSQL inbox/outbox durability and delivery reconciliation',
  { skip: !databaseUrl },
  async (t) => {
    const admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    let initialized = false;
    t.after(async () => {
      if (!initialized) await admin.end();
    });
    const schema = await readFile(
      new URL('../../../database_structure.sql', import.meta.url),
      'utf8',
    );
    await admin.query(schema);
    const login = `ha_queue_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const password = randomBytes(24).toString('hex');
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT healthaccess_telecom TO ${login}`);
    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.username = login;
    runtimeUrl.password = password;
    const config = loadConfig({
      DATABASE_URL: runtimeUrl.toString(),
      CALLBACK_TOKEN: randomBytes(32).toString('base64url'),
      CODE_DIGEST_KEY: randomBytes(32).toString('base64'),
      DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    });
    const crypto = createCrypto(config);
    const repository = new Repository(config, crypto);
    const workerId = randomUUID();
    const prefix = randomUUID();
    const phone = '+2348000000000';
    const phoneDigest = crypto.digestPhone(phone);
    const inboxIds: string[] = [];
    const providerMessageId = `AT-test-${prefix}`;
    const patientAccount = randomUUID();
    const patientId = randomUUID();
    const areaId = randomUUID();
    const patientCode = '121212121212';

    t.after(async () => {
      await repository.close();
      try {
        await admin.query('DELETE FROM telecom.outbox WHERE recipient_phone_digest=$1', [
          phoneDigest,
        ]);
        await admin.query('DELETE FROM telecom.sms_inbox WHERE phone_digest=$1', [phoneDigest]);
        await admin.query('DELETE FROM telecom.sms_conversations WHERE phone_digest=$1', [
          phoneDigest,
        ]);
        await admin.query('DELETE FROM telecom.channel_preferences WHERE phone_digest=$1', [
          phoneDigest,
        ]);
        await admin.query('DELETE FROM telecom.delivery_events WHERE provider_message_id=$1', [
          providerMessageId,
        ]);
        await admin.query('DELETE FROM healthaccess.record_read_sessions WHERE patient_id=$1', [
          patientId,
        ]);
        await admin.query('DELETE FROM telecom.ussd_sessions WHERE provider_session_id LIKE $1', [
          `${prefix}%`,
        ]);
        await admin.query('DELETE FROM healthaccess.accounts WHERE id=$1', [patientAccount]);
        await admin.query('DELETE FROM directory.areas WHERE id=$1', [areaId]);
        await admin.query(`DROP ROLE ${login}`);
      } finally {
        await admin.end();
      }
    });
    initialized = true;

    async function processMessage(text: string) {
      const body = { id: `in-${randomUUID()}`, from: phone, to: 'test-number', text };
      await repository.acceptSms(body, randomUUID());
      const job = await repository.claimInbox(workerId);
      assert.ok(job);
      await repository.processInbox(job, async (message, scoped, conversation) => {
        const engine = createSmsEngine({
          repository: scoped,
          crypto,
          config,
          assistant: {
            classify: async () => ({
              intent: 'unsupported',
              service_code: null,
              location_query: null,
              question: null,
            }),
            answer: async () => ({ text: 'Not used.' }),
          },
        });
        return engine.process(message.text, conversation);
      });
    }

    await t.test('only a restricted runtime login is accepted', async () => {
      await repository.ready();
      await assert.rejects(
        repository.pool.query('SELECT * FROM healthaccess.patient_field_values'),
        /permission denied/,
      );
    });

    await t.test('duplicate callback creates one encrypted inbox job', async () => {
      const body = { id: `in-${prefix}`, from: phone, to: 'test-number', text: 'HELP' };
      await repository.acceptSms(body, randomUUID());
      await repository.acceptSms(body, randomUUID());
      const saved = await admin.query(
        'SELECT id,body_envelope,status FROM telecom.sms_inbox WHERE provider_message_id=$1',
        [body.id],
      );
      assert.equal(saved.rowCount, 1);
      assert.equal(saved.rows[0].status, 'queued');
      assert.ok(!saved.rows[0].body_envelope.includes(phone));
      inboxIds.push(saved.rows[0].id);
    });

    await t.test('only one worker claims the inbox; one atomic response is queued', async () => {
      const job = await repository.claimInbox(workerId);
      assert.ok(job);
      assert.equal(job.id, inboxIds[0]);
      assert.equal(await repository.claimInbox(randomUUID()), null);
      await repository.processInbox(job, async (body, scoped, conversation) => {
        const engine = createSmsEngine({
          repository: scoped,
          crypto,
          config,
          assistant: {
            classify: async () => ({
              intent: 'unsupported',
              service_code: null,
              location_query: null,
              question: null,
            }),
            answer: async () => ({ text: 'Not used.' }),
          },
        });
        return engine.process(body.text, conversation);
      });
      const saved = await admin.query('SELECT status FROM telecom.sms_inbox WHERE id=$1', [job.id]);
      assert.equal(saved.rows[0].status, 'processed');
      const outgoing = await admin.query('SELECT * FROM telecom.outbox WHERE logical_key=$1', [
        `sms:${job.id}:0`,
      ]);
      assert.equal(outgoing.rowCount, 1);
      assert.ok(!JSON.stringify(outgoing.rows[0]).includes(phone));
    });

    await t.test('a delivery report arriving before send persistence is reconciled', async () => {
      const job = await repository.claimOutbox(workerId);
      assert.ok(job);
      assert.equal(await repository.claimOutbox(randomUUID()), null);
      const rendered = await repository.renderOutbox(job);
      assert.equal(rendered.phone, phone);
      assert.equal(rendered.reply.kind, 'text');
      await repository.acceptDelivery({ id: providerMessageId, status: 'Success' });
      await repository.acceptDelivery({ id: providerMessageId, status: 'Success' });
      await repository.finishOutbox(job, {
        state: 'accepted',
        providerMessageId,
        retryable: false,
      });
      const saved = await admin.query('SELECT status FROM telecom.outbox WHERE id=$1', [job.id]);
      assert.equal(saved.rows[0].status, 'delivered');
      const events = await admin.query(
        'SELECT id FROM telecom.delivery_events WHERE provider_message_id=$1',
        [providerMessageId],
      );
      assert.equal(events.rowCount, 1);
      await repository.acceptDelivery({ id: providerMessageId, status: 'Failed' });
      const monotonic = await admin.query('SELECT status FROM telecom.outbox WHERE id=$1', [
        job.id,
      ]);
      assert.equal(monotonic.rows[0].status, 'delivered');
    });

    await t.test('an expired sending lease becomes unknown, never a resend', async () => {
      await admin.query(
        `UPDATE telecom.outbox SET status='sending',provider_message_id=NULL,lease_until=now()-interval '1 second'
      WHERE logical_key=$1`,
        [`sms:${inboxIds[0]}:0`],
      );
      await repository.maintain();
      const result = await admin.query('SELECT status FROM telecom.outbox WHERE logical_key=$1', [
        `sms:${inboxIds[0]}:0`,
      ]);
      assert.equal(result.rows[0].status, 'unknown');
      assert.equal(await repository.claimOutbox(workerId), null);
    });

    await t.test(
      'queued summaries reauthorize at dispatch and never cache private fields',
      async () => {
        await admin.query(
          `INSERT INTO healthaccess.accounts(id,email_normalized,password_hash,display_name)
      VALUES($1,$2,'disabled-test-password','Test patient')`,
          [patientAccount, `${prefix}@example.test`],
        );
        await admin.query(
          'INSERT INTO healthaccess.patient_profiles(id,account_id) VALUES($1,$2)',
          [patientId, patientAccount],
        );
        await admin.query(
          `INSERT INTO healthaccess.patient_codes(patient_id,code_digest,code_ciphertext,key_version)
      VALUES($1,$2,'test-only-ciphertext',1)`,
          [patientId, crypto.digestCode(patientCode)],
        );
        await admin.query(
          `INSERT INTO healthaccess.patient_field_values(patient_id,field_key,value) VALUES
      ($1,'allergies','["Test allergy"]'),($1,'current_medications','["Private test medicine"]')`,
          [patientId],
        );
        await admin.query(
          `INSERT INTO healthaccess.emergency_fields(patient_id,field_key,display_order) VALUES($1,'allergies',1)`,
          [patientId],
        );
        await processMessage(`LOOKUP ${patientCode}`);
        const job = await repository.claimOutbox(workerId);
        assert.ok(job);
        assert.equal(job.kind, 'emergency');
        assert.ok(!JSON.stringify(job).includes('Test allergy'));
        const before = await repository.renderOutbox(job);
        assert.deepEqual(
          before.projection?.fields?.map((field) => field.key),
          ['allergies'],
        );
        assert.ok(!JSON.stringify(before.projection).includes('Private test medicine'));
        await admin.query('DELETE FROM healthaccess.emergency_fields WHERE patient_id=$1', [
          patientId,
        ]);
        const after = await repository.renderOutbox(job);
        assert.equal(after.projection?.available, false);
        await repository.finishOutbox(job, {
          state: 'failed',
          providerMessageId: null,
          retryable: false,
        });
        await admin.query(
          `INSERT INTO healthaccess.emergency_fields(patient_id,field_key,display_order) VALUES($1,'allergies',1)`,
          [patientId],
        );
      },
    );

    await t.test('STOP expires pending replies and permits only its confirmation', async () => {
      await processMessage('HELP');
      const pending = await admin.query("SELECT * FROM telecom.outbox WHERE status='queued'");
      assert.equal(pending.rowCount, 1);
      await processMessage('STOP');
      const previous = await admin.query('SELECT status FROM telecom.outbox WHERE id=$1', [
        pending.rows[0].id,
      ]);
      assert.equal(previous.rows[0].status, 'expired');
      const confirmation = await repository.claimOutbox(workerId);
      assert.ok(confirmation);
      const rendered = await repository.renderOutbox(confirmation);
      assert.equal(rendered.suppressed, undefined);
      assert.equal(rendered.reply.kind === 'text' && rendered.reply.allowAfterStop, true);
      const old = await repository.renderOutbox(pending.rows[0]);
      assert.equal(old.suppressed, true);
      await repository.finishOutbox(confirmation, {
        state: 'accepted',
        providerMessageId: `mock_${randomUUID()}`,
        retryable: false,
      });
    });

    await t.test(
      'real USSD persistence enforces cumulative paths, replay authorization and phone binding',
      async () => {
        const handler = createUssdHandler({
          repository,
          crypto,
          config,
          createEngine: createUssdEngine,
        });
        const body = {
          sessionId: `${prefix}-record`,
          phoneNumber: phone,
          serviceCode: '*test#',
          text: '',
        };
        assert.match(await handler(body, randomUUID()), /^CON HealthAccess/);
        assert.match(await handler({ ...body, text: '1*2' }, randomUUID()), /^END/);
        assert.match(await handler({ ...body, text: '2' }, randomUUID()), /Enter patient code/);
        const request = { ...body, text: `2*${patientCode}` };
        assert.match(await handler(request, randomUUID()), /Test allergy/);
        assert.match(
          await handler({ ...request, phoneNumber: '+2348000000001' }, randomUUID()),
          /^END Session/,
        );
        await admin.query('DELETE FROM healthaccess.emergency_fields WHERE patient_id=$1', [
          patientId,
        ]);
        const revoked = await handler(request, randomUUID());
        assert.match(revoked, /^END/);
        assert.ok(!revoked.includes('Test allergy'));
        await repository.endUssdSession({ sessionId: body.sessionId });
        assert.match(await handler(request, randomUUID()), /^END Session/);
        const saved = await admin.query(
          'SELECT context::text,path_digest FROM telecom.ussd_sessions WHERE provider_session_id=$1',
          [body.sessionId],
        );
        assert.ok(!JSON.stringify(saved.rows[0]).includes(patientCode));
      },
    );

    await t.test('USSD no-match state is persistable and can widen its radius', async () => {
      await admin.query(
        `INSERT INTO directory.areas(id,region,city,name,center_latitude,center_longitude)
      VALUES($1,'Test region','Test city','Queue Test Area',10,7)`,
        [areaId],
      );
      const handler = createUssdHandler({
        repository,
        crypto,
        config,
        createEngine: createUssdEngine,
      });
      const body = {
        sessionId: `${prefix}-care`,
        phoneNumber: phone,
        serviceCode: '*test#',
        text: '',
      };
      await handler(body, randomUUID());
      await handler({ ...body, text: '1' }, randomUUID());
      await handler({ ...body, text: '1*2' }, randomUUID());
      const request = { ...body, text: '1*2*Queue Test Area' };
      const noMatch = await handler(request, randomUUID());
      assert.match(noMatch, /^CON No suitable hospital/);
      const saved = await admin.query(
        'SELECT state FROM telecom.ussd_sessions WHERE provider_session_id=$1',
        [body.sessionId],
      );
      assert.equal(saved.rows[0].state, 'CARE_NO_MATCH');
      assert.match(await handler({ ...body, text: `${request.text}*1` }, randomUUID()), /^CON/);
    });

    await t.test(
      'USSD facility SMS retry can create a new job after a terminal failure',
      async () => {
        const listed = await repository.pool.query<{ data: Array<{ service_code: string }> }>(
          'SELECT healthaccess_api.list_services() AS data',
        );
        const services = listed.rows[0].data;
        const service = services[0];
        assert.ok(service);
        const facilityId = randomUUID();
        try {
          await admin.query(
            `INSERT INTO directory.facilities(id,name,address,area_id,latitude,longitude,status,is_demo)
          VALUES($1,'Retry test clinic','Fictional address',$2,10,7,'approved',true)`,
            [facilityId, areaId],
          );
          await admin.query(
            `INSERT INTO directory.facility_services(facility_id,service_code,verification_status,verified_at)
          VALUES($1,$2,'approved',now())`,
            [facilityId, service.service_code],
          );
          const handler = createUssdHandler({
            repository,
            crypto,
            config,
            createEngine: createUssdEngine,
          });
          const body = {
            sessionId: `${prefix}-retry`,
            phoneNumber: phone,
            serviceCode: '*test#',
            text: '',
          };
          await handler(body, randomUUID());
          await handler({ ...body, text: '1' }, randomUUID());
          const serviceToken = String(
            services.findIndex(
              (item: { service_code: string }) => item.service_code === service.service_code,
            ) + 1,
          );
          await handler({ ...body, text: `1*${serviceToken}` }, randomUUID());
          const result = await handler(
            { ...body, text: `1*${serviceToken}*Queue Test Area` },
            randomUUID(),
          );
          assert.match(result, /^CON DEMO: Retry test clinic/);

          const queue = () =>
            repository.withUssdSession(body, randomUUID(), async (_session, scoped) => {
              assert.equal(await scoped.queueFacilitySms(facilityId), true);
              return 'CON queued';
            });
          await queue();
          const base = `ussd:`;
          await admin.query(`UPDATE telecom.outbox SET status='failed' WHERE logical_key LIKE $1`, [
            `${base}%:facility:${facilityId}%`,
          ]);
          await queue();
          const jobs = await admin.query(
            `SELECT logical_key,status FROM telecom.outbox WHERE logical_key LIKE $1 ORDER BY created_at`,
            [`${base}%:facility:${facilityId}%`],
          );
          assert.equal(jobs.rowCount, 2);
          assert.ok(jobs.rows.some((row) => row.logical_key.endsWith(':retry:1')));
        } finally {
          await admin.query('DELETE FROM telecom.outbox WHERE logical_key LIKE $1', [
            `%:facility:${facilityId}%`,
          ]);
          await admin.query('DELETE FROM directory.facilities WHERE id=$1', [facilityId]);
        }
      },
    );

    await t.test(
      'USSD Exit revokes the protected read session and cannot replay clinical data',
      async () => {
        await admin.query(
          `UPDATE healthaccess.patient_field_values SET value=$2 WHERE patient_id=$1 AND field_key='allergies'`,
          [
            patientId,
            JSON.stringify(
              Array.from({ length: 20 }, (_, index) => `Test-only allergy item ${index}`),
            ),
          ],
        );
        await admin.query(
          `INSERT INTO healthaccess.emergency_fields(patient_id,field_key,display_order)
      VALUES($1,'allergies',1) ON CONFLICT DO NOTHING`,
          [patientId],
        );
        const handler = createUssdHandler({
          repository,
          crypto,
          config,
          createEngine: createUssdEngine,
        });
        const body = {
          sessionId: `${prefix}-back`,
          phoneNumber: phone,
          serviceCode: '*test#',
          text: '',
        };
        await handler(body, randomUUID());
        await handler({ ...body, text: '2' }, randomUUID());
        const codePath = `2*${patientCode}`;
        assert.match(await handler({ ...body, text: codePath }, randomUUID()), /^CON/);
        const exit = { ...body, text: `${codePath}*0` };
        assert.equal(await handler(exit, randomUUID()), 'END Closed.');
        assert.equal(await handler(exit, randomUUID()), 'END Closed.');
        const next = await handler({ ...body, text: `${codePath}*0*1` }, randomUUID());
        assert.match(next, /^END Session/);
        const saved = await admin.query(
          'SELECT ended_at,read_session_id FROM telecom.ussd_sessions WHERE provider_session_id=$1',
          [body.sessionId],
        );
        assert.equal(saved.rows[0].ended_at, null);
        assert.equal(saved.rows[0].read_session_id, null);
      },
    );
  },
);
