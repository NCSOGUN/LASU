import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { server } from "@/api/mocks/server";
import { symptomCreate, symptomList } from "@/api/mocks/fixtures";
import { resetSymptomHandlers, symptomHandlers } from "@/api/mocks/handlers/symptom";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { renderWithProviders } from "./utils";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

beforeEach(() => {
  resetSymptomHandlers();
  server.use(...symptomHandlers);
  navigation.push.mockClear();
});

describe("AssistantPage", () => {
  it("shows a skeleton, then the conversation list", async () => {
    renderWithProviders(<AssistantPage />);

    expect(screen.getByRole("status", { name: "Loading conversations" })).toBeInTheDocument();
    expect(await screen.findByText("Mild headache and runny nose")).toBeInTheDocument();
    expect(screen.getByText("Mild headache and runny nose for two days.")).toBeInTheDocument();
    expect(screen.getByText("Mild")).toBeInTheDocument();
  });

  it("shows the empty state with one next action", async () => {
    server.use(
      http.get("/api/v1/symptom", () =>
        HttpResponse.json({ symptoms: [], page: 1, limit: 10, total: 0, totalPages: 0 }),
      ),
    );

    renderWithProviders(<AssistantPage />);

    expect(await screen.findByText("No conversations yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a conversation" })).toBeInTheDocument();
  });

  it("shows the denied state without a retry button", async () => {
    server.use(
      http.get("/api/v1/symptom", () =>
        HttpResponse.json(
          { error: "patient_profile_required", message: "Patient profile required", request_id: "req-denied" },
          { status: 403 },
        ),
      ),
    );

    renderWithProviders(<AssistantPage />);

    expect(await screen.findByText("The assistant is not available for this account")).toBeInTheDocument();
    expect(screen.getByText(/patient profile is required/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the list visible and shows a retry state when the AI is unavailable", async () => {
    server.use(
      http.post("/api/v1/symptom", () =>
        HttpResponse.json({ error: "ai_unavailable", message: "The assistant is unavailable right now.", request_id: "req-503" }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AssistantPage />);

    expect(await screen.findByText("Mild headache and runny nose")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Describe how you feel"), "I have had a headache for two days.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("The assistant is unavailable right now")).toBeInTheDocument();
    expect(screen.getByText("Request req-503")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("Mild headache and runny nose")).toBeInTheDocument();
  });

  it("shows the retry state for a failed list load and recovers", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/v1/symptom", () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ error: "upstream_unavailable", request_id: "req-retry" }, { status: 500 });
        }
        return HttpResponse.json(symptomList);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AssistantPage />);

    expect(await screen.findByText("Could not load conversations")).toBeInTheDocument();
    expect(screen.getByText("Request req-retry")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Mild headache and runny nose")).toBeInTheDocument();
  });

  it("shows the user message as sending, allows cancel, refetches the list and submits once", async () => {
    let posts = 0;
    let gets = 0;
    server.use(
      http.get("/api/v1/symptom", () => {
        gets += 1;
        return HttpResponse.json(symptomList);
      }),
      http.post("/api/v1/symptom", async () => {
        posts += 1;
        await delay(600);
        return HttpResponse.json(symptomCreate, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AssistantPage />);

    await screen.findByText("Mild headache and runny nose");
    await user.type(screen.getByLabelText("Describe how you feel"), "I have had a headache for two days.");
    const send = screen.getByRole("button", { name: "Send" });

    act(() => {
      fireEvent.click(send);
      fireEvent.click(send);
    });

    expect(await screen.findByText("Thinking. This can take up to 3 minutes.")).toBeInTheDocument();
    expect(screen.getByText("Sending")).toBeInTheDocument();
    expect(posts).toBe(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Request cancelled")).toBeInTheDocument();
    expect(screen.getByText(/may still have been created/i)).toBeInTheDocument();
    await waitFor(() => expect(gets).toBeGreaterThanOrEqual(2));
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("keeps a message longer than 8,000 characters and never sends it", async () => {
    let posts = 0;
    server.use(
      http.post("/api/v1/symptom", () => {
        posts += 1;
        return HttpResponse.json(symptomCreate, { status: 201 });
      }),
    );
    renderWithProviders(<AssistantPage />);
    await screen.findByText("Mild headache and runny nose");

    const long = "a".repeat(8001);
    fireEvent.change(screen.getByLabelText("Describe how you feel"), { target: { value: long } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Keep your message to 8,000 characters or fewer/)).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveValue(long);
    expect(screen.getByRole("button", { name: "Try sending again" })).toBeDisabled();
    expect(posts).toBe(0);
  });

  it("sends the toggles as chosen and opens the new conversation", async () => {
    let body: FormData | null = null;
    server.use(
      http.post("/api/v1/symptom", async ({ request }) => {
        body = await request.formData();
        return HttpResponse.json(symptomCreate, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AssistantPage />);
    await screen.findByText("Mild headache and runny nose");

    await user.type(screen.getByLabelText("Describe how you feel"), "I have a headache.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/app/assistant/ab143840-0058-4486-aa0d-2faf0c88121a"));
    expect(body).not.toBeNull();
    expect(body!.get("message")).toBe("I have a headache.");
    expect(body!.get("includeRecords")).toBe("false");
    expect(body!.get("modifyHistory")).toBe("true");
  });
});
