import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { createRecordHandlers } from "@/api/mocks/handlers/record";
import {
  meMedicalResponse,
  meWithoutMedicalHistory,
  medicalEventUpdated,
} from "@/api/mocks/fixtures";
import { ProfileScreen } from "@/features/record/ProfileScreen";
import { renderWithProviders } from "./utils";

describe("ProfileScreen", () => {
  beforeEach(() => {
    server.use(...createRecordHandlers());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows skeletons while the profile loads, then the account and medical details", async () => {
    server.use(
      http.get("/api/v1/me", async () => {
        await delay(40);
        return HttpResponse.json(meMedicalResponse);
      }),
    );

    renderWithProviders(<ProfileScreen />);
    expect(await screen.findByRole("status", { name: "Loading your profile" })).toBeInTheDocument();

    expect(await screen.findByLabelText("First name")).toHaveValue("Demo");
    expect(screen.getByLabelText("Last name")).toHaveValue("Patient");
    expect(screen.getByLabelText("Email")).toHaveValue("demo.patient@example.test");
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    expect(screen.getByText("Severe")).toBeInTheDocument();
    expect(screen.getByText("Appendectomy")).toBeInTheDocument();
  });

  it("saves only changed account fields and announces success", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch("/api/v1/me", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ...meMedicalResponse,
          account: { ...meMedicalResponse.account, display_name: "Ada Patient" },
        });
      }),
    );

    renderWithProviders(<ProfileScreen />);
    const first = await screen.findByLabelText("First name");
    await user.clear(first);
    await user.type(first, "Ada");
    await user.click(screen.getByRole("button", { name: "Save account details" }));

    expect(await screen.findByText("Account details saved.")).toBeInTheDocument();
    expect(body).toEqual({ firstName: "Ada" });
  });

  it("notes that email or phone verification resets when either is changed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileScreen />);

    const phone = await screen.findByLabelText("Phone");
    await user.type(phone, "+2348012345678");
    expect(screen.getByText("Verification resets")).toBeInTheDocument();
  });

  it("shows empty states for no allergy history and no medical events", async () => {
    server.use(http.get("/api/v1/me", () => HttpResponse.json(meWithoutMedicalHistory)));
    renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("No allergy history yet")).toBeInTheDocument();
    expect(screen.getByText("No medical events yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add an allergy" }).length).toBeGreaterThan(0);
  });

  it("validates required names and matching passwords without calling the API", async () => {
    const user = userEvent.setup();
    let patchCalls = 0;
    server.use(
      http.patch("/api/v1/me", () => {
        patchCalls += 1;
        return HttpResponse.json(meMedicalResponse);
      }),
    );

    renderWithProviders(<ProfileScreen />);
    const first = await screen.findByLabelText("First name");
    await user.clear(first);
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    await user.click(screen.getByRole("button", { name: "Save account details" }));

    expect(await screen.findByText("Enter your first name.")).toBeInTheDocument();
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(patchCalls).toBe(0);
  });

  it("maps email_taken onto the email field", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("/api/v1/me", () =>
        HttpResponse.json({ error: "email_taken", message: "This email is already registered" }, { status: 409 }),
      ),
    );

    renderWithProviders(<ProfileScreen />);
    const email = await screen.findByLabelText("Email");
    await user.clear(email);
    await user.type(email, "taken@example.test");
    await user.click(screen.getByRole("button", { name: "Save account details" }));

    expect(await screen.findByText("This email is already registered.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a denied state with no retry when the profile is forbidden", async () => {
    server.use(
      http.get("/api/v1/me", () =>
        HttpResponse.json({ error: "patient_profile_required", message: "A patient profile is required" }, { status: 403 }),
      ),
    );

    renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText("You cannot open this right now")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("offers a retry after a failed profile load", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    server.use(
      http.get("/api/v1/me", () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ error: "upstream_unavailable", request_id: "req-me" }, { status: 500 });
        }
        return HttpResponse.json(meMedicalResponse);
      }),
    );

    renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText("Could not load your profile")).toBeInTheDocument();
    expect(screen.getByText("Request ID req-me")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("First name")).toHaveValue("Demo");
  });

  it("deletes an allergy only after the confirm dialog", async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.delete("/api/v1/me/allergies/:id", () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<ProfileScreen />);
    const list = await screen.findByRole("list", { name: "Allergy history" });
    expect(list).toHaveTextContent("Peanuts");

    await user.click(within(list).getAllByRole("button", { name: "Remove" })[1]!);
    expect(screen.getByRole("dialog", { name: "Remove this allergy?" })).toBeInTheDocument();
    expect(deleted).toBe(false);

    await user.click(screen.getByRole("button", { name: "Remove allergy" }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(screen.queryByText("Peanuts")).not.toBeInTheDocument();
  });

  it("confirms before sending an empty allergies array", async () => {
    const user = userEvent.setup();
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.put("/api/v1/me/medical", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ ...meWithoutMedicalHistory });
      }),
    );

    renderWithProviders(<ProfileScreen />);
    await screen.findByText("Penicillin");

    await user.click(screen.getByRole("button", { name: "Remove all allergy history" }));
    expect(screen.getByRole("dialog", { name: "Remove all allergy history?" })).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Remove all allergies" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ allergies: [] });
    expect(await screen.findByText("Allergy history cleared.")).toBeInTheDocument();
    expect(screen.getByText("No allergy history yet")).toBeInTheDocument();
  });

  it("edits and removes a medical event inline", async () => {
    const user = userEvent.setup();
    let patchBody: Record<string, unknown> | undefined;
    server.use(
      http.patch("/api/v1/me/medical-events/:id", async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(medicalEventUpdated);
      }),
      http.delete("/api/v1/me/medical-events/:id", () => new HttpResponse(null, { status: 204 })),
    );

    renderWithProviders(<ProfileScreen />);
    const list = await screen.findByRole("list", { name: "Medical events" });
    await user.click(within(list).getAllByRole("button", { name: "Edit" })[0]!);

    const name = screen.getByLabelText("Event name");
    await user.clear(name);
    await user.type(name, "Appendectomy (updated)");
    await user.click(screen.getByRole("button", { name: "Save event" }));

    expect(await screen.findByText("Medical event updated.")).toBeInTheDocument();
    expect(patchBody).toEqual({ name: "Appendectomy (updated)" });

    await user.click(within(list).getAllByRole("button", { name: "Remove" })[0]!);
    await user.click(screen.getByRole("button", { name: "Remove event" }));
    expect(await screen.findByText("Medical event removed.")).toBeInTheDocument();
  });

  it("shows the storage unavailable state when the avatar upload is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_UPLOAD", "1");
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ProfileScreen />);

    expect(await screen.findByText("Profile photo")).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    await user.upload(input!, new File(["image-bytes"], "profile.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Upload photo" }));

    expect(
      await screen.findByText("File storage is unavailable right now. Other profile changes still work."),
    ).toBeInTheDocument();
    expect(screen.getByText("Request ID 234280c0-1b4e-42b1-9802-c978d7f7d132")).toBeInTheDocument();
  });
});
