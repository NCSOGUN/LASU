import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/api/mocks/server";
import { facilityDetails } from "@/api/mocks/fixtures";
import { directoryHandlers } from "@/api/mocks/handlers/directory";
import { FacilityDetailView } from "@/features/care/FacilityDetail";
import { renderWithProviders } from "./utils";

const HOSPITAL_ID = "20000000-0000-4000-8000-000000000002";
const FAMILY_CENTRE_ID = "20000000-0000-4000-8000-000000000004";
const MISSING_ID = "20000000-0000-4000-8000-000000000099";

beforeEach(() => {
  server.use(...directoryHandlers);
});

describe("FacilityDetailView", () => {
  it("shows a skeleton, then the address, area, services and directory details", async () => {
    server.use(
      http.get("/api/v1/directory/facilities/:id", async ({ params }) => {
        await delay(80);
        const detail = facilityDetails[String(params.id) as keyof typeof facilityDetails];
        return detail ? HttpResponse.json(detail) : HttpResponse.json({ error: "not_found" }, { status: 404 });
      }),
    );

    renderWithProviders(<FacilityDetailView id={HOSPITAL_ID} />);

    expect(screen.getByRole("status", { name: "Loading facility details" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Demo Community Hospital", level: 1 })).toBeInTheDocument();

    expect(screen.getByText("12 Example Road, Ikeja")).toBeInTheDocument();
    expect(screen.getByText("Ikeja demo area, Lagos")).toBeInTheDocument();
    expect(screen.getByText("General care")).toBeInTheDocument();
    expect(screen.getByText("Child health")).toBeInTheDocument();
    expect(screen.getByText("Directory details last verified 17 November 2026")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByText("Source trust: unknown")).toBeInTheDocument();
    expect(
      screen.getByText("A recommendation does not book a visit or confirm availability."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /call/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to find care" })).toHaveAttribute("href", "/find-care");
  });

  it("links a listed phone number with tel: and shows a verified trust badge", async () => {
    renderWithProviders(<FacilityDetailView id={FAMILY_CENTRE_ID} />);

    expect(await screen.findByRole("heading", { name: "Demo Family Health Centre", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call +2348012345678" })).toHaveAttribute(
      "href",
      "tel:+2348012345678",
    );
    expect(screen.getByText("Source trust: verified")).toBeInTheDocument();
  });

  it("shows the generic not-found message without a retry", async () => {
    renderWithProviders(<FacilityDetailView id={MISSING_ID} />);

    expect(await screen.findByText("This item is not available.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to find care" })).toBeInTheDocument();
  });

  it("retries a failed load and shows the request id for support", async () => {
    const user = userEvent.setup({ delay: null });
    let attempt = 0;
    server.use(
      http.get("/api/v1/directory/facilities/:id", ({ params }) => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: "upstream_unavailable", request_id: "req-facility-1" },
            { status: 500 },
          );
        }
        const detail = facilityDetails[String(params.id) as keyof typeof facilityDetails];
        return detail ? HttpResponse.json(detail) : HttpResponse.json({ error: "not_found" }, { status: 404 });
      }),
    );

    renderWithProviders(<FacilityDetailView id={HOSPITAL_ID} />);

    expect(await screen.findByText("Could not load this facility")).toBeInTheDocument();
    expect(screen.getByText("Request ID: req-facility-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Demo Community Hospital", level: 1 })).toBeInTheDocument();
    expect(attempt).toBe(2);
  });

  it("shows the denied state without a retry", async () => {
    server.use(
      http.get("/api/v1/directory/facilities/:id", () =>
        HttpResponse.json({ error: "forbidden", request_id: "req-facility-denied" }, { status: 403 }),
      ),
    );

    renderWithProviders(<FacilityDetailView id={HOSPITAL_ID} />);

    expect(await screen.findByText("You do not have access to this facility. Contact support if this keeps happening.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
