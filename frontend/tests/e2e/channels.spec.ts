import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoSession, phoneBegin, phoneConfirm } from "../../src/api/mocks/fixtures/auth";
import { fieldsResponse } from "../../src/api/mocks/fixtures/fields";
import { consent, consentRevoked } from "../../src/api/mocks/fixtures/channels";

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

async function mockSession(page: Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(demoSession) }),
  );
}

async function mockFields(page: Page) {
  await page.route("**/api/v1/me/fields", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fieldsResponse),
    }),
  );
}

function seriousViolations(violations: Array<{ impact?: string | null }>) {
  return violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
}

test.describe("channels journey", () => {
  test("verifies a phone, allows SMS consent, and revokes it", async ({ page, context }) => {
    await addAccessCookie(context);
    await mockSession(page);
    await mockFields(page);

    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));

    let beginBody: { phone: string } | undefined;
    let confirmBody: { phone: string; code: string } | undefined;
    let consentBody: { field_keys: string[]; expires_in_minutes: number } | undefined;
    let revoked = false;

    await page.route("**/api/v1/auth/phone/begin", async (route) => {
      beginBody = route.request().postDataJSON() as { phone: string };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(phoneBegin),
      });
    });

    await page.route("**/api/v1/auth/phone/confirm", async (route) => {
      confirmBody = route.request().postDataJSON() as { phone: string; code: string };
      if (confirmBody.code !== "123456") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "invalid_code",
            message: "Invalid or expired verification code",
            request_id: "e2e-invalid-code",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(phoneConfirm),
      });
    });

    await page.route("**/api/v1/me/consents/*", async (route) => {
      const method = route.request().method();
      const channel = new URL(route.request().url()).pathname.split("/").pop()!.toUpperCase();

      if (method === "PUT") {
        consentBody = route.request().postDataJSON() as {
          field_keys: string[];
          expires_in_minutes: number;
        };
        const expiresAt = new Date(
          Date.now() + consentBody.expires_in_minutes * 60_000,
        ).toISOString();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...consent,
            channel,
            field_keys: consentBody.field_keys,
            expires_at: expiresAt,
          }),
        });
        return;
      }

      if (method === "DELETE") {
        revoked = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(consentRevoked),
        });
        return;
      }

      await route.fulfill({ status: 405, body: "" });
    });

    await page.goto("/app/channels");
    await expect(page.getByRole("heading", { name: "Channels", level: 1 })).toBeVisible();

    await page.getByRole("textbox", { name: "Phone number" }).fill("8021234567");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText(/Code sent to/)).toBeVisible();
    expect(beginBody).toEqual({ phone: "+2348021234567" });

    for (let index = 1; index <= 6; index += 1) {
      await page
        .getByLabel(`Verification code, digit ${index} of 6`)
        .fill(String(index));
    }
    await page.getByRole("button", { name: "Verify code" }).click();

    await expect(page.getByText("Phone verified")).toBeVisible();
    expect(confirmBody).toEqual({ phone: "+2348021234567", code: "123456" });
    await expect(page.getByRole("button", { name: "Verify another number" })).toBeFocused();

    expect(page.url()).not.toContain("123456");
    const storage = await page.evaluate(() => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
    }));
    expect(storage.local).not.toContain("123456");
    expect(storage.session).not.toContain("123456");
    expect(consoleMessages.join(" ")).not.toContain("123456");

    const sms = page.getByRole("region", { name: "SMS", exact: true });
    await sms.getByRole("button", { name: /Fields SMS can read/ }).click();
    await page.getByRole("option", { name: "Name", exact: true }).click();
    await page.getByRole("option", { name: "Allergies", exact: true }).click();
    await sms.getByRole("button", { name: /Fields SMS can read/ }).click();

    await expect(sms.getByRole("button", { name: "30 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      sms.getByText(
        "SMS can read only these fields: Name and Allergies. Nothing else in your record is readable through SMS.",
      ),
    ).toBeVisible();

    await sms.getByRole("button", { name: "Allow SMS" }).click();
    await expect(page.getByText("Current SMS permission")).toBeVisible();
    await expect(
      page.getByText("Your SMS and USSD permissions are saved. Re-open this page to change them."),
    ).toBeVisible();
    expect(consentBody).toEqual({
      field_keys: ["full_name", "allergies"],
      expires_in_minutes: 43200,
    });

    await sms.getByRole("button", { name: "Revoke SMS" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Revoke SMS permission?")).toBeVisible();
    expect(revoked).toBe(false);

    await dialog.getByRole("button", { name: "Revoke SMS" }).click();
    await expect(page.getByText("SMS permission revoked.")).toBeVisible();
    await expect(page.getByText("No SMS permission saved in this session.")).toBeVisible();
    expect(revoked).toBe(true);
  });

  for (const width of [390, 1440]) {
    test(`channels pass axe at ${width}px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 1000 });
      await addAccessCookie(context);
      await mockSession(page);
      await mockFields(page);

      await page.goto("/app/channels");
      await expect(page.getByRole("heading", { name: "Channels", level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: /Fields SMS can read/ })).toBeVisible();

      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        seriousViolations(scan.violations),
        JSON.stringify(seriousViolations(scan.violations), null, 2),
      ).toEqual([]);

      await page.screenshot({
        path: `test-results/lane-e/channels-${width}.png`,
        fullPage: true,
      });
    });
  }
});
