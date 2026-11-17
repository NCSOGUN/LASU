import { z } from "zod";

/** Every API response is parsed at the trust boundary. Unknown extra keys are accepted. */
export const idSchema = z.string().min(1);
export const timestampSchema = z.string().min(1);
export const numericStringSchema = z.string();

export const roleSchema = z.string().min(1);

export const apiErrorSchema = z
  .object({
    error: z.string().min(1),
    message: z.string().optional(),
    request_id: z.string().optional(),
    issues: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  })
  .loose();

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;
