import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { emergencyLookup } from "@/api/mocks/fixtures";
import { resetSharingMocks, sharingHandlers } from "@/api/mocks/handlers/sharing";
import { EmergencyLookupScreen } from "@/features/sharing/EmergencyLookupScreen";

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <EmergencyLookupScreen />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  resetSharingMocks();
  server.use(...sharingHandlers);
});

describe("Emergency lookup screen", () => {
  it("validates a 12-digit patient code before calling the API", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Look up record" }));
    expect(screen.getByText("Enter the 12-digit patient code.")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Patient code" }), "12345678901");
    await user.click(screen.getByRole("button", { name: "Look up record" }));
    expect(screen.getByText("Enter the 12-digit patient code.")).toBeInTheDocument();
  });

  it("shows a pending state while the lookup runs", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/records/emergency", async () => {
        await delay(80);
        return HttpResponse.json(emergencyLookup);
      }),
    );
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: "Patient code" }), "123456789012");
    await user.click(screen.getByRole("button", { name: "Look up record" }));

    expect(screen.getByRole("status", { name: "Looking up the patient code" })).toBeInTheDocument();
    expect(await screen.findByText("Shared emergency information")).toBeInTheDocument();
  });

  it("returns a read-only field list and keeps the code out of the URL and storage", async () => {
    const user = userEvent.setup();
    renderScreen();

    const input = screen.getByRole("textbox", { name: "Patient code" });
    expect(input).toHaveAttribute("autocomplete", "off");
    await user.type(input, "123456789012");
    expect(input).toHaveValue("123456789012");
    await user.click(screen.getByRole("button", { name: "Look up record" }));

    expect(await screen.findByText("Shared emergency information")).toBeInTheDocument();
    expect(screen.getByText("Penicillin (demo)")).toBeInTheDocument();
    expect(screen.getByText("Chika (demo contact)")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Penicillin/ })).not.toBeInTheDocument();

    expect(window.location.href).not.toContain("123456789012");
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain("123456789012");
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain("123456789012");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("textbox", { name: "Patient code" })).toHaveValue("");
    expect(screen.queryByText("Shared emergency information")).not.toBeInTheDocument();
  });

  it("uses the same generic message for an unavailable code", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: "Patient code" }), "000000000000");
    await user.click(screen.getByRole("button", { name: "Look up record" }));

    expect(await screen.findByText("No shared information is available for these codes.")).toBeInTheDocument();
  });

  it("shows the denied state for an account that cannot look up records", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/records/emergency", () =>
        HttpResponse.json({ error: "account_inactive", message: "This account is not active" }, { status: 403 }),
      ),
    );
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: "Patient code" }), "123456789012");
    await user.click(screen.getByRole("button", { name: "Look up record" }));

    expect(await screen.findByText("Lookup is not available")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps the code on a failed lookup and retries without retyping", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.post("/api/v1/records/emergency", () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: "upstream_unavailable", message: "The service is unavailable right now. Try again." },
            { status: 500 },
          );
        }
        return HttpResponse.json(emergencyLookup);
      }),
    );
    renderScreen();

    await user.type(screen.getByRole("textbox", { name: "Patient code" }), "123456789012");
    await user.click(screen.getByRole("button", { name: "Look up record" }));

    expect(await screen.findByText("Could not look up this code")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Patient code" })).toHaveValue("123456789012");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Penicillin (demo)")).toBeInTheDocument();
  });

  it("clears the input and the result on unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = renderScreen();

    await user.type(screen.getByRole("textbox", { name: "Patient code" }), "123456789012");
    await user.click(screen.getByRole("button", { name: "Look up record" }));
    expect(await screen.findByText("Shared emergency information")).toBeInTheDocument();

    unmount();
    await waitFor(() => expect(screen.queryByText("Shared emergency information")).not.toBeInTheDocument());
    expect(screen.queryByRole("textbox", { name: "Patient code" })).not.toBeInTheDocument();
  });
});
