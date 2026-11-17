import { http, HttpResponse } from "msw";
import { areas, facilities, facilityDetails, services } from "../fixtures/directory";

const REQUEST_ID = "req-directory-mock";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function numberParam(url: URL, name: string, fallback: number) {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function areaScore(area: (typeof areas)[number], query: string) {
  if (!query) return 0;
  const name = area.name.toLocaleLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  const place = [area.city, area.region].filter(Boolean).join(" ").toLocaleLowerCase();
  return place.includes(query) ? 3 : -1;
}

/**
 * Mirrors the live directory contract closely enough for unit, component and e2e tests:
 * areas are filtered by q with exact and prefix matches first; facilities are filtered by
 * service and area, measured from the area centre and sorted by distance then name.
 */
export const directoryHandlers = [
  http.get("/api/v1/directory/services", () => HttpResponse.json(services)),

  http.get("/api/v1/directory/areas", ({ request }) => {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
    const limit = clamp(Math.floor(numberParam(url, "limit", 5)), 1, 10);

    const matches = areas
      .map((area) => ({ area, score: areaScore(area, query) }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => left.score - right.score || left.area.name.localeCompare(right.area.name))
      .slice(0, limit)
      .map((entry) => entry.area);

    return HttpResponse.json(matches);
  }),

  http.get("/api/v1/directory/facilities", ({ request }) => {
    const url = new URL(request.url);
    const service = url.searchParams.get("service");
    const areaId = url.searchParams.get("area_id");

    if (!service || !areaId) {
      return HttpResponse.json(
        {
          error: "validation_error",
          request_id: REQUEST_ID,
          issues: [
            { path: "service", message: "Required" },
            { path: "area_id", message: "Required" },
          ],
        },
        { status: 400 },
      );
    }

    if (!areas.some((area) => area.id === areaId)) return HttpResponse.json([]);

    const radius = clamp(numberParam(url, "radius_km", 25), 1, 200);
    const limit = clamp(Math.floor(numberParam(url, "limit", 3)), 1, 10);
    const matches = facilities
      .filter((facility) => facility.service_code === service && facility.distance_km <= radius)
      .sort((left, right) => left.distance_km - right.distance_km || left.name.localeCompare(right.name))
      .slice(0, limit);

    return HttpResponse.json(matches);
  }),

  http.get("/api/v1/directory/facilities/:id", ({ params }) => {
    const detail = facilityDetails[String(params.id) as keyof typeof facilityDetails];
    if (!detail) {
      return HttpResponse.json(
        { error: "not_found", message: "Facility not found", request_id: REQUEST_ID },
        { status: 404 },
      );
    }
    return HttpResponse.json(detail);
  }),
];
