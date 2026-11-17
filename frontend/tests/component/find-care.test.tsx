import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/api/mocks/server";
import { facilities } from "@/api/mocks/fixtures";
import { directoryHandlers } from "@/api/mocks/handlers/directory";
import { FindCare } from "@/features/care/FindCare";
import { renderWithProviders } from "./utils";

Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => {} });
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => {} });

function matchingFacilities(url: URL) {
  const service = url.searchParams.get("service");
  const radius = Number(url.searchParams.get("radius_km") ?? 25);
  const limit = Number(url.searchParams.get("limit") ?? 3);
  return facilities
    .filter((facility) => facility.service_code === service && facility.distance_km <= radius)
    .sort((left, right) => left.distance_km - right.distance_km || left.name.localeCompare(right.name))
    .slice(0, limit);
}

async function selectService(user: ReturnType<typeof userEvent.setup>, label = "General care") {
  const trigger = screen.getByLabelText("Service");
  await waitFor(() => expect(trigger).not.toBeDisabled());
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: label }));
}

async function selectArea(user: ReturnType<typeof userEvent.setup>, query = "Ikeja") {
  const input = screen.getByLabelText("Area");
  await user.click(input);
  await user.type(input, query);
  await user.click(await screen.findByRole("option", { name: /^Ikeja demo area/ }));
}

async function search(user: ReturnType<typeof userEvent.setup>, service = "General care") {
  await selectService(user, service);
  await selectArea(user);
  await user.click(screen.getByRole("button", { name: "Search facilities" }));
}

beforeEach(() => {
  server.use(...directoryHandlers);
});

describe("FindCare", () => {
  it("shows a skeleton matching the results, then renders the server list", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      http.get("/api/v1/directory/facilities", async ({ request }) => {
        await delay(80);
        return HttpResponse.json(matchingFacilities(new URL(request.url)));
      }),
    );

    renderWithProviders(<FindCare />);
    await search(user);

    expect(await screen.findAllByRole("status", { name: /loading facility result/i })).toHaveLength(3);

    expect(await screen.findByRole("heading", { name: "Demo Community Hospital", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("12 Example Road, Ikeja")).toBeInTheDocument();
    expect(screen.getByText("≈ 0.4 km from the area centre (straight line)")).toBeInTheDocument();
    expect(screen.getAllByText("Demo data")).toHaveLength(3);
    expect(screen.queryByText("Nearby Children's Clinic")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details for Demo Community Hospital" })).toHaveAttribute(
      "href",
      "/facilities/20000000-0000-4000-8000-000000000002",
    );
  });

  it("renders exactly the current server list and never merges a previous search", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<FindCare />);

    await search(user);
    expect(await screen.findByRole("heading", { name: "Demo Community Hospital", level: 3 })).toBeInTheDocument();

    await selectService(user, "Child health");
    await user.click(screen.getByRole("button", { name: "Search facilities" }));

    expect(await screen.findByRole("heading", { name: "Nearby Children's Clinic", level: 3 })).toBeInTheDocument();
    expect(screen.queryByText("Demo Community Hospital")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
  });

  it("shows the empty state and widens the radius from 25 to 50 km", async () => {
    const user = userEvent.setup({ delay: null });
    const radii: number[] = [];
    server.use(
      http.get("/api/v1/directory/facilities", ({ request }) => {
        const url = new URL(request.url);
        const radius = Number(url.searchParams.get("radius_km"));
        radii.push(radius);
        return HttpResponse.json(radius < 50 ? [] : matchingFacilities(url));
      }),
    );

    renderWithProviders(<FindCare />);
    await search(user);

    expect(
      await screen.findByText(
        "No listed facility offers this service within 25 km. Try a wider radius or another area.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search within 50 km" }));

    expect(await screen.findByRole("heading", { name: "Demo Community Hospital", level: 3 })).toBeInTheDocument();
    expect(radii).toEqual([25, 50]);
  });

  it("raises the result limit from 3 to 10 with Show more", async () => {
    const user = userEvent.setup({ delay: null });
    const limits: number[] = [];
    server.use(
      http.get("/api/v1/directory/facilities", ({ request }) => {
        const url = new URL(request.url);
        limits.push(Number(url.searchParams.get("limit")));
        return HttpResponse.json(matchingFacilities(url));
      }),
    );

    renderWithProviders(<FindCare />);
    await search(user);

    await screen.findByRole("heading", { name: "Demo Community Hospital", level: 3 });
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(screen.queryByText("Demo Community Clinic")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByRole("heading", { name: "Demo Community Clinic", level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(limits).toEqual([3, 10]);
  });

  it("validates a missing service and area without calling the facilities endpoint", async () => {
    const user = userEvent.setup({ delay: null });
    let calls = 0;
    server.use(
      http.get("/api/v1/directory/facilities", () => {
        calls += 1;
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<FindCare />);
    await user.click(screen.getByRole("button", { name: "Search facilities" }));

    expect(await screen.findByText("Choose a service.")).toBeInTheDocument();
    expect(screen.getByText("Choose an area.")).toBeInTheDocument();
    expect(calls).toBe(0);
    expect(screen.getByLabelText("Service")).toHaveFocus();
  });

  it("shows a retry with the request id when facilities fail", async () => {
    const user = userEvent.setup({ delay: null });
    let attempt = 0;
    server.use(
      http.get("/api/v1/directory/facilities", ({ request }) => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: "upstream_unavailable", message: "Directory is down", request_id: "req-care-1" },
            { status: 500 },
          );
        }
        return HttpResponse.json(matchingFacilities(new URL(request.url)));
      }),
    );

    renderWithProviders(<FindCare />);
    await search(user);

    expect(await screen.findByText("Could not load facilities")).toBeInTheDocument();
    expect(screen.getByText("Request ID: req-care-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Demo Community Hospital", level: 3 })).toBeInTheDocument();
    expect(attempt).toBe(2);
  });

  it("shows the denied state without a retry button", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      http.get("/api/v1/directory/facilities", () =>
        HttpResponse.json({ error: "forbidden", request_id: "req-care-denied" }, { status: 403 }),
      ),
    );

    renderWithProviders(<FindCare />);
    await search(user);

    expect(await screen.findByText("You do not have access to this directory. Contact support if this keeps happening.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("debounces the area search by 250 ms", async () => {
    const user = userEvent.setup({ delay: null });
    const areaRequests: URL[] = [];
    server.use(
      http.get("/api/v1/directory/areas", ({ request }) => {
        const url = new URL(request.url);
        areaRequests.push(url);
        const query = (url.searchParams.get("q") ?? "").toLocaleLowerCase();
        return HttpResponse.json(
          query
            ? [
                {
                  id: "20000000-0000-4000-8000-000000000001",
                  name: "Ikeja demo area",
                  region: "Lagos",
                  city: "Ikeja",
                  is_demo: true,
                },
              ]
            : [],
        );
      }),
    );

    renderWithProviders(<FindCare />);
    const input = screen.getByLabelText("Area");
    await user.click(input);
    await waitFor(() => expect(areaRequests).toHaveLength(1));

    areaRequests.length = 0;
    await user.type(input, "Ikeja");

    await waitFor(() => expect(areaRequests.some((url) => url.searchParams.get("q") === "Ikeja")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(areaRequests.filter((url) => url.searchParams.get("q") === "Ikeja")).toHaveLength(1);
    expect(areaRequests.filter((url) => url.searchParams.get("q"))).toHaveLength(1);
  });
});
