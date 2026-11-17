import { z } from "zod";
import { idSchema, timestampSchema } from "./common";

export const serviceSchema = z
  .object({
    service_code: z.string().min(1),
    label: z.string().min(1),
    description: z.string().nullable().optional(),
  })
  .loose();

export type Service = z.infer<typeof serviceSchema>;

export const servicesResponseSchema = z.array(serviceSchema);

export const areaSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    region: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    is_demo: z.boolean(),
  })
  .loose();

export type Area = z.infer<typeof areaSchema>;

export const areasResponseSchema = z.array(areaSchema);

export const facilitySummarySchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    address: z.string().min(1),
    phone: z.string().nullable(),
    distance_km: z.number().nonnegative(),
    is_demo: z.boolean(),
    service_code: z.string().min(1),
  })
  .loose();

export type FacilitySummary = z.infer<typeof facilitySummarySchema>;

export const facilitiesResponseSchema = z.array(facilitySummarySchema);

export const facilityServiceSchema = z
  .object({
    service_code: z.string().min(1),
    label: z.string().min(1),
    availability_note: z.string().nullable(),
  })
  .loose();

export const facilityDetailSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    address: z.string().min(1),
    area_id: idSchema,
    area: z
      .object({
        id: idSchema,
        name: z.string().min(1),
        region: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
      })
      .loose(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    phone: z.string().nullable(),
    last_verified_at: timestampSchema.nullable(),
    verified_at: timestampSchema.nullable(),
    is_demo: z.boolean(),
    source_trust: z.string().min(1),
    services: z.array(facilityServiceSchema),
  })
  .loose();

export type FacilityDetail = z.infer<typeof facilityDetailSchema>;
