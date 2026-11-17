import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { demoSession, grantOpen, practitionerSession } from "@/api/mocks/fixtures";
import { practitionerHandlers, resetPractitionerMocks } from "@/api/mocks/handlers/practitioner";
import { PractitionerLookupScreen } from "@/features/practitioner/PractitionerLookupScreen";
import { qk } from "@/api/keys";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <PractitionerLookupScreen />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

function usePractitionerSession() {
  server.use(http.get("/api/auth/session", () => HttpResponse.json(practitionerSession)));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPractitionerMocks();
  server.use(...practitionerHandlers);
  usePractitionerSession();
});

describe("Practitioner lookup screen", () => {
  it("shows a loading state while the session is checked", () => {
    server.use(
      http.get("/api/auth/session", async () => {
        await delay(80);
        return HttpResponse.json(practitionerSession);
      }),
    );
    renderScreen();
    expect(screen.getByRole("status", { name: "Checking practitioner access" })).toBeInTheDocument();
  });

  it("shows the denied state when the account is not a practitioner", async () => {
    server.use(http.get("/api/auth/session", () => HttpResponse.json(demoSession)));
    renderScreen();

    expect(await screen.findByText("Practitioner access required")).toBeInTheDocument();
    expect(screen.getByText(/This page is for approved practitioners/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Patient code")).not.toBeInTheDocument();
  });

  it("validates both codes before calling the API", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByRole("heading", { name: "Open a shared record" });
    await user.click(screen.getByRole("button", { name: "Open record" }));

    expect(screen.getByText("Enter the 12-digit patient code.")).toBeInTheDocument();
    expect(screen.getByText("Enter the 8-digit access code.")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("opens a record, stores the projection under the read session key, and navigates by id", async () => {
    const user = userEvent.setup();
    const { client } = renderScreen();

    await screen.findByRole("heading", { name: "Open a shared record" });
    await user.type(screen.getByLabelText("Patient code"), "123456789012");
    await user.type(screen.getByLabelText("Access code"), "48219367");
    await user.click(screen.getByRole("button", { name: "Open record" }));

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(`/practitioner/records/${grantOpen.read_session_id}`),
    );
    expect(client.getQueryData(qk.readSession(grantOpen.read_session_id))).toMatchObject({
      available: true,
      read_session_id: grantOpen.read_session_id,
    });
    expect(navigation.push.mock.calls[0]?.[0]).not.toContain("123456789012");
    expect(navigation.push.mock.calls[0]?.[0]).not.toContain("48219367");
    expect(screen.getByLabelText("Patient code")).toHaveValue("");
    expect(screen.getByLabelText("Access code")).toHaveValue("");
  });

  it("uses one generic message for codes that cannot open anything", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/records/grant/open", () => HttpResponse.json({ available: false, fields: [] })),
    );
    renderScreen();

    await screen.findByRole("heading", { name: "Open a shared record" });
    await user.type(screen.getByLabelText("Patient code"), "123456789012");
    await user.type(screen.getByLabelText("Access code"), "00000000");
    await user.click(screen.getByRole("button", { name: "Open record" }));

    expect(await screen.findByText("No shared information is available for these codes.")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("shows the denied state when the practitioner account is not approved", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/records/grant/open", () =>
        HttpResponse.json({ error: "forbidden", message: "Practitioner access required" }, { status: 403 }),
      ),
    );
    renderScreen();

    await screen.findByRole("heading", { name: "Open a shared record" });
    await user.type(screen.getByLabelText("Patient code"), "123456789012");
    await user.type(screen.getByLabelText("Access code"), "48219367");
    await user.click(screen.getByRole("button", { name: "Open record" }));

    expect(await screen.findByText("Practitioner access is required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps the codes and retries after a server error", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.post("/api/v1/records/grant/open", () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: "upstream_unavailable", message: "The service is unavailable right now. Try again." },
            { status: 500 },
          );
        }
        return HttpResponse.json(grantOpen);
      }),
    );
    renderScreen();

    await screen.findByRole("heading", { name: "Open a shared record" });
    await user.type(screen.getByLabelText("Patient code"), "123456789012");
    await user.type(screen.getByLabelText("Access code"), "48219367");
    await user.click(screen.getByRole("button", { name: "Open record" }));

    expect(await screen.findByText("Could not open the record")).toBeInTheDocument();
    expect(screen.getByLabelText("Patient code")).toHaveValue("123456789012");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(`/practitioner/records/${grantOpen.read_session_id}`),
    );
  });
});
