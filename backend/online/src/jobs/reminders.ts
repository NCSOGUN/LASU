import { Prisma } from '@prisma/client';
import { crypto } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { sendPushToTokens, type PushDeliveryResult, type PushMessage } from '../services/fcm.js';
import { enqueueTextSms } from '../services/sms.js';

export interface ReminderSmsInput {
  logicalKey: string;
  phone: string;
  text: string;
}

export type ReminderSmsSender = (input: ReminderSmsInput) => Promise<boolean | void>;
export type ReminderPushSender = (
  tokens: string[],
  message: PushMessage,
) => Promise<PushDeliveryResult>;

export interface ReminderDeps {
  enqueueSms: ReminderSmsSender;
  sendPush: ReminderPushSender;
}

export interface ReminderCycleOptions {
  limit?: number;
  deps?: Partial<ReminderDeps>;
  scheduleIds?: string[];
}

export interface ReminderCycleResult {
  claimed: number;
  notified: number;
  deferred: number;
  failed: number;
  skipped?: boolean;
}

export interface ReminderJob {
  intervalSeconds: number;
  stop: () => void;
}

interface ClaimedMoment {
  id: string;
  medication_schedule_id: string;
  drug: string | null;
  dose: string | null;
  frequency: string | null;
  time: Date;
}

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_INTERVAL_SECONDS = 60;
const LEASE_SECONDS = 300;
const PHONE_PURPOSES = ['sms-recipient', 'channel-link-phone', 'channel-link', 'phone-link'] as const;

const defaultDeps: ReminderDeps = {
  enqueueSms: (input) => enqueueTextSms(input),
  sendPush: (tokens, message) => sendPushToTokens(tokens, message),
};

let cycleRunning = false;
let activeJob: ReminderJob | undefined;

function formatMomentTime(time: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(time);
}

export function buildReminderText(moment: {
  drug: string | null;
  dose: string | null;
  time: Date;
}) {
  const drug = moment.drug?.trim() || 'your medication';
  const dose = moment.dose?.trim();
  return `Medication reminder: take ${drug}${dose ? ` (${dose})` : ''} at ${formatMomentTime(moment.time)}.`;
}

function decryptPhone(envelope: string): string | null {
  for (const purpose of PHONE_PURPOSES) {
    try {
      const phone = crypto.decrypt<string>(envelope, purpose);
      if (typeof phone === 'string' && phone.length > 0) return phone;
    } catch {
      continue;
    }
  }
  return null;
}

async function claimDueMoments(limit: number, scheduleIds?: string[]): Promise<ClaimedMoment[]> {
  const scheduleFilter =
    scheduleIds && scheduleIds.length > 0
      ? Prisma.sql`AND medication_schedule_id IN (${Prisma.join(
          scheduleIds.map((id) => Prisma.sql`${id}::uuid`),
        )})`
      : Prisma.empty;

  return prisma.$queryRaw<ClaimedMoment[]>(Prisma.sql`
    UPDATE medication_moments AS m
    SET notified_at = now()
    WHERE m.id IN (
      SELECT id
      FROM medication_moments
      WHERE status = 'PENDING'::"MedicationStatus"
        AND notified_user = false
        AND time <= now()
        AND time > now() - interval '1 day'
        AND (notified_at IS NULL OR notified_at < now() - make_interval(secs => ${LEASE_SECONDS}))
        ${scheduleFilter}
      ORDER BY time ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING m.id, m.medication_schedule_id, m.drug, m.dose, m.frequency, m.time
  `);
}

async function deliverMoment(
  moment: ClaimedMoment,
  deps: ReminderDeps,
): Promise<{ delivered: boolean; smsAttempted: number; pushAttempted: boolean }> {
  const schedule = await prisma.medicationSchedule.findUnique({
    where: { id: moment.medication_schedule_id },
    select: {
      id: true,
      patient_id: true,
      patient: { select: { account_id: true } },
    },
  });
  if (!schedule) {
    return { delivered: false, smsAttempted: 0, pushAttempted: false };
  }

  const now = new Date();
  const [links, tokens] = await Promise.all([
    prisma.channelLink.findMany({
      where: {
        patient_id: schedule.patient_id,
        revoked_at: null,
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      select: { phone_envelope: true, phone_digest: true },
    }),
    prisma.notificationToken.findMany({
      where: { account_id: schedule.patient.account_id },
      select: { token: true },
    }),
  ]);

  const text = buildReminderText(moment);
  let smsAttempted = 0;
  let smsSucceeded = 0;

  for (const link of links) {
    const phone = decryptPhone(link.phone_envelope);
    if (!phone) continue;
    smsAttempted += 1;
    try {
      await deps.enqueueSms({
        logicalKey: `medication:${moment.id}:${link.phone_digest}`,
        phone,
        text,
      });
      smsSucceeded += 1;
    } catch {
      continue;
    }
  }

  let pushAttempted = tokens.length > 0;
  let pushSucceeded = false;

  if (tokens.length > 0) {
    try {
      const result = await deps.sendPush(
        tokens.map((row) => row.token),
        {
          title: 'Medication reminder',
          body: text,
          data: { momentId: moment.id, scheduleId: schedule.id },
        },
      );
      if (!result.enabled) {
        pushAttempted = false;
      } else if (result.sent > 0) {
        pushSucceeded = true;
      }
    } catch {
      pushAttempted = true;
    }
  }

  const attempted = smsAttempted > 0 || pushAttempted;
  const succeeded = smsSucceeded > 0 || pushSucceeded;
  return { delivered: attempted && succeeded, smsAttempted, pushAttempted };
}

export async function runReminderCycle(
  options: ReminderCycleOptions = {},
): Promise<ReminderCycleResult> {
  if (cycleRunning) {
    return { claimed: 0, notified: 0, deferred: 0, failed: 0, skipped: true };
  }

  cycleRunning = true;
  try {
    const deps: ReminderDeps = { ...defaultDeps, ...options.deps };
    const limit = options.limit && options.limit > 0 ? options.limit : DEFAULT_BATCH_SIZE;
    const moments = await claimDueMoments(limit, options.scheduleIds);

    let notified = 0;
    let deferred = 0;
    let failed = 0;

    for (const moment of moments) {
      try {
        const outcome = await deliverMoment(moment, deps);
        if (outcome.delivered) {
          await prisma.medicationMoment.update({
            where: { id: moment.id },
            data: { notified_user: true, notified_at: new Date() },
          });
          notified += 1;
        } else {
          await prisma.medicationMoment.update({
            where: { id: moment.id },
            data: { notified_at: null },
          });
          deferred += 1;
        }
      } catch (error) {
        failed += 1;
        await prisma.medicationMoment
          .update({ where: { id: moment.id }, data: { notified_at: null } })
          .catch(() => undefined);
        logger.warn(
          { err: error instanceof Error ? error.message : 'unknown', moment_id: moment.id },
          'medication reminder delivery failed',
        );
      }
    }

    logger.info(
      { claimed: moments.length, notified, deferred, failed },
      'medication reminder cycle completed',
    );
    return { claimed: moments.length, notified, deferred, failed };
  } finally {
    cycleRunning = false;
  }
}

export function startReminderJob(): ReminderJob {
  if (activeJob) return activeJob;

  const configured = Number.parseInt(process.env.REMINDER_INTERVAL_SECONDS ?? '', 10);
  const intervalSeconds =
    Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_INTERVAL_SECONDS;

  const run = () => {
    void runReminderCycle().catch((error) => {
      logger.error(
        { err: error instanceof Error ? error.message : 'unknown' },
        'medication reminder cycle crashed',
      );
    });
  };

  const timer = setInterval(run, intervalSeconds * 1000);
  timer.unref();
  logger.info({ intervalSeconds }, 'medication reminder job started');

  const job: ReminderJob = {
    intervalSeconds,
    stop: () => {
      clearInterval(timer);
      if (activeJob === job) activeJob = undefined;
    },
  };
  activeJob = job;

  run();
  return job;
}

export function resetReminderJobForTests() {
  activeJob?.stop();
  activeJob = undefined;
  cycleRunning = false;
}
