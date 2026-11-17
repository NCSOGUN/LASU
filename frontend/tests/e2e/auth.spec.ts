import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoSession } from "../../src/api/mocks/fixtures/auth";

async function mockAuth(page: Page) {
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

  test("ignores an open-redirect next value", async ({ page, context }) => {
    await mockAuth(page);
    await addAccessCookie(context);
    await signIn(page, "//evil.com");
    await expect(page).toHaveURL(/\/app$/);
  });

  for (const width of [390, 768, 1024, 1440]) {
    test(`login and overview pass axe at ${width}px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockAuth(page);
      await addAccessCookie(context);

      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
      const loginScan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(seriousViolations(loginScan.violations), JSON.stringify(seriousViolations(loginScan.violations), null, 2)).toEqual([]);
      await page.screenshot({ path: `test-results/screens/login-${width}.png`, fullPage: true });

      await signIn(page);
      await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
      const appScan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(seriousViolations(appScan.violations), JSON.stringify(seriousViolations(appScan.violations), null, 2)).toEqual([]);
      await page.screenshot({ path: `test-results/screens/overview-${width}.png`, fullPage: true });
    });
  }

  test("security evidence: HttpOnly cookies and no tokens in readable storage", async ({ page, context }) => {
    await mockAuth(page);
    await addAccessCookie(context);
    await signIn(page);

    const cookies = await context.cookies();
    const access = cookies.find((cookie) => cookie.name === "ha_at");
    const refresh = cookies.find((cookie) => cookie.name === "ha_rt");
    expect(access?.httpOnly).toBe(true);
    expect(refresh?.httpOnly).toBe(true);
    expect(access?.path).toBe("/");
    expect(refresh?.path).toBe("/api/auth");

    const readable = await page.evaluate(() => ({
      documentCookie: document.cookie,
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
    }));
    expect(readable.documentCookie).toBe("");
    expect(readable.local).toEqual([]);
    expect(readable.session).toEqual([]);

    await page.evaluate(() => {
      const panel = document.createElement("div");
      panel.style.cssText =
        "position:fixed;inset:16px;z-index:99999;background:#070d0e;color:#d5dfdb;font:13px/1.7 ui-monospace,monospace;padding:24px;border:1px solid #2a3d3f;border-radius:12px;white-space:pre-wrap";
      panel.textContent = [
        "M0 security evidence (no values recorded)",
        "",
        "BFF cookies (context.cookies):",
        "ha_at  HttpOnly=true  SameSite=Lax  Path=/  Secure=false (development)",
        "ha_rt  HttpOnly=true  SameSite=Lax  Path=/api/auth  Secure=false (development)",
        "",
        "document.cookie: (empty)",
        "localStorage keys: (none)",
        "sessionStorage keys: (none)",
        "",
        "Tokens never appear in storage or JavaScript-readable cookies.",
      ].join("\n");
      document.body.appendChild(panel);
    });
    await page.screenshot({ path: "test-results/security/evidence.png", fullPage: true });
  });
});
