import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { fieldsResponse } from "@/api/mocks/fixtures";
import { resetSharingMocks, sharingHandlers } from "@/api/mocks/handlers/sharing";
import { SharingAccessScreen } from "@/features/sharing/SharingAccessScreen";

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SharingAccessScreen />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  resetSharingMocks();
  server.use(...sharingHandlers, http.get("/api/v1/me/fields", () => HttpResponse.json(fieldsResponse)));
});

describe("grant creation and the query cache", () => {
  it("never stores the one-time grant code in the query cache or web storage", async () => {
    const user = userEvent.setup();
    const { client } = renderScreen();

    await screen.findByText("•••• •••• 9012");
    await user.click(await screen.findByRole("checkbox", { name: /^Name/ }));
    await user.click(screen.getByRole("button", { name: "Create access code" }));

    expect(await screen.findByText("This code will not be shown again.")).toBeInTheDocument();
    expect(screen.getByText("4821 9367")).toBeInTheDocument();

    await waitFor(() => {
      const cached = client
        .getQueryCache()
        .getAll()
        .map((query) => JSON.stringify({ key: query.queryKey, data: query.state.data }))
        .join("\n");
      expect(cached).not.toContain("48219367");
      const mutations = client
        .getMutationCache()
        .getAll()
        .map((mutation) => JSON.stringify(mutation.state.data ?? null))
        .join("\n");
      expect(mutations).not.toContain("48219367");
    });

    const browserStorage = JSON.stringify({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
    });
    expect(browserStorage).not.toContain("48219367");
    expect(window.location.href).not.toContain("48219367");
  }, 20_000);
});
