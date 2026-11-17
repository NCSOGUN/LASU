import { test, expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoSession, registerSession } from "../../src/api/mocks/fixtures/auth";
import { fieldsResponse } from "../../src/api/mocks/fixtures/fields";
import { meMedicalResponse } from "../../src/api/mocks/fixtures/me";

const emergencyKeys = ["full_name", "allergies", "current_medications", "blood_group", "emergency_contact_name"];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
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
  ]);
}

async function mockSession(page: Page) {
  await page.route("**/api/auth/session", (route) => json(route, demoSession));
}

type MockRecordOptions = {
  fields?: typeof fieldsResponse;
  keys?: string[];
  me?: typeof meMedicalResponse;
};

async function mockRecordApi(page: Page, options: MockRecordOptions = {}) {
  let fields = structuredClone(options.fields ?? fieldsResponse);
  let keys = [...(options.keys ?? emergencyKeys)];
  const me = structuredClone(options.me ?? meMedicalResponse);

  await page.route("**/api/v1/me/fields", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        fields: Record<string, string | string[]>;
        expected_version: number;
      };
      fields = {
        version: fields.version + 1,
        fields: fields.fields.map((field) =>
          Object.prototype.hasOwnProperty.call(body.fields, field.key)
            ? { ...field, value: body.fields[field.key] ?? null }
            : field,
        ),
      };
      return json(route, fields);
    }
    return json(route, fields);
  });

  await page.route("**/api/v1/me", (route) => {
    if (route.request().method() === "GET") return json(route, me);
    return json(route, me);
  });

  await page.route("**/api/v1/me/medical", (route) => json(route, me));

  await page.route("**/api/v1/me/emergency-summary", (route) => {
    const projected = keys
      .map((key) => fields.fields.find((field) => field.key === key))
      .filter((field): field is (typeof fieldsResponse.fields)[number] => Boolean(field))
      .map((field) => ({ key: field.key, label: field.label, value: field.value }));
    return json(route, {
      available: projected.length > 0,
      version: fields.version,
      field_keys: keys,
      fields: projected,
    });
  });

  await page.route("**/api/v1/me/emergency-fields", async (route) => {
    const body = route.request().postDataJSON() as { field_keys: string[]; expected_version: number };
    keys = [...body.field_keys];
    fields = { ...fields, version: fields.version + 1 };
    return json(route, { version: fields.version, field_keys: keys });
  });
}

function serious(violations: Array<{ impact?: string | null }>) {
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

test.describe("record journey", () => {
  test("register, edit a record field, choose emergency fields and confirm the preview", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/auth/register", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: { "set-cookie": "ha_at=e2e-access; Path=/; HttpOnly; SameSite=Lax" },
        body: JSON.stringify(registerSession),
      }),
    );
    await mockRecordApi(page);

    await page.goto("/register");
    await page.getByLabel("First name").fill("Ada");
    await page.getByLabel("Last name").fill("Okafor");
    await page.getByLabel("Email").fill("ada.okafor@example.test");
    await page.getByLabel("Password", { exact: true }).fill("DemoPass123!");
    await page.getByLabel("Confirm password").fill("DemoPass123!");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "My record" }).click();
    await expect(page).toHaveURL(/\/app\/record$/);
    await expect(page.getByRole("heading", { name: "My record", level: 1 })).toBeVisible();

    const name = page.getByLabel("Name", { exact: true });
    await expect(name).toHaveValue("Bola Adeyemi");
    await name.fill("Ada Okafor");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Record saved.")).toBeVisible();

    await page.getByRole("link", { name: "Emergency summary" }).click();
    await expect(page).toHaveURL(/\/app\/emergency-summary$/);
    await expect(page.getByRole("heading", { name: "Emergency summary", level: 1 })).toBeVisible();

    const preview = page.getByRole("list", { name: "Emergency preview fields" });
    await expect(preview).toContainText("Ada Okafor");
    await page.getByRole("checkbox", { name: "Allergies" }).click();
    await expect(preview).not.toContainText("Allergies");
    await page.getByRole("button", { name: "Save emergency summary" }).click();
    await expect(
      page.getByText("Emergency summary updated. A code lookup reveals 4 fields."),
    ).toBeVisible();
    await expect(page.getByText("Confirmed by the server", { exact: true })).toBeVisible();
    await expect(preview.getByRole("listitem")).toHaveCount(4);

    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage).filter((key) => key !== "ha-intro"),
      cookies: document.cookie,
    }));
    expect(storage.local).toEqual([]);
    expect(storage.session).toEqual([]);
    expect(storage.cookies).toBe("");
  });

  for (const width of [390, 1440]) {
    test(`record, profile and emergency screens pass axe and save screenshots at ${width}px`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await addAccessCookie(context);
      await mockSession(page);
      await mockRecordApi(page);

      await page.goto("/app/record");
      await expect(page.getByRole("heading", { name: "My record", level: 1 })).toBeVisible();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Bola Adeyemi");
      const recordScan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(serious(recordScan.violations), JSON.stringify(serious(recordScan.violations), null, 2)).toEqual([]);
      await page.screenshot({ path: `test-results/lane-a/record-${width}.png`, fullPage: true });

      await page.goto("/app/profile");
      await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
      await expect(page.getByLabel("First name")).toHaveValue("Demo");
      const profileScan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(serious(profileScan.violations), JSON.stringify(serious(profileScan.violations), null, 2)).toEqual([]);
      await page.screenshot({ path: `test-results/lane-a/profile-${width}.png`, fullPage: true });

      await page.goto("/app/emergency-summary");
      await expect(page.getByRole("heading", { name: "Emergency summary", level: 1 })).toBeVisible();
      await expect(page.getByRole("list", { name: "Emergency preview fields" })).toBeVisible();
      const emergencyScan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        serious(emergencyScan.violations),
        JSON.stringify(serious(emergencyScan.violations), null, 2),
      ).toEqual([]);
      await page.screenshot({ path: `test-results/lane-a/emergency-summary-${width}.png`, fullPage: true });
    });
  }
});
