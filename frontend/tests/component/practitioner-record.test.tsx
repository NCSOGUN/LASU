import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { grantOpen, grantRead } from "@/api/mocks/fixtures";
import {
  practitionerHandlers,
  resetPractitionerMocks,
  revokePractitionerGrant,
} from "@/api/mocks/handlers/practitioner";
import { PractitionerRecordScreen } from "@/features/practitioner/PractitionerRecordScreen";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

function renderScreen(id = grantOpen.read_session_id) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <PractitionerRecordScreen id={id} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPractitionerMocks();
  server.use(...practitionerHandlers);
});

describe("Practitioner record screen", () => {
  it("shows a loading placeholder for the read session", () => {
    server.use(
      http.get("/api/v1/records/grant/:id", async () => {
        await delay(80);
        return HttpResponse.json(grantRead);
      }),
    );
    renderScreen();
    expect(screen.getByRole("status", { name: "Loading the shared record" })).toBeInTheDocument();
  });

  it("shows a read-only projection with an expiry countdown", async () => {
    renderScreen();

    expect(await screen.findByText("Bola Adeyemi")).toBeInTheDocument();
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(await screen.findByText(/Access ends in/)).toBeInTheDocument();
    expect(screen.getByText(/Access ends at/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close record" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("ends the session when the grant is revoked at the next focus refetch", async () => {
    renderScreen();
    expect(await screen.findByText("Bola Adeyemi")).toBeInTheDocument();

    revokePractitionerGrant();
    window.dispatchEvent(new Event("focus"));

    expect(
      await screen.findByText("Access has ended. It may have expired or been revoked."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Bola Adeyemi")).not.toBeInTheDocument());
  });

  it("ends the view when the expiry time passes", async () => {
    server.use(
      http.get("/api/v1/records/grant/:id", () =>
        HttpResponse.json({ ...grantRead, expires_at: new Date(Date.now() - 1000).toISOString() }),
      ),
    );
    renderScreen();

    expect(
      await screen.findByText("Access has ended. It may have expired or been revoked."),
    ).toBeInTheDocument();
  });

  it("closes the record and returns to the lookup", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Bola Adeyemi");
    await user.click(screen.getByRole("button", { name: "Close record" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/practitioner/lookup"));
  });

  it("shows the generic unavailable state for an unknown read session", async () => {
    server.use(
      http.get("/api/v1/records/grant/:id", () =>
        HttpResponse.json({ error: "not_found", message: "Record not found" }, { status: 404 }),
      ),
    );
    renderScreen();

    expect(await screen.findByText("This item is not available")).toBeInTheDocument();
    expect(screen.queryByText(/Record not found/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to lookup" })).toBeInTheDocument();
  });

  it("shows the denied state without a retry", async () => {
    server.use(
      http.get("/api/v1/records/grant/:id", () =>
        HttpResponse.json({ error: "forbidden", message: "Not your session" }, { status: 403 }),
      ),
    );
    renderScreen();

    expect(await screen.findByText("This record is not available")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("retries a failed read session", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.get("/api/v1/records/grant/:id", () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: "upstream_unavailable", message: "The service is unavailable right now. Try again." },
            { status: 500 },
          );
        }
        return HttpResponse.json({
          ...grantRead,
          expires_at: new Date(Date.now() + 14 * 60_000).toISOString(),
        });
      }),
    );
    renderScreen();

    expect(await screen.findByText("Could not load this record")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Bola Adeyemi")).toBeInTheDocument();
  });
});
