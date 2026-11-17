import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { fieldsResponse, grants, patientCode } from "@/api/mocks/fixtures";
import { resetSharingMocks, sharingHandlers } from "@/api/mocks/handlers/sharing";
import { SharingAccessScreen } from "@/features/sharing/SharingAccessScreen";
import { AccessLogScreen } from "@/features/sharing/AccessLogScreen";
import { CodeDisplay } from "@/features/sharing/CodeDisplay";

function renderScreen(ui = <SharingAccessScreen />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { client, ...view };
}

function useFields() {
  server.use(http.get("/api/v1/me/fields", () => HttpResponse.json(fieldsResponse)));
}

beforeEach(() => {
  resetSharingMocks();
  server.use(...sharingHandlers);
  useFields();
});

describe("Sharing and access screen", () => {
  it("shows loading placeholders for the code, fields and list", () => {
    server.use(
      http.get("/api/v1/me/patient-code", async () => {
        await delay(80);
        return HttpResponse.json(patientCode);
      }),
      http.get("/api/v1/me/grants", async () => {
        await delay(80);
        return HttpResponse.json(grants);
      }),
    );
    renderScreen();

    expect(screen.getByRole("status", { name: "Loading patient code" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading your fields" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading access codes" })).toBeInTheDocument();
  });

  it("masks the patient code, reveals it, and creates a one-time grant receipt", async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(await screen.findByText("•••• •••• 9012")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("1234 5678 9012")).toBeInTheDocument();

    await user.click(await screen.findByRole("checkbox", { name: "Name" }));
    expect(screen.getByRole("checkbox", { name: "Verified practitioner portal" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Create access code" }));

    expect(await screen.findByText("This code will not be shown again.")).toBeInTheDocument();
    expect(screen.getByText("4821 9367")).toBeInTheDocument();
    expect(screen.getAllByText("Name").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Copy access code" })).toBeInTheDocument();

    window.dispatchEvent(new Event("pagehide"));
    await waitFor(() => expect(screen.queryByText("This code will not be shown again.")).not.toBeInTheDocument());
  });

  it("shows the rotate dialog with every grant and session warning", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("•••• •••• 9012");
    await user.click(screen.getByRole("button", { name: "Rotate code" }));

    const dialog = await screen.findByRole("dialog", { name: "Rotate patient code?" });
    expect(dialog).toHaveTextContent("Every access code you created is revoked");
    expect(dialog).toHaveTextContent("practitioner viewing your record is signed out");
    expect(screen.getByRole("button", { name: "Hold to rotate patient code" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("re-masks a revealed patient code after the reveal window", async () => {
    const user = userEvent.setup();
    render(<CodeDisplay code="123456789012" label="Patient code" allowReveal revealDurationMs={60} />);

    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("1234 5678 9012")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("•••• •••• 9012")).toBeInTheDocument(), { timeout: 1500 });
  });

  it("copies the real code, not the masked text", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<CodeDisplay code="123456789012" label="Patient code" allowReveal />);
    await user.click(screen.getByRole("button", { name: "Copy patient code" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("123456789012"));
  });

  it("shows the empty grant state with a next action", async () => {
    server.use(http.get("/api/v1/me/grants", () => HttpResponse.json([])));
    renderScreen();

    expect(await screen.findByText("No access codes yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create an access code" })).toBeInTheDocument();
  });

  it("validates fields and channels before calling the API", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByRole("checkbox", { name: "Name" });
    await user.click(screen.getByRole("button", { name: "Create access code" }));
    expect(screen.getByText("Choose at least one field to share.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Name" }));
    await user.click(screen.getByRole("checkbox", { name: "Verified practitioner portal" }));
    await user.click(screen.getByRole("button", { name: "Create access code" }));
    expect(screen.getByText("Choose at least one channel.")).toBeInTheDocument();
  });

  it("shows the denied state for a patient code the account cannot read", async () => {
    server.use(
      http.get("/api/v1/me/patient-code", () =>
        HttpResponse.json(
          { error: "patient_profile_required", message: "A patient profile is needed" },
          { status: 403 },
        ),
      ),
    );
    renderScreen();

    expect(await screen.findByText("Patient code unavailable")).toBeInTheDocument();
    expect(screen.getByText(/A patient profile is needed for this/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("retries a failed grant list and then shows the grants", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.get("/api/v1/me/grants", () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: "upstream_unavailable", message: "The service is unavailable right now. Try again." },
            { status: 500 },
          );
        }
        return HttpResponse.json(grants);
      }),
    );
    renderScreen();

    expect(await screen.findByText("Could not load your access codes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Active")).toBeInTheDocument();
  });

  it("revokes a grant in place and adds the event to the access log", async () => {
    const user = userEvent.setup();
    renderScreen(
      <>
        <SharingAccessScreen />
        <AccessLogScreen />
      </>,
    );

    await screen.findByText("Active");
    expect(await screen.findAllByText("Access code revoked")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke access code?" });
    expect(dialog).toHaveTextContent("Revoking cannot undo what the person has already seen.");
    await user.click(screen.getByRole("button", { name: "Revoke access" }));

    expect(
      await screen.findByText("Access revoked. The person can no longer open this record."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Revoked")).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByText("Access code revoked")).toHaveLength(2));
  });
});
