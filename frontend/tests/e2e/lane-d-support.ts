import { expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoSession } from "../../src/api/mocks/fixtures/auth";

export async function signedIn(page: Page, context: BrowserContext) {
  await context.addCookies([
    { name: "ha_at", value: "test-access-cookie", domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
    { name: "ha_rt", value: "test-refresh-cookie", domain: "127.0.0.1", path: "/api/auth", httpOnly: true, sameSite: "Lax" },
  ]);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(demoSession) }),
  );
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Any API path a test did not mock fails loudly instead of reaching the live API. */
export function unmocked(route: Route) {
  return json(route, { error: "not_found", message: "Not mocked in e2e", request_id: "e2e" }, 404);
}

export async function expectNoSeriousAxe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = scan.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}
