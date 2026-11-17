import { AxiosError } from "axios";
import { z } from "zod";
import { apiErrorSchema, type ValidationIssue } from "./schemas/common";

const messages: Record<string, string> = {
  validation_error: "Check the highlighted fields.",
  invalid_field: "One of these fields cannot be edited.",
  invalid_fields: "Choose at least one field.",
  invalid_value: "That value is not valid for this field.",
  invalid_schedule: "Check the dates and medication times.",
  invalid_code: "That code is not valid.",
  no_changes: "Make a change before saving.",
  invalid_update: "Make a change before saving.",
  invalid_channel: "That channel is not supported.",
  channel_link_required: "Verify a phone number first.",
  image_required: "Choose an image first.",
  invalid_upload: "That file could not be uploaded.",
  invalid_credentials: "Email or password is incorrect",
  token_expired: "Your session expired. Sign in again.",
  unauthorized: "Your session expired. Sign in again.",
  invalid_refresh_token: "Your session expired. Sign in again.",
  forbidden: "You do not have access to this.",
  patient_profile_required: "A patient profile is needed for this.",
  account_inactive: "This account is not active. Contact support if you need help.",
  not_found: "This item is not available.",
  email_taken: "This email is already registered.",
  version_conflict: "This record changed since you opened it.",
  ai_invalid_response: "The assistant could not produce a valid answer. Try again.",
  ai_unavailable: "The assistant is unavailable right now.",
  storage_unavailable: "File storage is unavailable right now.",
  sms_unavailable: "SMS is unavailable right now.",
  upstream_timeout: "This took too long.",
  upstream_unavailable: "The service is unavailable right now. Try again.",
  network: "Check your connection and try again.",
  invalid_response: "The service returned an unexpected response. Try again.",
  timeout: "This took too long.",
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly issues?: ValidationIssue[];

  constructor(input: {
    status: number;
    code: string;
    message?: string;
    requestId?: string;
    issues?: ValidationIssue[];
  }) {
    super(input.message ?? messages[input.code] ?? "Something went wrong. Try again.");
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
    this.issues = input.issues;
  }

  get denied(): boolean {
    return this.status === 403 || this.status === 401;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof z.ZodError) {
    return new ApiError({
      status: 0,
      code: "invalid_response",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  if (error instanceof AxiosError) {
    if (!error.response) {
      const timedOut = error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
      return new ApiError({
        status: timedOut ? 504 : 0,
        code: timedOut ? "upstream_timeout" : "network",
      });
    }

    const status = error.response.status;
    const parsed = apiErrorSchema.safeParse(error.response.data);
    if (parsed.success) {
      return new ApiError({
        status,
        code: parsed.data.error,
        requestId: parsed.data.request_id,
        issues: parsed.data.issues,
      });
    }

    return new ApiError({
      status,
      code: status >= 500 ? "upstream_unavailable" : "invalid_response",
    });
  }

  return new ApiError({ status: 0, code: "network" });
}

export function userMessage(error: unknown): string {
  return toApiError(error).message;
}

export function fieldErrors(error: unknown): Record<string, string> {
  const issues = toApiError(error).issues ?? [];
  return Object.fromEntries(issues.map((issue) => [issue.path.split(".").pop() ?? issue.path, issue.message]));
}
