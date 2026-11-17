import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { channelsHandlers } from "@/api/mocks/handlers/channels";
import {
  channelLinkRequiredError,
  consent,
  consentRevoked,
  fieldsResponse,
  invalidCodeError,
  phoneBegin,
  phoneConfirm,
} from "@/api/mocks/fixtures";
import { qk } from "@/api/keys";
import { ChannelsScreen } from "@/features/channels/ChannelsScreen";
import { PhoneVerification } from "@/features/channels/PhoneVerification";

function renderChannels() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ChannelsScreen />
    </QueryClientProvider>,
  );
  return { queryClient, ...view };
}

function enterPhone(value = "8021234567") {
  fireEvent.change(screen.getByRole("textbox", { name: "Phone number" }), {
    target: { value },
  });
}

async function startCodeFlow() {
  enterPhone();
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  expect(await screen.findByText(/Code sent to/)).toBeInTheDocument();
}

function fillCode(code = "123456") {
  fireEvent.change(screen.getByLabelText("Verification code, digit 1 of 6"), {
    target: { value: code },
  });
}

async function selectSmsFields() {
  fireEvent.click(await screen.findByRole("button", { name: /Fields SMS can read/ }));
  fireEvent.click(screen.getByRole("option", { name: "Name" }));
  fireEvent.click(screen.getByRole("option", { name: "Allergies" }));
}

beforeEach(() => {
  server.use(...channelsHandlers);
});

// Arc's enter animations run in jsdom, so give the heavier journeys room.
vi.setConfig({ testTimeout: 20_000 });

describe("ChannelsScreen", () => {
  it("shows a skeleton in the consent layout and then the field forms", async () => {
    let release: (() => void) | undefined;
    server.use(
      http.get("/api/v1/me/fields", async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(fieldsResponse);
      }),
    );

    renderChannels();

    expect(screen.getByRole("status", { name: "Loading SMS permission" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading USSD permission" })).toBeInTheDocument();

    await waitFor(() => expect(release).toBeDefined());
    release!();

    expect(await screen.findByText("Fields SMS can read")).toBeInTheDocument();
    expect(screen.getByText("Fields USSD can read")).toBeInTheDocument();
  });

  it("validates the phone and the consent fields before calling the API", async () => {
    let begins = 0;
    let puts = 0;
    server.use(
      http.post("/api/v1/auth/phone/begin", () => {
        begins += 1;
        return HttpResponse.json(phoneBegin);
      }),
      http.put("/api/v1/me/consents/SMS", () => {
        puts += 1;
        return HttpResponse.json(consent);
      }),
    );

    renderChannels();

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Enter a phone number.")).toBeInTheDocument();
    expect(begins).toBe(0);

    fireEvent.click(await screen.findByRole("button", { name: "Allow SMS" }));
    expect(await screen.findByText("Choose at least one field for SMS.")).toBeInTheDocument();
    expect(puts).toBe(0);
  });

  it("verifies the phone in E.164, announces success, and never keeps or logs the code", async () => {
    const log = vi.spyOn(console, "log");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    let beginBody: { phone: string } | undefined;
    let confirmBody: { phone: string; code: string } | undefined;

    server.use(
      http.post("/api/v1/auth/phone/begin", async ({ request }) => {
        beginBody = (await request.json()) as { phone: string };
        return HttpResponse.json(phoneBegin);
      }),
      http.post("/api/v1/auth/phone/confirm", async ({ request }) => {
        confirmBody = (await request.json()) as { phone: string; code: string };
        return HttpResponse.json(phoneConfirm);
      }),
    );

    const { queryClient } = renderChannels();
    await startCodeFlow();
    expect(beginBody).toEqual({ phone: "+2348021234567" });

    fillCode("654321");
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    expect(await screen.findByText("Phone verified")).toBeInTheDocument();
    expect(confirmBody).toEqual({ phone: "+2348021234567", code: "654321" });
    expect(screen.getByText(/is confirmed. You can allow SMS and USSD below/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Verify another number" })).toHaveFocus(),
    );

    expect(screen.queryByLabelText("Verification code, digit 1 of 6")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("654321");
    expect(window.location.href).not.toContain("654321");
    expect(
      JSON.stringify(queryClient.getQueryCache().getAll().map((query) => query.state.data)),
    ).not.toContain("654321");
    const logged = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    expect(logged).not.toContain("654321");
  });

  it("shows invalid_code inline and starts again after five failures", async () => {
    let begins = 0;
    server.use(
      http.post("/api/v1/auth/phone/begin", () => {
        begins += 1;
        return HttpResponse.json(phoneBegin);
      }),
      http.post("/api/v1/auth/phone/confirm", () =>
        HttpResponse.json(invalidCodeError, { status: 400 }),
      ),
    );

    renderChannels();
    await startCodeFlow();
    expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      fillCode();
      fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
      const left = 5 - attempt;
      expect(
        await screen.findByText(
          `You have ${left} ${left === 1 ? "try" : "tries"} left before you need a new code.`,
        ),
      ).toBeInTheDocument();
      if (attempt === 1) {
        expect(screen.getByText("That code is not valid.")).toBeInTheDocument();
      }
    }

    fillCode();
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    expect(
      await screen.findByText("Too many incorrect codes. Send a new code to start again."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Verification code, digit 1 of 6")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(/Code sent to/)).toBeInTheDocument();
    expect(begins).toBe(2);
  });

  it("counts down the resend timer and sends a new code", async () => {
    let begins = 0;
    server.use(
      http.post("/api/v1/auth/phone/begin", () => {
        begins += 1;
        return HttpResponse.json(phoneBegin);
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <PhoneVerification onVerified={() => undefined} resendSeconds={1} />
      </QueryClientProvider>,
    );

    enterPhone();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(/Code sent to/)).toBeInTheDocument();
    expect(begins).toBe(1);
    expect(screen.getByRole("button", { name: "Resend code in 1s" })).toBeDisabled();

    await waitFor(
      () => expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled(),
      { timeout: 2500 },
    );

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await waitFor(() => expect(begins).toBe(2));
    expect(
      await screen.findByText("A new code was sent to +234 802 123 4567."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code in 1s" })).toBeDisabled();
  });

  it("names sms_unavailable and retries sending the code", async () => {
    let begins = 0;
    server.use(
      http.post("/api/v1/auth/phone/begin", () => {
        begins += 1;
        if (begins === 1) {
          return HttpResponse.json({ error: "sms_unavailable" }, { status: 503 });
        }
        return HttpResponse.json(phoneBegin);
      }),
    );

    renderChannels();
    enterPhone();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByText("Could not send the code")).toBeInTheDocument();
    expect(screen.getByText("SMS is unavailable right now.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Code sent to/)).toBeInTheDocument();
    expect(begins).toBe(2);
  });

  it("saves SMS consent, shows the returned permission, and keeps it for the session", async () => {
    let putBody: { field_keys: string[]; expires_in_minutes: number } | undefined;
    server.use(
      http.put("/api/v1/me/consents/SMS", async ({ request }) => {
        putBody = (await request.json()) as { field_keys: string[]; expires_in_minutes: number };
        return HttpResponse.json({ ...consent, field_keys: putBody.field_keys });
      }),
    );

    const view = renderChannels();
    await selectSmsFields();
    const smsCard = screen.getByRole("region", { name: "SMS" });

    expect(within(smsCard).getByRole("button", { name: "30 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText(
        "SMS can read only these fields: Name and Allergies. Nothing else in your record is readable through SMS.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow SMS" }));

    expect(await screen.findByText("Current SMS permission")).toBeInTheDocument();
    expect(putBody).toEqual({ field_keys: ["full_name", "allergies"], expires_in_minutes: 43200 });

    const savedPanel = screen.getByText("Current SMS permission").parentElement!;
    expect(
      within(savedPanel).getByText(
        "SMS can read only these fields: Name and Allergies. Nothing else in your record is readable through SMS.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("SMS permission saved.")).toHaveAttribute("role", "status");
    expect(
      screen
        .getByText("Your SMS and USSD permissions are saved. Re-open this page to change them.")
        .closest('[role="status"]'),
    ).not.toBeNull();
    expect(view.queryClient.getQueryData(qk.consents("SMS"))).toMatchObject({
      channel: "SMS",
      field_keys: ["full_name", "allergies"],
    });

    view.unmount();
    render(
      <QueryClientProvider client={view.queryClient}>
        <ChannelsScreen />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Current SMS permission")).toBeInTheDocument();
  });

  it("shows an empty state when no field has a value", async () => {
    server.use(
      http.get("/api/v1/me/fields", () =>
        HttpResponse.json({
          ...fieldsResponse,
          fields: fieldsResponse.fields.map((field) => ({
            ...field,
            value: null,
            field_version: null,
          })),
        }),
      ),
    );

    renderChannels();

    expect(
      await screen.findByRole("heading", { name: "No fields to share yet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a field" })).toHaveAttribute(
      "href",
      "/app/record",
    );
    expect(screen.queryByText("Fields SMS can read")).not.toBeInTheDocument();
  });

  it("shows channel_link_required as a denied state for an unverified phone", async () => {
    server.use(
      http.put("/api/v1/me/consents/SMS", () =>
        HttpResponse.json(channelLinkRequiredError, { status: 400 }),
      ),
    );

    renderChannels();
    await selectSmsFields();
    fireEvent.click(screen.getByRole("button", { name: "Allow SMS" }));

    expect(await screen.findByText("Verify a phone first")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to phone verification" }),
    ).toHaveAttribute("href", "#phone-verification");
    expect(screen.queryByRole("button", { name: "Allow SMS" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Your SMS and USSD permissions are saved. Re-open this page to change them."),
    ).not.toBeInTheDocument();
  });

  it("retries loading the fields and shows the request id", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/v1/me/fields", () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json(
            {
              error: "upstream_unavailable",
              message: "Service unavailable",
              request_id: "req-fields",
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(fieldsResponse);
      }),
    );

    renderChannels();

    expect(await screen.findByText("Could not load your fields")).toBeInTheDocument();
    expect(screen.getByText("Reference req-fields")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Fields SMS can read")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("keeps the consent draft when saving fails and retries it", async () => {
    let puts = 0;
    let lastBody: { field_keys: string[] } | undefined;
    server.use(
      http.put("/api/v1/me/consents/SMS", async ({ request }) => {
        puts += 1;
        lastBody = (await request.json()) as { field_keys: string[] };
        if (puts === 1) {
          return HttpResponse.json(
            {
              error: "upstream_unavailable",
              message: "Service unavailable",
              request_id: "req-put",
            },
            { status: 500 },
          );
        }
        return HttpResponse.json({ ...consent, field_keys: lastBody.field_keys });
      }),
    );

    renderChannels();
    await selectSmsFields();
    fireEvent.click(screen.getByRole("button", { name: "Allow SMS" }));

    expect(await screen.findByText("Could not save SMS permission")).toBeInTheDocument();
    expect(screen.getByText("Reference req-put")).toBeInTheDocument();
    expect(
      screen.getByText(
        "SMS can read only these fields: Name and Allergies. Nothing else in your record is readable through SMS.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Current SMS permission")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Current SMS permission")).toBeInTheDocument();
    expect(puts).toBe(2);
    expect(lastBody).toMatchObject({ field_keys: ["full_name", "allergies"] });
  });

  it("revokes a saved consent only after confirmation", async () => {
    let deletes = 0;
    server.use(
      http.delete("/api/v1/me/consents/SMS", () => {
        deletes += 1;
        return HttpResponse.json(consentRevoked);
      }),
    );

    const { queryClient } = renderChannels();
    await selectSmsFields();
    fireEvent.click(screen.getByRole("button", { name: "Allow SMS" }));
    expect(await screen.findByText("Current SMS permission")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke SMS" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Revoke SMS permission?")).toBeInTheDocument();
    expect(deletes).toBe(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke SMS" }));

    expect(await screen.findByText("SMS permission revoked.")).toBeInTheDocument();
    expect(screen.getByText("No SMS permission saved in this session.")).toBeInTheDocument();
    expect(deletes).toBe(1);
    expect(queryClient.getQueryData(qk.consents("SMS"))).toBeNull();
    expect(
      screen.queryByText("Your SMS and USSD permissions are saved. Re-open this page to change them."),
    ).not.toBeInTheDocument();
  });
});
