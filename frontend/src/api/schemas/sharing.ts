import { z } from "zod";
import { idSchema, timestampSchema } from "./common";

export const sharedFieldSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    value: z.unknown(),
  })
  .loose();

export type SharedField = z.infer<typeof sharedFieldSchema>;

export const emergencySummarySchema = z
  .object({
    available: z.boolean(),
    version: z.number().int().nonnegative().optional(),
    field_keys: z.array(z.string()).optional(),
    fields: z.array(sharedFieldSchema).optional(),
  })
  .loose();

export type EmergencySummary = z.infer<typeof emergencySummarySchema>;

export const patientCodeSchema = z
  .object({
    available: z.boolean(),
    code: z.string().optional(),
    code_version: z.number().int().nonnegative().optional(),
    rotated_at: timestampSchema.optional(),
  })
  .loose();

export type PatientCode = z.infer<typeof patientCodeSchema>;

export const grantStatusSchema = z.enum(["active", "expired", "revoked"]);

export const grantChannelSchema = z.enum(["WEB_PRACTITIONER", "USSD"]);

export const grantSchema = z
  .object({
    id: idSchema,
    grant_id: idSchema,
    status: grantStatusSchema,
    expires_at: timestampSchema,
    revoked_at: timestampSchema.nullable(),
    created_at: timestampSchema,
    field_keys: z.array(z.string()),
    channels: z.array(grantChannelSchema),
  })
  .loose();

export type Grant = z.infer<typeof grantSchema>;

export const grantListSchema = z.array(grantSchema);

export const grantCreateBodySchema = z.object({
  field_keys: z.array(z.string().min(1)).min(1).max(50),
  channels: z.array(grantChannelSchema).min(1).optional(),
  expires_in_minutes: z.number().int().min(1).max(1440).optional(),
});

export type GrantCreateBody = z.infer<typeof grantCreateBodySchema>;

export const grantCreateResponseSchema = z
  .object({
    available: z.boolean(),
    id: idSchema,
    grant_id: idSchema,
    code: z.string().min(1),
    expires_at: timestampSchema,
    created_at: timestampSchema,
    field_keys: z.array(z.string()),
    channels: z.array(grantChannelSchema),
  })
  .loose();

export type GrantCreateResponse = z.infer<typeof grantCreateResponseSchema>;

export const grantRevokeResponseSchema = z
  .object({
    available: z.boolean(),
    revoked: z.boolean(),
    id: idSchema,
  })
  .loose();

export const accessActionSchema = z.string().min(1);

export const accessEventSchema = z
  .object({
    id: z.string().min(1),
    occurred_at: timestampSchema,
    channel: z.string().min(1),
    action: accessActionSchema,
    outcome: z.string().min(1),
    reason_code: z.string().nullable(),
    resource_type: z.string().nullable(),
    resource_id: z.string().nullable(),
    field_keys: z.array(z.string()),
  })
  .loose();

export type AccessEvent = z.infer<typeof accessEventSchema>;

export const accessEventsResponseSchema = z.array(accessEventSchema);
