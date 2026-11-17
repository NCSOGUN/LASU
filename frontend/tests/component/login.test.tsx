import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/api/mocks/server";
import { demoSession } from "@/api/mocks/fixtures";
import { LoginForm } from "@/features/auth/LoginForm";
import { renderWithProviders } from "./utils";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

describe("LoginForm", () => {
  it("validates empty fields without calling the API", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm nextPath="/app" />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
  });

  it("signs in, shows pending, and redirects to the validated next path", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/auth/login", async () => {
        await delay(50);
        return HttpResponse.json(demoSession);
      }),
    );

    renderWithProviders(<LoginForm nextPath="/app/record" />);

    await user.type(screen.getByLabelText("Email"), "demo.patient@example.test");
    await user.type(screen.getByLabelText("Password"), "DemoPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const button = await screen.findByRole("button", { name: "Sign in" });
    expect(button).toHaveAttribute("aria-busy", "true");

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app/record"));
  });

  it("shows the generic message for invalid credentials", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ error: "invalid_credentials", message: "Invalid email or password" }, { status: 401 }),
      ),
    );

    renderWithProviders(<LoginForm nextPath="/app" />);
    await user.type(screen.getByLabelText("Email"), "demo.patient@example.test");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email or password is incorrect")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("shows the denied state for an inactive account and allows a retry", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.post("/api/auth/login", () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json({ error: "account_inactive" }, { status: 403 });
        }
        return HttpResponse.json(demoSession);
      }),
    );

    renderWithProviders(<LoginForm nextPath="/app" />);
    await user.type(screen.getByLabelText("Email"), "demo.patient@example.test");
    await user.type(screen.getByLabelText("Password"), "DemoPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("This account is not active. Contact support if you need help.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("demo.patient@example.test");

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app"));
  });
});
