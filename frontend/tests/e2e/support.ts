import { expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import { demoSession } from "../../src/api/mocks/fixtures/auth";
import {
  emergencySummary,
  fieldsResponse,
  grants,
  meResponse,
  momentUpdate,
  scheduleDetail,
  scheduleList,
  symptomList,
} from "../../src/api/mocks/fixtures";

export function seriousViolations(violations: Array<{ impact?: string | null }>) {
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

export interface MockResponse {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}

function json(route: Route, body: unknown, status = 200, headers?: Record<string, string>) {
  return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

/** A schedule whose moments fall on the browser's local day, so "Today's doses" is stable. */
export function todaysScheduleDetail() {
  const now = new Date();
  const at = (hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0).toISOString();
  return {
    ...scheduleDetail,
    schedule: {
      ...scheduleDetail.schedule,
      moments: scheduleDetail.schedule.moments.map((moment, index) => ({
        ...moment,
        time: at([8, 14, 20][index] ?? 8),
      })),
    },
  };
}

export async function mockOverviewApi(page: Page, overrides: Record<string, MockResponse> = {}) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, "");
    const override = overrides[path];
    if (override) return json(route, override.body, override.status, override.headers);

    if (path === "/me") return json(route, meResponse);
    if (path === "/me/fields") return json(route, fieldsResponse);
    if (path === "/me/emergency-summary") return json(route, emergencySummary);
    if (path === "/me/grants") return json(route, grants);
    if (path === "/symptom") return json(route, symptomList);
    if (path === "/medications") return json(route, scheduleList);
    if (path === "/medications/moments" || path.startsWith("/medications/moments/")) return json(route, momentUpdate);
    if (path === `/medications/${scheduleDetail.schedule.id}`) return json(route, todaysScheduleDetail());
    return json(route, { error: "not_found" }, 404);
  });
}

export async function mockAuth(page: Page) {
  await page.route("**/api/auth/session", (route) => json(route, demoSession));
  await page.route("**/api/auth/login", (route) => json(route, demoSession));
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 204, body: "" }));
}

export async function addAccessCookie(context: BrowserContext) {
  await context.addCookies([
    {
      name: "ha_at",
      value: "test-access-cookie",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "ha_rt",
      value: "test-refresh-cookie",
      domain: "127.0.0.1",
      path: "/api/auth",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export async function signIn(page: Page, next = "/app") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill("demo.patient@example.test");
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signInToOverview(page: Page, context: BrowserContext, overrides?: Record<string, MockResponse>) {
  await mockAuth(page);
  await mockOverviewApi(page, overrides);
  await addAccessCookie(context);
  await signIn(page);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
}
