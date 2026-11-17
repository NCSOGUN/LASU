import { beforeEach, describe, expect, it, vi } from "vitest";
import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { symptomDetail, symptomSevere } from "@/api/mocks/fixtures";
import { resetSymptomHandlers, symptomHandlers } from "@/api/mocks/handlers/symptom";
import { AssistantThread } from "@/features/assistant/AssistantThread";
import { renderWithProviders } from "./utils";

configure({ asyncUtilTimeout: 5000 });

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

const ID = "ab143840-0058-4486-aa0d-2faf0c88121a";

beforeEach(() => {
  resetSymptomHandlers();
  server.use(...symptomHandlers);
  navigation.push.mockClear();
});

describe("AssistantThread", () => {
  it("renders the saved conversation, Markdown and the safety copy", async () => {
    renderWithProviders(<AssistantThread id={ID} />);

    expect(screen.getByRole("status", { name: "Loading conversation" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Mild headache and runny nose", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/A mild headache with a runny nose for two days is often due/)).toBeInTheDocument();
    expect(
      screen.getByText("General information only. Not a diagnosis. In an emergency, seek local emergency care immediately."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Seek urgent care now")).toBeNull();
  });

  it("shows urgent-care guidance above the thread for a severe record", async () => {
    server.use(http.get(`/api/v1/symptom/${ID}`, () => HttpResponse.json(symptomSevere)));

    renderWithProviders(<AssistantThread id={ID} />);

    expect(await screen.findByText("Seek urgent care now")).toBeInTheDocument();
    expect(screen.getAllByText(/Call your local emergency number/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Severe").length).toBeGreaterThan(0);
  });

  it("renames the conversation and changes severity with PATCH", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssistantThread id={ID} />);
    await screen.findByRole("heading", { name: "Mild headache and runny nose", level: 1 });

    const title = screen.getByLabelText("Conversation title");
    fireEvent.change(title, { target: { value: "Headache and runny nose (day 2)" } });
    await user.click(screen.getByRole("button", { name: "Save title" }));

    expect(await screen.findByRole("heading", { name: "Headache and runny nose (day 2)", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Title updated.")).toBeInTheDocument();

    const severity = screen.getByRole("group", { name: "Severity" });
    await user.click(within(severity).getByRole("button", { name: "Severe" }));

    expect(await screen.findByText("Severity updated.")).toBeInTheDocument();
    expect(await screen.findByText("Seek urgent care now")).toBeInTheDocument();
  }, 20_000);

  it("appends the two follow-up messages and refetches the thread", async () => {
    let gets = 0;
    let messages = [...symptomDetail.messages];
    server.use(
      http.get(`/api/v1/symptom/${ID}`, () => {
        gets += 1;
        return HttpResponse.json({ symptom: symptomDetail.symptom, messages });
      }),
      http.post(`/api/v1/symptom/${ID}/follow-up`, async () => {
        await delay(40);
        const appended = [
          { type: "Human", content: "Should I be worried if the headache gets a little worse in the evening?" },
          { type: "AI", content: "A slight increase in the evening **is not necessarily a reason to worry**." },
        ];
        messages = [...messages, ...appended];
        return HttpResponse.json({
          symptom: { ...symptomDetail.symptom, summary: "Mild headache and runny nose for two days; headache gets a little worse in the evening." },
          messages: appended,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AssistantThread id={ID} />);
    await screen.findByRole("heading", { name: "Mild headache and runny nose", level: 1 });

    await user.type(screen.getByLabelText("Ask a follow-up"), "Should I be worried if the headache gets a little worse in the evening?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Should I be worried if the headache gets a little worse in the evening?")).toBeInTheDocument();
    expect(await screen.findByText("is not necessarily a reason to worry")).toBeInTheDocument();
    expect(screen.getByText("Reply received.")).toBeInTheDocument();
    await waitFor(() => expect(gets).toBeGreaterThanOrEqual(2));
  }, 20_000);

  it("cancels a pending follow-up, explains the outcome and refetches the thread", async () => {
    let gets = 0;
    server.use(
      http.get(`/api/v1/symptom/${ID}`, () => {
        gets += 1;
        return HttpResponse.json(symptomDetail);
      }),
      http.post(`/api/v1/symptom/${ID}/follow-up`, async () => {
        await delay(800);
        return HttpResponse.json(symptomDetail);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AssistantThread id={ID} />);
    await screen.findByRole("heading", { name: "Mild headache and runny nose", level: 1 });

    await user.type(screen.getByLabelText("Ask a follow-up"), "Is it getting worse?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Thinking. This can take up to 3 minutes.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Request cancelled")).toBeInTheDocument();
    expect(screen.getByText(/may still have been updated/i)).toBeInTheDocument();
    await waitFor(() => expect(gets).toBeGreaterThanOrEqual(2));
  });

  it("keeps the thread visible and offers a retry when the follow-up AI is unavailable", async () => {
    server.use(
      http.post(`/api/v1/symptom/${ID}/follow-up`, () =>
        HttpResponse.json({ error: "ai_unavailable", message: "The assistant is unavailable right now.", request_id: "req-ai" }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AssistantThread id={ID} />);
    await screen.findByRole("heading", { name: "Mild headache and runny nose", level: 1 });

    await user.type(screen.getByLabelText("Ask a follow-up"), "Is this urgent?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("The assistant is unavailable right now")).toBeInTheDocument();
    expect(screen.getByText("Request req-ai")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText(/A mild headache with a runny nose/)).toBeInTheDocument();
  });

  it("shows the denied state for a foreign record", async () => {
    server.use(
      http.get(`/api/v1/symptom/${ID}`, () =>
        HttpResponse.json({ error: "forbidden", message: "Forbidden", request_id: "req-denied" }, { status: 403 }),
      ),
    );

    renderWithProviders(<AssistantThread id={ID} />);

    expect(await screen.findByText("This conversation is not available for this account")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("uses the generic missing state for a 404", async () => {
    server.use(
      http.get(`/api/v1/symptom/${ID}`, () =>
        HttpResponse.json({ error: "not_found", message: "Symptom analysis record not found" }, { status: 404 }),
      ),
    );

    renderWithProviders(<AssistantThread id={ID} />);

    expect(await screen.findByText("This item is not available")).toBeInTheDocument();
    expect(screen.getByText(/may have been deleted/)).toBeInTheDocument();
  });

  it("deletes the conversation after a confirmation dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssistantThread id={ID} />);
    await screen.findByRole("heading", { name: "Mild headache and runny nose", level: 1 });

    await user.click(screen.getByRole("button", { name: "Delete conversation" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete conversation" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/app/assistant"));
  });
});
