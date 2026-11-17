import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { accessEvents, fieldsResponse } from "@/api/mocks/fixtures";
import { resetSharingMocks, sharingHandlers } from "@/api/mocks/handlers/sharing";
import { AccessLogScreen } from "@/features/sharing/AccessLogScreen";

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AccessLogScreen />
    </QueryClientProvider>,
  );
  return client;
}

const manyEvents = Array.from({ length: 60 }, (_, index) => ({
  ...accessEvents[index % accessEvents.length]!,
  id: `bulk-${index}`,
  occurred_at: new Date(Date.now() - index * 60_000).toISOString(),
}));

beforeEach(() => {
  resetSharingMocks();
  server.use(...sharingHandlers, http.get("/api/v1/me/fields", () => HttpResponse.json(fieldsResponse)));
});

describe("Access log screen", () => {
  it("shows a loading placeholder", () => {
    server.use(
      http.get("/api/v1/me/access-events", async () => {
        await delay(80);
        return HttpResponse.json(accessEvents);
      }),
    );
    renderScreen();
    expect(screen.getByRole("status", { name: "Loading access events" })).toBeInTheDocument();
  });

  it("humanises actions and shows the outcome, channel and fields", async () => {
    renderScreen();

    expect(await screen.findAllByText("Access code created")).not.toHaveLength(0);
    expect(screen.getByText("Access code revoked")).toBeInTheDocument();
    expect(screen.getByText("Shared record read")).toBeInTheDocument();
    expect(screen.getByText("Patient code rotated")).toBeInTheDocument();
    expect(screen.queryByText("grant_create")).not.toBeInTheDocument();
    expect(screen.getAllByText("Allowed").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Web · Name, Allergies, Medications, Blood group/).length).toBeGreaterThan(0);
  });

  it("shows the empty state with a next action", async () => {
    server.use(http.get("/api/v1/me/access-events", () => HttpResponse.json([])));
    renderScreen();

    expect(await screen.findByText("No access events yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an access code" })).toHaveAttribute("href", "/app/access");
  });

  it("retries a failed access log", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.get("/api/v1/me/access-events", () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: "upstream_unavailable", message: "The service is unavailable right now. Try again." },
            { status: 500 },
          );
        }
        return HttpResponse.json(accessEvents);
      }),
    );
    renderScreen();

    expect(await screen.findByText("Could not load the access log")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByText("Access code created")).not.toHaveLength(0);
  });

  it("shows the denied state without a retry", async () => {
    server.use(
      http.get("/api/v1/me/access-events", () =>
        HttpResponse.json({ error: "forbidden", message: "Access denied" }, { status: 403 }),
      ),
    );
    renderScreen();

    expect(await screen.findByText("The access log is not available")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("loads more up to 100 events and shows the cap message", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/me/access-events", ({ request }) => {
        const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
        return HttpResponse.json(manyEvents.slice(0, limit));
      }),
    );
    renderScreen();

    const loadMore = await screen.findByRole("button", { name: "Load more" });
    await user.click(loadMore);

    expect(await screen.findByText("Showing the latest 100 events")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  }, 20_000);
});
