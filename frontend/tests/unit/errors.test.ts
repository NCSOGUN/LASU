import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";
import { ApiError, fieldErrors, toApiError, userMessage } from "@/api/errors";

function axiosError(status: number, data: unknown) {
  const error = new AxiosError("request failed", "ERR_BAD_REQUEST");
  error.response = {
    status,
    data,
    statusText: "",
    headers: {},
    config: {},
  } as AxiosResponse;
  return error;
}

describe("toApiError", () => {
  it("maps an API error body", () => {
    const error = toApiError(
      axiosError(403, {
        error: "forbidden",
        message: "Practitioner access required",
        request_id: "req-1",
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe("forbidden");
    expect(error.requestId).toBe("req-1");
    expect(error.message).toBe("You do not have access to this.");
  });

  const cases: Array<[number, string, string]> = [
    [400, "validation_error", "Check the highlighted fields."],
    [400, "invalid_field", "One of these fields cannot be edited."],
    [400, "invalid_fields", "Choose at least one field."],
    [400, "invalid_value", "That value is not valid for this field."],
    [400, "invalid_schedule", "Check the dates and medication times."],
    [400, "invalid_code", "That code is not valid."],
    [400, "no_changes", "Make a change before saving."],
    [400, "invalid_update", "Make a change before saving."],
    [400, "invalid_channel", "That channel is not supported."],
    [400, "channel_link_required", "Verify a phone number first."],
    [400, "image_required", "Choose an image first."],
    [400, "invalid_upload", "That file could not be uploaded."],
    [401, "invalid_credentials", "Email or password is incorrect"],
    [401, "token_expired", "Your session expired. Sign in again."],
    [401, "unauthorized", "Your session expired. Sign in again."],
    [401, "invalid_refresh_token", "Your session expired. Sign in again."],
    [403, "forbidden", "You do not have access to this."],
    [403, "patient_profile_required", "A patient profile is needed for this."],
    [403, "account_inactive", "This account is not active. Contact support if you need help."],
    [404, "not_found", "This item is not available."],
    [409, "email_taken", "This email is already registered."],
    [409, "version_conflict", "This record changed since you opened it."],
    [502, "ai_invalid_response", "The assistant could not produce a valid answer. Try again."],
    [503, "ai_unavailable", "The assistant is unavailable right now."],
    [503, "storage_unavailable", "File storage is unavailable right now."],
    [503, "sms_unavailable", "SMS is unavailable right now."],
    [504, "upstream_timeout", "This took too long."],
  ];

  it.each(cases)("maps %i %s", (status, code, message) => {
    const error = toApiError(axiosError(status, { error: code }));
    expect(error.code).toBe(code);
    expect(userMessage(error)).toBe(message);
  });

  it("keeps validation issues and exposes field errors", () => {
    const error = toApiError(
      axiosError(400, {
        error: "validation_error",
        request_id: "req-2",
        issues: [
          { path: "email", message: "Invalid email" },
          { path: "password", message: "Too short" },
        ],
      }),
    );

    expect(error.issues).toHaveLength(2);
    expect(fieldErrors(error)).toEqual({ email: "Invalid email", password: "Too short" });
  });

  it("maps network and timeout failures", () => {
    const network = new AxiosError("offline", "ERR_NETWORK");
    expect(toApiError(network).code).toBe("network");

    const timeout = new AxiosError("timeout", "ECONNABORTED");
    expect(toApiError(timeout).status).toBe(504);
    expect(toApiError(timeout).code).toBe("upstream_timeout");
  });

  it("never surfaces an upstream message for an unknown error code", () => {
    const error = toApiError(
      axiosError(500, { error: "internal_secret_detail", message: "database host is secret" }),
    );
    expect(error.message).toBe("Something went wrong. Try again.");
  });

  it("maps a Zod failure to invalid_response", () => {
    const error = toApiError(new ApiError({ status: 200, code: "invalid_response" }));
    expect(error.code).toBe("invalid_response");
    expect(error.message).toBe("The service returned an unexpected response. Try again.");
  });
});
