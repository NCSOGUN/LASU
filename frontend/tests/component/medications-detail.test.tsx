import { beforeEach, describe, expect, it, vi } from "vitest";
import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { scheduleDetail } from "@/api/mocks/fixtures";
import { medicationHandlers, resetMedicationHandlers } from "@/api/mocks/handlers/medications";
import { MedicationSchedule } from "@/features/medications/MedicationSchedule";
import { clearAiCreated, markAiCreated } from "@/features/medications/ai-created";
import { renderWithProviders } from "./utils";

configure({ asyncUtilTimeout: 5000 });

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

const ID = "ff5c2b3f-81ea-4038-9b93-adce5efcdf46";

beforeEach(() => {
  resetMedicationHandlers();
  server.use(...medicationHandlers);
  navigation.push.mockClear();
  clearAiCreated(ID);
});

describe("MedicationSchedule", () => {
  it("shows the schedule, dates, progress and moments grouped by local day", async () => {
    renderWithProviders(<MedicationSchedule id={ID} />);

    expect(screen.getByRole("status", { name: "Loading schedule" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Headache relief plan", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Nov 17, 2026 to Nov 19, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Adherence" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getAllByText("08:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("14:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20:00").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("group", { name: /Status for Paracetamol/ })).toHaveLength(9);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  }, 20_000);

  it("marks a dose taken and updates progress from the response", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MedicationSchedule id={ID} />);
    await screen.findByRole("heading", { name: "Headache relief plan", level: 1 });

    const first = screen.getAllByRole("group", { name: /Status for Paracetamol/ })[0]!;
    await user.click(within(first).getByRole("button", { name: "Taken" }));

    expect(await screen.findByText("Paracetamol marked taken.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Adherence" })).toHaveAttribute("aria-valuenow", "100"));
    expect(within(first).getByRole("button", { name: "Taken" })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies the moment status optimistically and rolls back on error", async () => {
    server.use(
      http.patch("/api/v1/medications/moments/:id", async () => {
        await delay(500);
        return HttpResponse.json({ error: "upstream_unavailable", request_id: "req-rollback" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MedicationSchedule id={ID} />);
    await screen.findByRole("heading", { name: "Headache relief plan", level: 1 });

    const first = screen.getAllByRole("group", { name: /Status for Paracetamol/ })[0]!;
    await user.click(within(first).getByRole("button", { name: "Taken" }));

    await waitFor(() => expect(within(first).getByRole("button", { name: "Taken" })).toHaveAttribute("aria-pressed", "true"), {
      timeout: 300,
    });

    expect(await screen.findByText("Could not save this change")).toBeInTheDocument();
    expect(screen.getByText("Request req-rollback")).toBeInTheDocument();
    await waitFor(() => expect(within(first).getByRole("button", { name: "Pending" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("progressbar", { name: "Adherence" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("adds a drug from a structured dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MedicationSchedule id={ID} />);
    await screen.findByRole("heading", { name: "Headache relief plan", level: 1 });

    await user.click(screen.getByRole("button", { name: "Add drug" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Drug name"), { target: { value: "Ibuprofen" } });
    fireEvent.change(within(dialog).getByLabelText("Dose"), { target: { value: "200 mg" } });
    fireEvent.change(within(dialog).getByLabelText("Frequency"), { target: { value: "Twice daily" } });
    await user.click(within(dialog).getByRole("button", { name: "Add drug" }));

    expect(await screen.findByText("Ibuprofen, 200 mg")).toBeInTheDocument();
    expect(screen.getByText("Ibuprofen added. Check the dose times below.")).toBeInTheDocument();
  }, 20_000);

  it("removes a drug after a confirmation dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MedicationSchedule id={ID} />);
    await screen.findByRole("heading", { name: "Headache relief plan", level: 1 });

    await user.click(screen.getByRole("button", { name: "Remove Paracetamol" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove drug" }));

    expect(await screen.findByText("No drugs in this schedule")).toBeInTheDocument();
    expect(screen.getByText(/Paracetamol removed/)).toBeInTheDocument();
  });

  it("deletes the schedule and returns to the list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MedicationSchedule id={ID} />);
    await screen.findByRole("heading", { name: "Headache relief plan", level: 1 });

    await user.click(screen.getByRole("button", { name: "Delete schedule" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete schedule" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/app/medications"));
  });

  it("shows the AI review banner after an AI create", async () => {
    markAiCreated(ID);
    renderWithProviders(<MedicationSchedule id={ID} />);

    expect(
      await screen.findByText("Created by AI from your text. Check every drug, dose and time before relying on it."),
    ).toBeInTheDocument();
  });

  it("shows the denied state for a foreign schedule", async () => {
    server.use(
      http.get(`/api/v1/medications/${ID}`, () =>
        HttpResponse.json({ error: "forbidden", request_id: "req-denied" }, { status: 403 }),
      ),
    );

    renderWithProviders(<MedicationSchedule id={ID} />);

    expect(await screen.findByText("This schedule is not available for this account")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows the generic missing state for a 404", async () => {
    server.use(
      http.get(`/api/v1/medications/${ID}`, () =>
        HttpResponse.json({ error: "not_found", request_id: "req-404" }, { status: 404 }),
      ),
    );

    renderWithProviders(<MedicationSchedule id={ID} />);

    expect(await screen.findByText("This item is not available")).toBeInTheDocument();
    expect(screen.getByText(/may have been deleted/)).toBeInTheDocument();
  });

  it("retries a failed detail load", async () => {
    let attempts = 0;
    server.use(
      http.get(`/api/v1/medications/${ID}`, () => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.json({ error: "upstream_unavailable", request_id: "req-retry" }, { status: 500 });
        return HttpResponse.json(scheduleDetail);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MedicationSchedule id={ID} />);

    expect(await screen.findByText("Could not load this schedule")).toBeInTheDocument();
    expect(screen.getByText("Request req-retry")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Headache relief plan", level: 1 })).toBeInTheDocument();
  });
});
