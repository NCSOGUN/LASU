import type { MedicationSchedule, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { AppError } from '../middleware/error.js';

export interface MedicationTime {
  hour: number;
  minute: number;
}

export interface ScheduledMedication {
  drug: string;
  dose: string;
  frequency: string;
  times: MedicationTime[];
}

export interface CreateScheduleInput {
  patientId: string;
  title?: string | null;
  description?: string | null;
  summary: string;
  medications: ScheduledMedication[];
  startDate: Date;
  endDate: Date;
}

function assertSchedule(input: CreateScheduleInput) {
  if (!input.medications.length) {
    throw new AppError(400, 'At least one medication is required', 'invalid_schedule');
  }
  if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime())) {
    throw new AppError(400, 'Invalid schedule dates', 'invalid_schedule');
  }
  if (input.endDate < input.startDate) {
    throw new AppError(400, 'End date must not precede start date', 'invalid_schedule');
  }
  for (const medication of input.medications) {
    if (!medication.drug || !medication.times.length) {
      throw new AppError(400, 'Every medication needs a name and times', 'invalid_schedule');
    }
    for (const time of medication.times) {
      if (
        !Number.isInteger(time.hour) ||
        !Number.isInteger(time.minute) ||
        time.hour < 0 ||
        time.hour > 23 ||
        time.minute < 0 ||
        time.minute > 59
      ) {
        throw new AppError(400, 'Invalid dose time', 'invalid_schedule');
      }
    }
  }
}

type MomentInput = Omit<Prisma.MedicationMomentCreateManyInput, 'medication_schedule_id'>;

function buildMoments(input: CreateScheduleInput) {
  const moments: MomentInput[] = [];
  let cursor = new Date(input.startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(input.endDate);
  end.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    for (const medication of input.medications) {
      for (const time of medication.times) {
        const at = new Date(cursor);
        at.setHours(time.hour, time.minute, 0, 0);
        moments.push({
          drug: medication.drug,
          dose: medication.dose,
          frequency: medication.frequency,
          time: at,
        });
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return moments;
}

export async function createScheduleWithMoments(input: CreateScheduleInput) {
  assertSchedule(input);
  const moments = buildMoments(input);

  return prisma.$transaction(async (tx) => {
    const schedule = await tx.medicationSchedule.create({
      data: {
        patient_id: input.patientId,
        title: input.title ?? null,
        description: input.description ?? null,
        summary: input.summary,
        medications: input.medications as unknown as Prisma.InputJsonValue,
        start_date: input.startDate,
        end_date: input.endDate,
      },
    });
    if (moments.length) {
      await tx.medicationMoment.createMany({
        data: moments.map((moment) => ({ ...moment, medication_schedule_id: schedule.id })),
      });
    }
    return schedule;
  });
}

export async function appendMedications(
  scheduleId: string,
  patientId: string,
  medications: ScheduledMedication[],
  startDate: Date,
  endDate: Date,
) {
  const schedule = await prisma.medicationSchedule.findFirst({
    where: { id: scheduleId, patient_id: patientId },
  });
  if (!schedule) throw new AppError(404, 'Medication schedule not found', 'not_found');

  const existing = (schedule.medications as unknown as ScheduledMedication[]) ?? [];
  const merged = [...existing, ...medications];
  const moments = buildMoments({
    patientId,
    summary: schedule.summary,
    medications,
    startDate,
    endDate,
  });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.medicationSchedule.update({
      where: { id: schedule.id },
      data: { medications: merged as unknown as Prisma.InputJsonValue },
    });
    if (moments.length) {
      await tx.medicationMoment.createMany({
        data: moments.map((moment) => ({ ...moment, medication_schedule_id: schedule.id })),
      });
    }
    return updated;
  });
}

export async function removeMedication(
  scheduleId: string,
  patientId: string,
  drug: string,
  from?: Date,
) {
  const schedule = await prisma.medicationSchedule.findFirst({
    where: { id: scheduleId, patient_id: patientId },
  });
  if (!schedule) throw new AppError(404, 'Medication schedule not found', 'not_found');

  const normalized = drug.trim().toLowerCase();
  const existing = (schedule.medications as unknown as ScheduledMedication[]) ?? [];
  const remaining = existing.filter(
    (medication) => medication.drug.trim().toLowerCase() !== normalized,
  );

  return prisma.$transaction(async (tx) => {
    const updated = await tx.medicationSchedule.update({
      where: { id: schedule.id },
      data: { medications: remaining as unknown as Prisma.InputJsonValue },
    });
    await tx.medicationMoment.deleteMany({
      where: {
        medication_schedule_id: schedule.id,
        drug: { equals: drug.trim(), mode: 'insensitive' },
        status: 'PENDING',
        ...(from ? { time: { gte: from } } : {}),
      },
    });
    return updated;
  });
}

export async function recomputeScheduleProgress(scheduleId: string) {
  const [total, taken, missed] = await Promise.all([
    prisma.medicationMoment.count({ where: { medication_schedule_id: scheduleId } }),
    prisma.medicationMoment.count({ where: { medication_schedule_id: scheduleId, status: 'TAKEN' } }),
    prisma.medicationMoment.count({ where: { medication_schedule_id: scheduleId, status: 'MISSED' } }),
  ]);
  const decided = taken + missed;
  const progress = decided === 0 ? 0 : Math.round((taken / decided) * 10000) / 100;
  return prisma.medicationSchedule.update({
    where: { id: scheduleId },
    data: { progress, score: total === 0 ? 100 : progress },
  });
}

export type { MedicationSchedule };
