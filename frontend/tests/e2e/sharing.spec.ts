import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { demoSession } from "../../src/api/mocks/fixtures/auth";
import { patientCode } from "../../src/api/mocks/fixtures/sharing";
import { fieldsResponse } from "../../src/api/mocks/fixtures/fields";

const grantId = "a9234d39-2af2-4d99-a964-9a6565fae4f7";
const grantCode = "48219367";

type GrantRow = {
  id: string;
  grant_id: string;
  status: "active" | "revoked";
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  field_keys: string[];
  channels: string[];
};

type EventRow = {
  id: string;
  occurred_at: string;
  channel: string;
  action: string;
  outcome: string;
  reason_code: string | null;
  resource_type: string;
  resource_id: string | null;
  field_keys: string[];
};

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

async function mockSharing(page: Page) {
  const state: { grants: GrantRow[]; events: EventRow[]; nextId: number } = {
    grants: [],
    events: [],
    nextId: 500,
  };

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(demoSession) }),
  );

  await page.route("**/api/v1/me/fields", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fieldsResponse) }),
  );

  await page.route("**/api/v1/me/patient-code**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST" && url.pathname.endsWith("/rotate")) {
      const rotatedAt = new Date().toISOString();
      state.grants = state.grants.map((grant) =>
        grant.status === "active" ? { ...grant, status: "revoked", revoked_at: rotatedAt } : grant,
      );
      state.events.unshift({
        id: String(state.nextId++),
        occurred_at: rotatedAt,
        channel: "WEB",
        action: "patient_code_rotate",
        outcome: "ALLOWED",
        reason_code: null,
        resource_type: "patient_code",
        resource_id: null,
        field_keys: [],
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          available: true,
          code: "987654321098",
          code_version: 2,
          rotated_at: rotatedAt,
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(patientCode) });
  });

  await page.route("**/api/v1/me/grants**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "GET" && url.pathname.endsWith("/me/grants")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.grants),
      });
    }
    if (method === "POST" && url.pathname.endsWith("/me/grants")) {
      const body = (await request.postDataJSON()) as {
        field_keys: string[];
        channels?: string[];
        expires_in_minutes?: number;
      };
      const now = new Date();
      const created = {
        available: true,
        id: grantId,
        grant_id: grantId,
        code: grantCode,
        expires_at: new Date(now.getTime() + (body.expires_in_minutes ?? 30) * 60_000).toISOString(),
        created_at: now.toISOString(),
        field_keys: body.field_keys,
        channels: body.channels?.length ? body.channels : ["WEB_PRACTITIONER"],
      };
      state.grants.unshift({
        id: created.id,
        grant_id: created.grant_id,
        status: "active",
        expires_at: created.expires_at,
        revoked_at: null,
        created_at: created.created_at,
        field_keys: created.field_keys,
        channels: created.channels,
      });
      state.events.unshift({
        id: String(state.nextId++),
        occurred_at: now.toISOString(),
        channel: "WEB",
        action: "grant_create",
        outcome: "ALLOWED",
        reason_code: null,
        resource_type: "access_grant",
        resource_id: created.id,
        field_keys: created.field_keys,
      });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
    }
    if (method === "DELETE") {
      const id = url.pathname.split("/").pop() ?? "";
      const revokedAt = new Date().toISOString();
      state.grants = state.grants.map((grant) =>
        grant.id === id ? { ...grant, status: "revoked", revoked_at: revokedAt } : grant,
      );
      state.events.unshift({
        id: String(state.nextId++),
        occurred_at: revokedAt,
        channel: "WEB",
        action: "grant_revoke",
        outcome: "ALLOWED",
        reason_code: null,
        resource_type: "access_grant",
        resource_id: id,
        field_keys: [],
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: true, revoked: true, id }),
      });
    }
    return route.fulfill({ status: 405, body: "" });
  });

  await page.route("**/api/v1/me/access-events**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.events) }),
  );
}

for (const width of [390, 1440]) {
  test(`create grant, receipt, revoke, and access log at ${width}px`, async ({ page, context }) => {
    mkdirSync("test-results/lane-b", { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    await addAccessCookie(context);
    await mockSharing(page);

    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));

    await page.goto("/app/access");
    await expect(page.getByRole("heading", { name: "Sharing and access", level: 1 })).toBeVisible();
    await expect(page.getByText("•••• •••• 9012")).toBeVisible();

    await page.getByRole("button", { name: "Reveal" }).click();
    await expect(page.getByText("1234 5678 9012")).toBeVisible();

    await page.getByRole("checkbox", { name: "Name", exact: true }).check();
    await expect(page.getByRole("checkbox", { name: "Verified practitioner portal" })).toBeChecked();
    await page.getByRole("button", { name: "Create access code" }).click();

    await expect(page.getByText("This code will not be shown again.")).toBeVisible();
    await expect(page.getByText("4821 9367")).toBeVisible();
    await expect(page.getByText("Access code ready")).toBeVisible();
    await expect(page.getByText("Expires", { exact: true }).first()).toBeVisible();

    expect(page.url()).not.toContain(grantCode);
    expect(page.url()).not.toContain("123456789012");
    const storage = await page.evaluate(() => ({
      local: JSON.stringify(Object.entries(localStorage)),
      session: JSON.stringify(Object.entries(sessionStorage)),
      cookie: document.cookie,
    }));
    expect(storage.local).not.toContain(grantCode);
    expect(storage.session).not.toContain(grantCode);
    expect(storage.cookie).not.toContain(grantCode);
    expect(consoleMessages.join("\n")).not.toContain(grantCode);

    const accessScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      seriousViolations(accessScan.violations),
      JSON.stringify(seriousViolations(accessScan.violations), null, 2),
    ).toEqual([]);
    await page.screenshot({ path: `test-results/lane-b/access-${width}.png`, fullPage: true });

    await page.getByRole("button", { name: "Revoke" }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke access code?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Revoking cannot undo what the person has already seen.");
    await page.getByRole("button", { name: "Revoke access" }).click();
    await expect(page.getByText("Access revoked. The person can no longer open this record.")).toBeVisible();
    await expect(page.getByText("Revoked", { exact: true })).toBeVisible();

    await page.goto("/app/access-log");
    await expect(page.getByRole("heading", { name: "Access log", level: 1 })).toBeVisible();
    await expect(page.getByText("Access code created").first()).toBeVisible();
    await expect(page.getByText("Access code revoked").first()).toBeVisible();
    await expect(page.getByText("Allowed").first()).toBeVisible();

    const logScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousViolations(logScan.violations), JSON.stringify(seriousViolations(logScan.violations), null, 2)).toEqual(
      [],
    );
    await page.screenshot({ path: `test-results/lane-b/access-log-${width}.png`, fullPage: true });

    expect(page.url()).not.toContain(grantCode);
    expect(consoleMessages.join("\n")).not.toContain(grantCode);
  });
}
