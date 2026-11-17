import { z } from "zod";
import { idSchema, numericStringSchema, timestampSchema } from "./common";

export const doseTimeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export type DoseTime = z.infer<typeof doseTimeSchema>;

export const medicationEntrySchema = z
  .object({
    drug: z.string().min(1),
    dose: z.string().nullable().optional(),
    frequency: z.string().nullable().optional(),
    times: z.array(doseTimeSchema),
  })
  .loose();

export type MedicationEntry = z.infer<typeof medicationEntrySchema>;

export const scheduleSchema = z
  .object({
    id: idSchema,
    patient_id: idSchema,
    title: z.string().nullable(),
    description: z.string().nullable(),
    medications: z.array(medicationEntrySchema),
    start_date: timestampSchema,
    end_date: timestampSchema,
    summary: z.string().nullable(),
    progress: numericStringSchema,
    score: numericStringSchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .loose();

export type Schedule = z.infer<typeof scheduleSchema>;

export const momentStatusSchema = z.enum(["TAKEN", "MISSED", "PENDING"]);

export const medicationMomentSchema = z
  .object({
    id: idSchema,
    medication_schedule_id: idSchema,
    drug: z.string().min(1),
    dose: z.string().nullable().optional(),
    frequency: z.string().nullable().optional(),
    status: momentStatusSchema,
    time: timestampSchema,
    notified_user: z.boolean(),
    notified_at: timestampSchema.nullable(),
    created_at: timestampSchema.optional(),
  })
  .loose();

export type MedicationMoment = z.infer<typeof medicationMomentSchema>;

export const scheduleWithMomentsSchema = scheduleSchema.extend({
  moments: z.array(medicationMomentSchema).optional(),
});

export const scheduleCreateResponseSchema = z
  .object({
    schedule: scheduleSchema,
  })
  .loose();

export const scheduleDetailResponseSchema = z
  .object({
    schedule: scheduleWithMomentsSchema,
  })
  .loose();

export const scheduleListResponseSchema = z
  .object({
    schedules: z.array(scheduleSchema),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .loose();

export type ScheduleListResponse = z.infer<typeof scheduleListResponseSchema>;

export const momentUpdateBodySchema = z.object({
  status: momentStatusSchema,
});

export type MomentUpdateBody = z.infer<typeof momentUpdateBodySchema>;

export const momentUpdateResponseSchema = z
  .object({
    moment: medicationMomentSchema,
    progress: numericStringSchema,
    score: numericStringSchema,
  })
  .loose();

export type MomentUpdateResponse = z.infer<typeof momentUpdateResponseSchema>;

export const scheduleCreateBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  medications: z.array(medicationEntrySchema).min(1),
});

export type ScheduleCreateBody = z.infer<typeof scheduleCreateBodySchema>;

export const scheduleAddBodySchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  medications: z.array(medicationEntrySchema).min(1),
});

export type ScheduleAddBody = z.infer<typeof scheduleAddBodySchema>;

export const scheduleRemoveBodySchema = z.object({
  drug: z.string().min(1),
  from: z.string().optional(),
});

export const scheduleDeleteResponseSchema = z
  .object({
    message: z.string().min(1),
  })
  .loose();

export const deviceBodySchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["IOS", "ANDROID", "WEB"]),
});

export const deviceResponseSchema = z
  .object({
    device: z
      .object({
        id: idSchema,
        platform: z.string().min(1),
      })
      .loose(),
  })
  .loose();
