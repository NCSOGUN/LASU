import { z } from 'zod';

export const medicationTimeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export const scheduledMedicationSchema = z.object({
  drug: z.string().min(1),
  dose: z.string().min(1),
  frequency: z.string().min(1),
  times: z.array(medicationTimeSchema).min(1),
});

function isValidDateOnly(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format')
  .refine(isValidDateOnly, 'Expected a valid calendar date');

export const generatedScheduleSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  summary: z.string().min(1),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  medications: z.array(scheduledMedicationSchema).min(1),
  err: z.string().optional(),
});

export const generatedAdditionSchema = z.object({
  summary: z.string().optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  medications: z.array(scheduledMedicationSchema).min(1),
  err: z.string().optional(),
});

export type GeneratedSchedule = z.infer<typeof generatedScheduleSchema>;
export type GeneratedAddition = z.infer<typeof generatedAdditionSchema>;
export type ScheduledMedicationInput = z.infer<typeof scheduledMedicationSchema>;
