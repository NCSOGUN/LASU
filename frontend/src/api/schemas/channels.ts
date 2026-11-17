import { z } from "zod";
import { idSchema, timestampSchema } from "./common";

export const consentChannelSchema = z.enum(["SMS", "USSD"]);

export const consentBodySchema = z.object({
  phone_link_id: idSchema.optional(),
  field_keys: z.array(z.string().min(1)).min(1).max(50),
  expires_in_minutes: z.number().int().min(1).max(525600).optional(),
});

export type ConsentBody = z.infer<typeof consentBodySchema>;

export const consentResponseSchema = z
  .object({
    available: z.boolean(),
    consent_id: idSchema,
    channel: z.string().min(1),
    phone_link_id: idSchema,
    expires_at: timestampSchema,
    version: z.number().int().nonnegative(),
    field_keys: z.array(z.string()),
  })
  .loose();

export type Consent = z.infer<typeof consentResponseSchema>;

export const consentRevokeResponseSchema = z
  .object({
    available: z.boolean(),
    revoked: z.boolean(),
  })
  .loose();
