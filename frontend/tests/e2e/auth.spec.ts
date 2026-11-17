import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoSession } from "../../src/api/mocks/fixtures/auth";
import {
  accessEvents,
  emergencySummary,
  fieldsResponse,
  grants,
  meResponse,
  patientCode,
  scheduleDetail,
  scheduleList,
  services,
  symptomList,
} from "../../src/api/mocks/fixtures";

async function mockApi(page: Page) {
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, "");
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/me") return json(meResponse);
    if (path === "/me/fields") return json(fieldsResponse);
    if (path === "/me/emergency-summary") return json(emergencySummary);
    if (path === "/me/grants") return json(grants);
    if (path === "/me/patient-code") return json(patientCode);
    if (path === "/me/access-events") return json(accessEvents);
    if (path === "/symptom") return json(symptomList);
    if (path === "/medications") return json(scheduleList);
    if (path.startsWith("/medications/")) return json(scheduleDetail);
    if (path === "/directory/services") return json(services);
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
  });
}

async function mockAuth(page: Page) {
  await mockApi(page);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(demoSession) }),
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(demoSession) }),
  );
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 204, body: "" }));
}

async function addAccessCookie(context: BrowserContext) {
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

async function signIn(page: Page, next = "/app") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill("demo.patient@example.test");
  await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();
}

function seriousViolations(violations: Array<{ impact?: string | null }>) {
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

test.describe("auth journey", () => {
  test("guests are sent to login with a pathname-only next", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
  });

  test("login, app shell, logout, and no tokens in JS-readable storage", async ({ page, context }) => {
    await mockAuth(page);
    await addAccessCookie(context);
    await signIn(page);

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

    const storage = await page.evaluate(() => ({
      local: Object.entries(localStorage).map(([key, value]) => `${key}:${value}`),
      session: Object.entries(sessionStorage).map(([key, value]) => `${key}:${value}`),
      cookies: document.cookie,
    }));
    expect(storage.local.join(" ")).not.toMatch(/token|ha_at|ha_rt/i);
    expect(storage.session.join(" ")).not.toMatch(/token|ha_at|ha_rt/i);
    expect(storage.cookies).not.toMatch(/ha_at|ha_rt/);

    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("ignores an open-redirect next value", as.",
      ].join("\n");
      document.body.appendChild(panel);
    });
    await page.screenshot({ path: "test-results/security/evidence.png", fullPage: true });
  });
});
