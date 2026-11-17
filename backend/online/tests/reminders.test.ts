import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { crypto } from '../src/config.js';
import { prisma } from '../src/db.js';
import {
  buildReminderText,
  runReminderCycle,
  type ReminderDeps,
  type ReminderSmsInput,
} from '../src/jobs/reminders.js';
import type { PushDeliveryResult, PushMessage } from '../src/services/fcm.js';

const accountIds: string[] = [];
const phone = '+2348012345678';
const phoneDigest = crypto.digestPhone(phone);

interface TestPatient {
  accountId: string;
  patientId: string;
}

async function createPatient(): Promise<TestPatient> {
  const account = await prisma.account.create({
    data: {
      email: `reminder-test-${randomUUID()}@example.test`,
      password_hash: 'not-a-real-hash',
      display_name: 'Reminder Test Patient',
      status: 'ACTIVE',
      roles: { create: { role: 'PATIENT' } },
    },
  });
  accountIds.push(account.id);
  const profile = await prisma.patientProfile.create({ data: { account_id: account.id } });
  return { accountId: account.id, patientId: profile.id };
}

async function addPhone(patientId: string) {
  await prisma.channelLink.create({
    data: {
      patient_id: patientId,
      phone_envelope: crypto.encrypt(phone, 'sms-recipient'),
      phone_digest: phoneDigest,
    },
  });
}

async function addDevice(accountId: string) {
  const token = `fcm-${randomUUID()}`;
  await prisma.notificationToken.create({
    data: { account_id: accountId, token, platform: 'ANDROID' },
  });
  return token;
}

async function createMoment(
  patientId: string,
  options: { minutesFromNow?: number; notified?: boolean; drug?: string; dose?: string } = {},
) {
  const schedule = await prisma.medicationSchedule.create({
    data: {
      patient_id: patientId,
      summary: 'Reminder test schedule',
      medications: [],
    },
  });
  const moment = await prisma.medicationMoment.create({
    data: {
      medication_schedule_id: schedule.id,
      drug: options.drug ?? 'Amoxicillin',
      dose: options.dose ?? '250mg',
      frequency: 'Once daily',
      time: new Date(Date.now() + (options.minutesFromNow ?? -10) * 60_000),
      notified_user: options.notified ?? false,
      ...(options.notified ? { notified_at: new Date() } : {}),
    },
  });
  return { schedule, moment };
}

interface FakeDeps {
  deps: ReminderDeps;
  sms: ReminderSmsInput[];
  push: Array<{ tokens: string[]; message: PushMessage }>;
}

function successfulDeps(): FakeDeps {
  const sms: ReminderSmsInput[] = [];
  const push: Array<{ tokens: string[]; message: PushMessage }> = [];
  const deps: ReminderDeps = {
    enqueueSms: async (input) => {
      sms.push(input);
      return true;
    },
    sendPush: async (tokens, message) => {
      push.push({ tokens, message });
      return { enabled: true, sent: tokens.length, failed: 0, invalidTokens: [] };
    },
  };
  return { deps, sms, push };
}

function failingDeps(options: { sms?: boolean; push?: boolean } = {}): FakeDeps {
  const sms: ReminderSmsInput[] = [];
  const push: Array<{ tokens: string[]; message: PushMessage }> = [];
  const deps: ReminderDeps = {
    enqueueSms: async (input) => {
      sms.push(input);
      if (options.sms !== false) throw new Error('sms unavailable');
      return true;
    },
    sendPush: async (tokens, message): Promise<PushDeliveryResult> => {
      push.push({ tokens, message });
      if (options.push !== false) throw new Error('push unavailable');
      return { enabled: true, sent: tokens.length, failed: 0, invalidTokens: [] };
    },
  };
  return { deps, sms, push };
}

test('medication reminder cycle', async (t) => {
  t.after(async () => {
    if (accountIds.length > 0) {
      await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    await prisma.$disconnect();
  });

  await t.test('delivers SMS and push once and marks the moment notified', async () => {
    const patient = await createPatient();
    await addPhone(patient.patientId);
    const token = await addDevice(patient.accountId);
    const { schedule, moment } = await createMoment(patient.patientId);
    const fake = successfulDeps();

    const first = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: fake.deps,
    });

    assert.equal(first.claimed, 1);
    assert.equal(first.notified, 1);
    assert.equal(first.deferred, 0);

    assert.equal(fake.sms.length, 1);
    assert.equal(fake.sms[0]!.logicalKey, `medication:${moment.id}:${phoneDigest}`);
    assert.equal(fake.sms[0]!.phone, phone);
    assert.match(fake.sms[0]!.text, /Amoxicillin/);
    assert.match(fake.sms[0]!.text, /250mg/);
    assert.match(fake.sms[0]!.text, /at \d{2}:\d{2}/);

    assert.equal(fake.push.length, 1);
    assert.deepEqual(fake.push[0]!.tokens, [token]);
    assert.equal(fake.push[0]!.message.data?.momentId, moment.id);

    const stored = await prisma.medicationMoment.findUnique({ where: { id: moment.id } });
    assert.equal(stored?.notified_user, true);
    assert.ok(stored?.notified_at instanceof Date);

    const second = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: fake.deps,
    });
    assert.equal(second.claimed, 0);
    assert.equal(fake.sms.length, 1);
    assert.equal(fake.push.length, 1);
  });

  await t.test('keeps a moment eligible when both channels fail', async () => {
    const patient = await createPatient();
    await addPhone(patient.patientId);
    await addDevice(patient.accountId);
    const { schedule, moment } = await createMoment(patient.patientId);
    const failing = failingDeps();

    const failedCycle = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: failing.deps,
    });

    assert.equal(failedCycle.claimed, 1);
    assert.equal(failedCycle.notified, 0);
    assert.equal(failedCycle.deferred, 1);
    assert.equal(failing.sms.length, 1);
    assert.equal(failing.push.length, 1);

    const afterFailure = await prisma.medicationMoment.findUnique({ where: { id: moment.id } });
    assert.equal(afterFailure?.notified_user, false);
    assert.equal(afterFailure?.notified_at, null);

    const retry = successfulDeps();
    const retriedCycle = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: retry.deps,
    });

    assert.equal(retriedCycle.claimed, 1);
    assert.equal(retriedCycle.notified, 1);
    assert.equal(retry.sms.length, 1);

    const afterRetry = await prisma.medicationMoment.findUnique({ where: { id: moment.id } });
    assert.equal(afterRetry?.notified_user, true);

    const afterSuccess = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: retry.deps,
    });
    assert.equal(afterSuccess.claimed, 0);
    assert.equal(retry.sms.length, 1);
  });

  await t.test('marks notified when only one channel succeeds', async () => {
    const patient = await createPatient();
    await addPhone(patient.patientId);
    await addDevice(patient.accountId);
    const { schedule, moment } = await createMoment(patient.patientId);
    const partial = failingDeps({ push: false });

    const cycle = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: partial.deps,
    });

    assert.equal(cycle.claimed, 1);
    assert.equal(cycle.notified, 1);
    assert.equal(partial.sms.length, 1);
    assert.equal(partial.push.length, 1);

    const stored = await prisma.medicationMoment.findUnique({ where: { id: moment.id } });
    assert.equal(stored?.notified_user, true);

    const second = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: partial.deps,
    });
    assert.equal(second.claimed, 0);
    assert.equal(partial.sms.length, 1);
  });

  await t.test('delivers to a phone-only patient without attempting push', async () => {
    const patient = await createPatient();
    await addPhone(patient.patientId);
    const { schedule, moment } = await createMoment(patient.patientId);
    const fake = successfulDeps();

    const cycle = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: fake.deps,
    });

    assert.equal(cycle.notified, 1);
    assert.equal(fake.sms.length, 1);
    assert.equal(fake.push.length, 0);

    const stored = await prisma.medicationMoment.findUnique({ where: { id: moment.id } });
    assert.equal(stored?.notified_user, true);
  });

  await t.test('defers when the patient has no delivery channels', async () => {
    const patient = await createPatient();
    const { schedule, moment } = await createMoment(patient.patientId);
    const fake = successfulDeps();

    const cycle = await runReminderCycle({
      scheduleIds: [schedule.id],
      deps: fake.deps,
    });

    assert.equal(cycle.claimed, 1);
    assert.equal(cycle.notified, 0);
    assert.equal(cycle.deferred, 1);
    assert.equal(fake.sms.length, 0);
    assert.equal(fake.push.length, 0);

    const stored = await prisma.medicationMoment.findUnique({ where: { id: moment.id } });
    assert.equal(stored?.notified_user, false);
    assert.equal(stored?.notified_at, null);
  });

  await t.test('skips notified, future and stale moments', async () => {
    const patient = await createPatient();
    await addPhone(patient.patientId);

    const notified = await createMoment(patient.patientId, { notified: true });
    const future = await createMoment(patient.patientId, { minutesFromNow: 60 });
    const stale = await createMoment(patient.patientId, { minutesFromNow: -60 * 24 * 2 });
    const fake = successfulDeps();

    const cycle = await runReminderCycle({
      scheduleIds: [notified.schedule.id, future.schedule.id, stale.schedule.id],
      deps: fake.deps,
    });

    assert.equal(cycle.claimed, 0);
    assert.equal(fake.sms.length, 0);
    assert.equal(fake.push.length, 0);
  });

  await t.test('formats reminder text with drug, dose and time', () => {
    const text = buildReminderText({
      drug: 'Ibuprofen',
      dose: '200mg',
      time: new Date('2026-11-17T08:30:00Z'),
    });
    assert.match(text, /Ibuprofen/);
    assert.match(text, /200mg/);
    assert.match(text, /at \d{2}:\d{2}/);
  });
});
