import { z } from "zod";
import { valueTypeSchema } from "./me";

export const fieldDefinitionSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    value_type: valueTypeSchema,
    emergency_eligible: z.boolean(),
    sort_order: z.number().int(),
    value: z.union([z.string(), z.array(z.string()), z.number(), z.boolean(), z.null()]),
    field_version: z.number().int().nullable(),
  })
  .loose();

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

export const fieldsResponseSchema = z
  .object({
    version: z.number().int().nonnegative(),
    fields: z.array(fieldDefinitionSchema),
  })
  .loose();

export type FieldsResponse = z.infer<typeof fieldsResponseSchema>;

export const fieldValueSchema = z.union([z.string(), z.array(z.string()), z.number(), z.boolean()]);

export const putFieldsBodySchema = z.object({
  fields: z.record(z.string(), fieldValueSchema),
  expected_version: z.number().int().nonnegative(),
});

export type PutFieldsBody = z.infer<typeof putFieldsBodySchema>;

export const putEmergencyFieldsBodySchema = z.object({
  field_keys: z.array(z.string().min(1)).max(50),
  expected_version: z.number().int().nonnegative(),
});

export type PutEmergencyFieldsBody = z.infer<typeof putEmergencyFieldsBodySchema>;

export const emergencyFieldsResponseSchema = z
  .object({
    version: z.number().int().nonnegative(),
    field_keys: z.array(z.string().min(1)),
  })
  .loose();

export type EmergencyFieldsResponse = z.infer<typeof emergencyFieldsResponseSchema>;
