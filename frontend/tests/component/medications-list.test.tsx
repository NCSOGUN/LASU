import { beforeEach, describe, expect, it, vi } from "vitest";
import { configure, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { scheduleCreate, scheduleDecimal, scheduleList } from "@/api/mocks/fixtures";
import { medicationHandlers, resetMedicationHandlers } from "@/api/mocks/handlers/medications";
import { MedicationsPage } from "@/features/medications/MedicationsPage";
import { renderWithProviders } from "./utils";

configure({ asyncUtilTimeout: 5000 });

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

beforeEach(() => {
  resetMedicationHandlers();
  server.use(...medicationHandlers);
  navigation.push.mockClear();
});

function chooseToday() {
  fireEvent.click(screen.getByRole("button", { name: /Schedule dates|Dose dates/ }));
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
}

describe("MedicationsPage", () => {
  it("shows a skeleton, then schedules with the date range and adherence", async () => {
    renderWithProviders(<MedicationsPage />);

    expect(screen.getByRole("status", { name: "Loading medication schedules" })).toBeInTheDocument();
    expect(await screen.findByText("Headache relief plan")).toBeInTheDocument();
    expect(screen.getByText(/Nov 17, 2026 to Nov 19, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Adherence" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("Score 100")).toBeInTheDocument();
  });

  it("parses Decimal strings for progress and score", async () => {
    server.use(
      http.get("/api/v1/medications", () =>
        HttpResponse.json({ schedules: [scheduleDecimal.schedule], page: 1, limit: 10, total: 1, totalPages: 1 }),
      ),
    );

    renderWithProviders(<MedicationsPage />);

    expect(await screen.findByText("Partial adherence plan")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Adherence" })).toHaveAttribute("aria-valuenow", "66.67");
    expect(screen.getByText("Score 83.5")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    server.use(
      http.get("/api/v1/medications", () =>
        HttpResponse.json({ schedules: [], page: 1, limit: 10, total: 0, totalPages: 0 }),
      ),
    );

    renderWithProviders(<MedicationsPage />);

    expect(await screen.findByText("No schedules yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a schedule" })).toBeInTheDocument();
  });

  it("shows the denied state without a retry button", async () => {
    server.use(
      http.get("/api/v1/medications", () =>
        HttpResponse.json({ error: "patient_profile_required", request_id: "req-denied" }, { status: 403 }),
      ),
    );

    renderWithProviders(<MedicationsPage />);

    expect(await screen.findByText("Medication schedules are not available for this account")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("retries a failed list load and recovers", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/v1/medications", () => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.json({ error: "upstream_unavailable", request_id: "req-retry" }, { status: 500 });
        return HttpResponse.json(scheduleList);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MedicationsPage />);

    expect(await screen.findByText("Could not load medication schedules")).toBeInTheDocument();
    expect(screen.getByText("Request req-retry")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Headache relief plan")).toBeInTheDocument();
  });

  it("creates a manual schedule with dates, a drug and dose times", async () => {
    let payload: unknown = null;
    server.use(
      http.post("/api/v1/medications", async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json(scheduleCreate, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MedicationsPage />);
    await screen.findByText("Headache relief plan");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    chooseToday();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Drug name"), { target: { value: "Paracetamol" } });
    fireEvent.change(screen.getByLabelText("Dose"), { target: { value: "500 mg" } });
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "Three times daily" } });
    await user.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/app/medications/ff5c2b3f-81ea-4038-9b93-adce5efcdf46"));
    const body = payload as { startDate: string; endDate: string; medications: Array<{ drug: string; dose: string; times: unknown[] }> };
    expect(body.medications[0]?.drug).toBe("Paracetamol");
    expect(body.medications[0]?.dose).toBe("500 mg");
    expect(body.medications[0]?.times).toHaveLength(1);
  }, 20_000);

  it("shows the AI 503 retry state while the schedule list still loads", async () => {
    server.use(
      http.post("/api/v1/medications", () =>
        HttpResponse.json({ error: "ai_unavailable", message: "The assistant is unavailable right now.", request_id: "req-503" }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<MedicationsPage />);
    await screen.findByText("Headache relief plan");

    await user.click(screen.getByRole("button", { name: "From text or document" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    chooseToday();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Medication instructions"), { target: { value: "Amoxicillin 500 mg three times daily for four days" } });
    await user.click(screen.getByRole("button", { name: "Create from text or document" }));

    expect(await screen.findByText("The assistant is unavailable right now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("Headache relief plan")).toBeInTheDocument();
  }, 20_000);

  it("shows a pending AI create, allows cancel, and refetches the list", async () => {
    let gets = 0;
    server.use(
      http.get("/api/v1/medications", () => {
        gets += 1;
        return HttpResponse.json(scheduleList);
      }),
      http.post("/api/v1/medications", async () => {
        await delay(700);
        return HttpResponse.json(scheduleCreate, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MedicationsPage />);
    await screen.findByText("Headache relief plan");

    await user.click(screen.getByRole("button", { name: "From text or document" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    chooseToday();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Medication instructions"), { target: { value: "Amoxicillin 500 mg three times daily for four days" } });
    await user.click(screen.getByRole("button", { name: "Create from text or document" }));

    expect(await screen.findByText("Thinking. This can take up to 3 minutes.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Request cancelled")).toBeInTheDocument();
    expect(screen.getByText(/may still have been created/i)).toBeInTheDocument();
    await waitFor(() => expect(gets).toBeGreaterThanOrEqual(2));
    expect(navigation.push).not.toHaveBeenCalled();
  }, 25_000);

  it("validates that AI creation needs text or a document", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MedicationsPage />);
    await screen.findByText("Headache relief plan");

    await user.click(screen.getByRole("button", { name: "From text or document" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    chooseToday();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Create from text or document" }));

    expect(await screen.findByText("Add medication instructions or choose one document.")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  }, 20_000);

  it("validates a drug name before a manual create", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MedicationsPage />);
    await screen.findByText("Headache relief plan");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    chooseToday();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Create schedule" }));

    expect(await screen.findByText("Each drug needs a name and at least one dose time.")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  }, 20_000);
});
