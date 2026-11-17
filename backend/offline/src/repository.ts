import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Config } from './config.js';
import type { Crypto } from './security/crypto.js';
import type { InboundSms, UssdCallback, UssdEvent } from './app.js';
import type {
  Area,
  Facility,
  Projection,
  Service,
  SmsContext,
  SmsReply,
  WebLead,
} from './types.js';
import type { SmsRepository } from './channels/sms.js';
import type { UssdRepository, UssdSession, UssdResult } from './channels/ussd.js';

type Database = pg.Pool | pg.PoolClient;

function deliveryStatus(raw: string): string {
  const status = raw.toLowerCase();
  if (status === 'success' || status === 'delivered') return 'delivered';
  if (['rejected', 'failed', 'undelivered'].includes(status)) return 'failed';
  if (['sent', 'submitted', 'buffered'].includes(status)) return 'accepted';
  if (status === 'expired') return 'expired';
  return 'unknown';
}

interface Actor {
  phone_digest: string;
  request_id: string;
  session_id?: string;
}
export interface InboxJob {
  id: string;
  phone_digest: string;
  body_envelope: string;
  attempts: number;
  claimed_by: string;
}
export interface OutboxJob {
  id: string;
  kind: SmsReply['kind'];
  recipient_phone_envelope: string;
  render_ref: SmsReply | { envelope: string; allowAfterStop?: boolean };
  attempts: number;
  claimed_by: string;
}
export type StoredUssdSession = UssdSession & {
  inputDepth: number;
  inputFingerprint: string | null;
};
export type SessionRepository = UssdRepository & {
  saveSession(result: UssdResult & { inputDepth: number; inputFingerprint: string }): Promise<void>;
};

export class Repository {
  readonly pool: pg.Pool;

  constructor(
    private config: Config,
    private crypto: Crypto,
    pool?: pg.Pool,
  ) {
    this.pool =
      pool ||
      new pg.Pool({
        connectionString: config.databaseUrl,
        max: config.databasePoolSize,
        connectionTimeoutMillis: 2000,
        statement_timeout: config.databaseTimeoutMs,
        idle_in_transaction_session_timeout: 60000,
      });
    // Prevent an idle client error from terminating the worker or leaking SQL.
    this.pool.on('error', () => console.error({ event: 'database_connection_error' }));
  }

  async ready(): Promise<void> {
    const result = await this.pool.query<{ safe: boolean }>(`SELECT
      pg_has_role(session_user, 'healthaccess_telecom', 'member')
      AND NOT pg_has_role(session_user, 'healthaccess_web', 'member')
      AND NOT pg_has_role(session_user, 'healthaccess_owner', 'member')
      AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = session_user) AS safe`);
    if (!result.rows[0]?.safe) throw new Error('Use a restricted telecom database login');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async call<T>(
    name: string,
    args: unknown[] = [],
    database: Database = this.pool,
  ): Promise<T> {
    // Names are internal constants, never supplied by a callback or model.
    if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid routine name');
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
    const result = await database.query<{ data: T }>(
      `SELECT healthaccess_api.${name}(${placeholders}) AS data`,
      args,
    );
    return result.rows[0].data;
  }

  async takeRateLimit(
    scope: string,
    limit: number,
    seconds: number,
    database: Database = this.pool,
  ): Promise<boolean> {
    const result = await database.query<{ hits: number }>(
      `INSERT INTO telecom.rate_limits(scope, window_start, hits)
      VALUES ($1, to_timestamp(floor(extract(epoch FROM clock_timestamp()) / $2) * $2), 1)
      ON CONFLICT (scope, window_start) DO UPDATE SET hits = telecom.rate_limits.hits + 1
      RETURNING hits`,
      [scope, seconds],
    );
    return result.rows[0].hits <= limit;
  }

  async acceptSms(body: InboundSms, requestId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO telecom.sms_inbox
      (id, provider, provider_message_id, phone_digest, body_envelope, status, expires_at)
      VALUES ($1, 'africastalking', $2, $3, $4, 'queued', now() + interval '1 day')
      ON CONFLICT (provider, provider_message_id) DO NOTHING`,
      [
        randomUUID(),
        body.id,
        this.crypto.digestPhone(body.from),
        this.crypto.encrypt({ ...body, requestId }, 'sms-inbox'),
      ],
    );
  }

  async acceptDelivery(body: { id: string; status: string }): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `INSERT INTO telecom.delivery_events(provider_message_id, status, event_fingerprint)
        VALUES ($1, $2, $3) ON CONFLICT (event_fingerprint) DO NOTHING`,
        [
          body.id,
          deliveryStatus(body.status),
          this.crypto.fingerprint(JSON.stringify([body.id, body.status])),
        ],
      );
      await this.reconcileDelivery(client);
    });
  }

  private async reconcileDelivery(database: Database): Promise<void> {
    await database.query(`UPDATE telecom.outbox AS job SET status = 'delivered'
      WHERE job.status <> 'delivered' AND EXISTS (SELECT 1 FROM telecom.delivery_events AS event
        WHERE event.provider_message_id = job.provider_message_id AND event.status = 'delivered')`);
    await database.query(`UPDATE telecom.outbox AS job SET status = 'failed'
      WHERE job.status IN ('accepted', 'unknown', 'sending') AND EXISTS (
        SELECT 1 FROM telecom.delivery_events AS event WHERE event.provider_message_id = job.provider_message_id
        AND event.status = 'failed')`);
    await database.query(`UPDATE telecom.outbox AS job SET status = 'unknown'
      WHERE job.status='accepted' AND EXISTS (SELECT 1 FROM telecom.delivery_events AS event
        WHERE event.provider_message_id=job.provider_message_id AND event.status IN ('unknown','expired'))`);
  }

  private actorRepository(
    actor: Actor,
    database: Database,
    currentPhone?: string,
    careContext?: { serviceCode?: string; areaId?: string; radiusKm?: number },
  ): SmsRepository & UssdRepository {
    const readEmergency = async (digest: string): Promise<Projection> => {
      const limit = actor.session_id ? 60 : this.config.lookupRatePerMinute;
      const allowed = await this.takeRateLimit(
        `lookup-phone:${actor.phone_digest}`,
        limit,
        60,
        database,
      );
      const targetAllowed = await this.takeRateLimit(`lookup-target:${digest}`, 60, 60, database);
      if (!allowed || !targetAllowed) return { available: false };
      return this.call(
        actor.session_id ? 'ussd_read_emergency_summary' : 'sms_read_emergency_summary',
        [digest, actor],
        database,
      );
    };
    return {
      listServices: () => this.call<Service[]>('list_services', [], database),
      findAreas: (query) => this.call<Area[]>('find_areas', [query, 5], database),
      findFacilities: (service, areaId, radius) =>
        this.call<Facility[]>('find_facilities', [service, areaId, radius, 3], database),
      getFacility: async (id, serviceCode, areaId, radiusKm) => {
        const current = await this.call<Facility[]>(
          'find_facilities',
          [serviceCode, areaId, radiusKm, 10],
          database,
        );
        return current.find((facility) => facility.id === id) || null;
      },
      readEmergency,
      openGrant: async (patientDigest, grantDigest) => {
        if (
          !(await this.takeRateLimit(
            `grant:${actor.phone_digest}`,
            this.config.lookupRatePerMinute,
            60,
            database,
          ))
        )
          return { available: false };
        return this.call<Projection>(
          'ussd_open_granted_record',
          [patientDigest, grantDigest, actor],
          database,
        );
      },
      readGrant: (id) => this.call<Projection>('ussd_read_granted_record', [id, actor], database),
      closeReadSession: async (id) => {
        await this.call('ussd_close_granted_record', [id, actor], database);
      },
      findProfileConsent: () =>
        this.call<{ id: string } | null>('telecom_find_profile_consent', [actor], database),
      readMatchingContext: (id) =>
        this.call<{ available: boolean }>('telecom_read_profile_context', [id, actor], database),
      setOptOut: (optedOut) => this.setOptOut(database, actor.phone_digest, optedOut),
      storeWebLeads: async (leads) =>
        (
          await this.call<{ available: boolean; ids: string[] }>(
            'sms_store_web_leads',
            [JSON.stringify(leads), actor],
            database,
          )
        ).ids || [],
      recordReferral: async (referral) => {
        await this.call(
          'telecom_record_referral',
          [
            referral.serviceCode,
            referral.areaId,
            referral.facilities.map((f) => f.id),
            referral.consentId,
            actor,
          ],
          database,
        );
      },
      queueFacilitySms: async (facilityId) => {
        if (!actor.session_id || !currentPhone) return false;
        if (!careContext?.serviceCode || !careContext.areaId) return false;
        const baseKey = `ussd:${actor.session_id}:facility:${facilityId}`;
        const previous = await database.query<{ status: string; logical_key: string }>(
          `SELECT status, logical_key FROM telecom.outbox
          WHERE logical_key=$1 OR logical_key LIKE $2 ORDER BY created_at`,
          [baseKey, `${baseKey}:retry:%`],
        );
        const statuses = previous.rows.map((row) => row.status);
        if (
          statuses.some((status) => ['queued', 'sending', 'accepted', 'delivered'].includes(status))
        )
          return true;
        // An unknown send may already have reached the phone. Do not resend it automatically.
        if (statuses.includes('unknown')) return false;
        const retries = previous.rows.filter((row) =>
          row.logical_key.startsWith(`${baseKey}:retry:`),
        ).length;
        if (retries >= 3) return false;
        const logicalKey = previous.rows.length ? `${baseKey}:retry:${retries + 1}` : baseKey;
        return this.queueReply(database, logicalKey, currentPhone, {
          kind: 'facility',
          id: facilityId,
          serviceCode: careContext.serviceCode,
          areaId: careContext.areaId,
          radiusKm: careContext.radiusKm || this.config.searchRadiusKm,
        });
      },
    };
  }

  async withUssdSession(
    body: UssdCallback,
    requestId: string,
    work: (session: StoredUssdSession | null, scoped: SessionRepository) => Promise<string>,
  ): Promise<string> {
    return this.transaction(async (client) => {
      await client.query(
        `INSERT INTO telecom.ussd_sessions(id, provider, provider_session_id, phone_digest,
        service_code, state, context, path_depth, expires_at)
        VALUES ($1,'africastalking',$2,$3,$4,'MAIN','{}',-1, now() + $5 * interval '1 second')
        ON CONFLICT (provider, provider_session_id) DO NOTHING`,
        [
          randomUUID(),
          body.sessionId,
          this.crypto.digestPhone(body.phoneNumber),
          body.serviceCode,
          this.config.ussdSessionTtlSeconds,
        ],
      );
      const result = await client.query(
        `SELECT * FROM telecom.ussd_sessions WHERE provider = 'africastalking'
        AND provider_session_id = $1 FOR UPDATE`,
        [body.sessionId],
      );
      const row = result.rows[0];
      if (!row || row.ended_at) return 'END Session ended. Please redial.';
      const session: StoredUssdSession = {
        id: row.id,
        providerSessionId: body.sessionId,
        phoneDigest: row.phone_digest,
        serviceCode: row.service_code,
        state: row.state,
        context: row.context,
        expiresAt: row.expires_at,
        readSessionId: row.read_session_id,
        inputDepth: row.path_depth,
        inputFingerprint: row.path_digest,
      };
      const actor = { session_id: row.id, phone_digest: row.phone_digest, request_id: requestId };
      const scoped: SessionRepository = {
        ...this.actorRepository(actor, client, body.phoneNumber, row.context),
        saveSession: async (next) => {
          await client.query(
            `UPDATE telecom.ussd_sessions SET state=$2, context=$3, path_depth=$4,
            path_digest=$5, read_session_id=$6, version=version+1, updated_at=now() WHERE id=$1`,
            [
              row.id,
              next.state,
              JSON.stringify(next.context),
              next.inputDepth,
              next.inputFingerprint,
              next.readSessionId || null,
            ],
          );
        },
      };
      return work(session, scoped);
    });
  }

  async endUssdSession(body: UssdEvent): Promise<void> {
    await this.pool.query(
      `UPDATE telecom.ussd_sessions SET ended_at=now(), state='END', context='{}',
      read_session_id=NULL WHERE provider='africastalking' AND provider_session_id=$1
      AND ($2::text IS NULL OR phone_digest=$2)`,
      [body.sessionId, body.phoneNumber ? this.crypto.digestPhone(body.phoneNumber) : null],
    );
  }

  async claimInbox(workerId: string): Promise<InboxJob | null> {
    const result = await this.pool.query<InboxJob>(
      `UPDATE telecom.sms_inbox SET status='processing',
      claimed_by=$1, lease_until=now()+$2 * interval '1 second', attempts=attempts+1
      WHERE id=(SELECT id FROM telecom.sms_inbox AS candidate WHERE expires_at>now() AND attempts<$3
        AND ((status='queued' AND next_attempt_at<=now()) OR (status='processing' AND lease_until<now()))
        AND NOT EXISTS (SELECT 1 FROM telecom.sms_inbox AS earlier WHERE earlier.phone_digest=candidate.phone_digest
          AND earlier.status IN ('queued','processing') AND (earlier.created_at,earlier.id)<(candidate.created_at,candidate.id))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [workerId, this.config.workerLeaseSeconds, this.config.workerMaxAttempts],
    );
    return result.rows[0] || null;
  }

  async processInbox(
    job: InboxJob,
    handle: (
      body: InboundSms,
      repository: SmsRepository,
      conversation: { state: string; context: SmsContext },
    ) => Promise<{ state: string; context: SmsContext; replies: SmsReply[] }>,
  ): Promise<void> {
    const ownership = await this.pool.query(
      `SELECT id FROM telecom.sms_inbox WHERE id=$1 AND claimed_by=$2 AND status='processing' AND lease_until>now()`,
      [job.id, job.claimed_by],
    );
    if (!ownership.rowCount) return;
    const body = this.crypto.decrypt<InboundSms & { requestId: string }>(
      job.body_envelope,
      'sms-inbox',
    );
    const found = await this.pool.query<{
      state: string;
      context: SmsContext;
      expires_at: Date;
      version: number;
    }>(
      `SELECT state,context,expires_at,version FROM telecom.sms_conversations WHERE phone_digest=$1`,
      [job.phone_digest],
    );
    const existing = found.rows[0];
    const conversation =
      existing && existing.expires_at > new Date() ? existing : { state: 'idle', context: {} };
    const scoped = this.actorRepository(
      { phone_digest: job.phone_digest, request_id: body.requestId },
      this.pool,
    );
    let optOut: boolean | undefined;
    scoped.setOptOut = async (value) => {
      optOut = value;
    };
    const allowed =
      /^STOP$/i.test(body.text.trim()) ||
      (await this.takeRateLimit(
        `sms-phone:${job.phone_digest}`,
        this.config.phoneRatePerMinute,
        60,
      ));
    // External AI/search calls run without an open DB transaction or pool lease.
    const result = allowed
      ? await handle(body, scoped, conversation)
      : {
          state: 'idle',
          context: {},
          replies: [
            {
              kind: 'text' as const,
              text: 'Too many messages. Please wait a minute and try again.',
            },
          ],
        };

    await this.transaction(async (client) => {
      const currentJob = await client.query(
        `SELECT id FROM telecom.sms_inbox WHERE id=$1 AND claimed_by=$2 AND status='processing' AND lease_until>now() FOR UPDATE`,
        [job.id, job.claimed_by],
      );
      if (!currentJob.rowCount) return;
      const current = await client.query<{ version: number }>(
        'SELECT version FROM telecom.sms_conversations WHERE phone_digest=$1 FOR UPDATE',
        [job.phone_digest],
      );
      if (current.rows[0]?.version !== existing?.version)
        throw new Error('Conversation changed while processing');
      if (optOut !== undefined) await this.setOptOut(client, job.phone_digest, optOut);
      await client.query(
        `INSERT INTO telecom.sms_conversations(phone_digest,state,context,expires_at)
        VALUES($1,$2,$3,now()+$4*interval '1 second') ON CONFLICT(phone_digest) DO UPDATE
        SET state=$2,context=$3,expires_at=excluded.expires_at,version=telecom.sms_conversations.version+1,updated_at=now()`,
        [
          job.phone_digest,
          result.state,
          JSON.stringify(result.context),
          this.config.smsConversationTtlSeconds,
        ],
      );
      for (const [index, reply] of result.replies.entries())
        await this.queueReply(client, `sms:${job.id}:${index}`, body.from, reply);
      await client.query(
        `UPDATE telecom.sms_inbox SET status='processed',lease_until=NULL WHERE id=$1`,
        [job.id],
      );
    });
  }

  private async setOptOut(
    database: Database,
    phoneDigest: string,
    optedOut: boolean,
  ): Promise<void> {
    await database.query(
      `INSERT INTO telecom.channel_preferences(phone_digest, opted_out) VALUES ($1, $2)
      ON CONFLICT (phone_digest) DO UPDATE SET opted_out=$2,updated_at=now()`,
      [phoneDigest, optedOut],
    );
    if (optedOut)
      await database.query(
        `UPDATE telecom.outbox SET status='expired'
      WHERE status='queued' AND recipient_phone_digest=$1`,
        [phoneDigest],
      );
  }

  private async queueReply(
    client: Database,
    logicalKey: string,
    phone: string,
    reply: SmsReply,
  ): Promise<boolean> {
    const reference =
      reply.kind === 'text'
        ? {
            envelope: this.crypto.encrypt(reply.text, 'sms-text'),
            allowAfterStop: !!reply.allowAfterStop,
          }
        : reply;
    const saved = await client.query(
      `INSERT INTO telecom.outbox(id,logical_key,kind,recipient_phone_envelope,render_ref,status,expires_at,recipient_phone_digest)
      VALUES($1,$2,$3,$4,$5,'queued',now()+$6*interval '1 second',$7) ON CONFLICT(logical_key) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        logicalKey,
        reply.kind,
        this.crypto.encrypt(phone, 'sms-recipient'),
        JSON.stringify(reference),
        this.config.smsReplyTtlSeconds,
        this.crypto.digestPhone(phone),
      ],
    );
    if (saved.rowCount) return true;
    const existing = await client.query<{ status: string }>(
      'SELECT status FROM telecom.outbox WHERE logical_key=$1',
      [logicalKey],
    );
    return ['queued', 'sending', 'accepted', 'delivered'].includes(existing.rows[0]?.status || '');
  }

  async failInbox(job: InboxJob): Promise<void> {
    await this.pool.query(
      `UPDATE telecom.sms_inbox SET status=CASE WHEN attempts >= $3 THEN 'failed' ELSE 'queued' END,
      next_attempt_at=now()+least(300,power(2,attempts)) * interval '1 second',lease_until=NULL
      WHERE id=$1 AND claimed_by=$2 AND status='processing'`,
      [job.id, job.claimed_by, this.config.workerMaxAttempts],
    );
  }

  async claimOutbox(workerId: string): Promise<OutboxJob | null> {
    const result = await this.pool.query<OutboxJob>(
      `UPDATE telecom.outbox SET status='sending',claimed_by=$1,
      lease_until=now()+$2*interval '1 second',attempts=attempts+1 WHERE id=(SELECT id FROM telecom.outbox
      WHERE status='queued' AND next_attempt_at<=now() AND expires_at>now() AND attempts<$3
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [workerId, this.config.workerLeaseSeconds, this.config.workerMaxAttempts],
    );
    return result.rows[0] || null;
  }

  async renderOutbox(job: OutboxJob): Promise<{
    phone: string;
    reply: SmsReply;
    suppressed?: boolean;
    projection?: Projection;
    facility?: Facility | null;
    lead?: WebLead | null;
  }> {
    const phone = this.crypto.decrypt<string>(job.recipient_phone_envelope, 'sms-recipient');
    const reply =
      job.kind === 'text' && 'envelope' in job.render_ref
        ? {
            kind: 'text' as const,
            text: this.crypto.decrypt<string>(job.render_ref.envelope, 'sms-text'),
            allowAfterStop: job.render_ref.allowAfterStop,
          }
        : (job.render_ref as SmsReply);
    const actor = { phone_digest: this.crypto.digestPhone(phone), request_id: job.id };
    const preference = await this.pool.query<{ opted_out: boolean }>(
      'SELECT opted_out FROM telecom.channel_preferences WHERE phone_digest=$1',
      [actor.phone_digest],
    );
    if (preference.rows[0]?.opted_out && !(reply.kind === 'text' && reply.allowAfterStop))
      return { phone, reply, suppressed: true };
    if (reply.kind === 'emergency')
      return {
        phone,
        reply,
        projection: await this.call('sms_read_emergency_summary', [reply.codeDigest, actor]),
      };
    if (reply.kind === 'facility') {
      const current =
        reply.serviceCode && reply.areaId
          ? await this.call<Facility[]>('find_facilities', [
              reply.serviceCode,
              reply.areaId,
              reply.radiusKm || this.config.searchRadiusKm,
              10,
            ])
          : [];
      return {
        phone,
        reply,
        facility: current.find((facility) => facility.id === reply.id) || null,
      };
    }
    if (reply.kind === 'web_lead')
      return { phone, reply, lead: await this.call('get_web_lead', [reply.id]) };
    return { phone, reply };
  }

  async finishOutbox(
    job: OutboxJob,
    result: { state: string; providerMessageId: string | null; retryable: boolean },
  ): Promise<void> {
    const status =
      result.retryable && job.attempts < this.config.workerMaxAttempts ? 'queued' : result.state;
    await this.transaction(async (client) => {
      await client.query(
        `UPDATE telecom.outbox SET status=$3,provider_message_id=COALESCE($4,provider_message_id),lease_until=NULL,
        next_attempt_at=now()+least(300,power(2,attempts))*interval '1 second' WHERE id=$1 AND claimed_by=$2 AND status='sending'`,
        [job.id, job.claimed_by, status, result.providerMessageId],
      );
      await this.reconcileDelivery(client);
    });
  }

  async findReviewedContent(query: string): Promise<unknown[]> {
    return this.call('find_reviewed_content', [query, 3]);
  }

  async maintain(): Promise<void> {
    await this.transaction(async (client) => {
      // Background retention is not constrained by the callback's USSD query budget.
      await client.query("SET LOCAL statement_timeout = '5s'");
      // A sender crash might have happened after provider acceptance. Never blindly resend.
      await client.query(
        `UPDATE telecom.outbox SET status='unknown',lease_until=NULL WHERE status='sending' AND lease_until<now()`,
      );
      await client.query(
        `UPDATE telecom.outbox SET status='expired' WHERE status='queued' AND expires_at<=now()`,
      );
      await client.query(
        `UPDATE telecom.sms_inbox SET status='expired' WHERE status='queued' AND expires_at<=now()`,
      );
      await client.query(
        `UPDATE telecom.sms_inbox SET status='failed',lease_until=NULL
        WHERE status='processing' AND lease_until<now() AND attempts >= $1`,
        [this.config.workerMaxAttempts],
      );
      await client.query(
        `UPDATE telecom.ussd_sessions SET state='END',context='{}',read_session_id=NULL,ended_at=COALESCE(ended_at,now()) WHERE expires_at<=now()`,
      );
      await client.query(
        `DELETE FROM telecom.ussd_sessions WHERE expires_at<now()-$1*interval '1 second'`,
        [this.config.ussdRetentionSeconds],
      );
      await client.query(
        `DELETE FROM telecom.sms_inbox WHERE created_at<now()-$1*interval '1 day' AND status<>'processing'`,
        [this.config.smsBodyRetentionDays],
      );
      await client.query(
        `DELETE FROM telecom.outbox WHERE created_at<now()-$1*interval '1 day' AND status<>'sending'`,
        [this.config.smsBodyRetentionDays],
      );
      await client.query(
        `DELETE FROM telecom.delivery_events WHERE created_at<now()-$1*interval '1 day'`,
        [this.config.deliveryRetentionDays],
      );
      await client.query(
        `DELETE FROM telecom.rate_limits WHERE window_start<now()-interval '1 hour'`,
      );
      await client.query(`DELETE FROM telecom.sms_conversations WHERE expires_at<now()`);
      await this.reconcileDelivery(client);
    });
  }
}
