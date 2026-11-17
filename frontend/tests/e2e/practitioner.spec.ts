import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { practitionerSession } from "../../src/api/mocks/fixtures/sharing";
import { grantClose, grantOpen } from "../../src/api/mocks/fixtures/records";

const readSessionId = grantOpen.read_session_id;

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

function seriousViolations(violations: Array<{ impact?: string | null }>) {
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

async function mockPractitioner(page: Page) {
  const state = { grantActive: true, sessionOpen: true };
  const projection = () => ({
    ...grantOpen,
    expires_at: new Date(Date.now() + 14 * 60_000).toISOString(),
  });

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(practitionerSession) }),
  );

  await page.route("**/api/v1/records/grant/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "POST" && url.pathname.endsWith("/open")) {
      const body = (await request.postDataJSON()) as { patient_code: string; grant_code: string };
      if (body.patient_code === "123456789012" && body.grant_code === "48219367" && state.grantActive) {
        state.sessionOpen = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projection()) });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: false, fields: [] }),
      });
    }
    if (method === "POST" && url.pathname.endsWith("/close")) {
      state.sessionOpen = false;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(grantClose) });
    }
    if (method === "GET") {
      if (!state.grantActive || !state.sessionOpen) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: false, fields: [] }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projection()) });
    }
    return route.fulfill({ status: 405, body: "" });
  });

  return state;
}

for (const width of [390, 1440]) {
  test(`practitioner opens a record, views it, and sees it end after a revoke at ${width}px`, async ({
    page,
    context,
  }) => {
    mkdirSync("test-results/lane-b", { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    await addAccessCookie(context);
    const state = await mockPractitioner(page);

    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));

    await page.goto("/practitioner/lookup");
    await expect(page.getByRole("heading", { name: "Practitioner lookup", level: 1 })).toBeVisible();
    await page.getByLabel("Patient code").fill("123456789012");
    await page.getByLabel("Access code").fill("48219367");
    await page.getByRole("button", { name: "Open record" }).click();

    await expect(page).toHaveURL(new RegExp(`/practitioner/records/${readSessionId}$`));
    expect(page.url()).not.toContain("123456789012");
    expect(page.url()).not.toContain("48219367");

    await expect(page.getByRole("heading", { name: "Shared record", level: 1 })).toBeVisible();
    await expect(page.getByText("Bola Adeyemi")).toBeVisible();
    await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
    await expect(page.getByText(/Access ends in/)).toBeVisible();

    const recordScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      seriousViolations(recordScan.violations),
      JSON.stringify(seriousViolations(recordScan.violations), null, 2),
    ).toEqual([]);
    await page.screenshot({ path: `test-results/lane-b/practitioner-record-${width}.png`, fullPage: true });

    state.grantActive = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect(page.getByText("Access has ended. It may have expired or been revoked.")).toBeVisible();
    await expect(page.getByText("Bola Adeyemi")).toHaveCount(0);

    const endedScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousViolations(endedScan.violations), JSON.stringify(seriousViolations(endedScan.violations), null, 2)).toEqual(
      [],
    );
    await page.screenshot({ path: `test-results/lane-b/practitioner-ended-${width}.png`, fullPage: true });

    expect(consoleMessages.join("\n")).not.toContain("48219367");
    expect(consoleMessages.join("\n")).not.toContain("123456789012");
  });
}
