import { test, expect } from "@playwright/test";
import {
  emergencySummary,
  fieldsResponse,
  grants,
  scheduleDetail,
  symptomList,
} from "../../src/api/mocks/fixtures";
import { signInToOverview } from "./support";

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

const filledFields = fieldsResponse.fields.filter((field) => hasValue(field.value)).length;
const totalFields = fieldsResponse.fields.length;
const emergencyFieldCount = emergencySummary.fields.length;
const activeGrants = grants.filter((grant) => grant.status === "active").length;
const doseCount = scheduleDetail.schedule.moments.length;

test.describe("overview journey", () => {
  test("cards load independently and a dose can be marked taken", async ({ page, context }) => {
    await signInToOverview(page, context);

    const completeness = page.getByRole("region", { name: "Profile completeness" });
    await expect(completeness).toBeVisible();
    // The counter draws digits separately; its screen-reader text carries the full value.
    await expect(completeness.getByText(new RegExp(`^${filledFields}\\s+of ${totalFields}$`))).toBeVisible();

    const emergency = page.getByRole("region", { name: "Emergency summary" });
    await expect(emergency.getByText("Available by code")).toBeVisible();
    await expect(emergency.getByText(`${emergencyFieldCount} fields are revealed to a valid patient code.`)).toBeVisible();

    const grantCard = page.getByRole("region", { name: "Active access codes" });
    await expect(grantCard.getByText("Codes still valid")).toBeVisible();
    await expect(grantCard.getByText(`${activeGrants}`, { exact: true }).first()).toBeVisible();

    const symptoms = page.getByRole("region", { name: "Recent conversations" });
    await expect(symptoms.getByRole("link", { name: symptomList.symptoms[0].name })).toBeVisible();
    await expect(symptoms.getByText(symptomList.symptoms[0].severity, { exact: true })).toBeVisible();

    const doses = page.getByRole("region", { name: "Today's doses" });
    await expect(doses).toBeVisible();
    await expect(doses.getByText("Paracetamol").first()).toBeVisible();

    const taken = doses.getByRole("button", { name: "Taken" });
    await expect(taken).toHaveCount(doseCount);
    await taken.first().click();
    await expect(page.getByText("Dose marked taken.")).toBeVisible();

    // The code itself never appears in the URL after the interaction.
    expect(new URL(page.url()).search).toBe("");
  });

  test("a failing card shows its own error while the others still load", async ({ page, context }) => {
    await signInToOverview(page, context, {
      "/me/emergency-summary": {
        status: 404,
        headers: { "x-request-id": "req_overview_error" },
        body: { error: "not_found", message: "This item is not available", request_id: "req_overview_error" },
      },
    });

    await expect(page.getByRole("alert").filter({ hasText: "Could not load emergency summary" })).toBeVisible();
    await expect(page.getByText(/Request req_overview_error/)).toBeVisible();

    // Cards that did load keep their data.
    await expect(page.getByText("Available by code")).toHaveCount(0);
    await expect(page.getByText(new RegExp(`^${filledFields}\\s+of ${totalFields}$`))).toBeVisible();
    await expect(page.getByRole("link", { name: symptomList.symptoms[0].name })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's doses" })).toBeVisible();
  });

  test("empty areas offer a next action", async ({ page, context }) => {
    await signInToOverview(page, context, {
      "/symptom": { body: { symptoms: [], page: 1, limit: 3, total: 0, totalPages: 0 } },
    });

    await expect(page.getByText("No conversations yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a conversation" })).toHaveAttribute("href", "/app/assistant");
  });
});
