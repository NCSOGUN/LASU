import { test, expect } from "@playwright/test";
import { momentUpdate, scheduleCreate, scheduleDetail, scheduleList } from "../../src/api/mocks/fixtures/medications";
import { expectNoSeriousAxe, json, signedIn, unmocked } from "./lane-d-support";

const ID = scheduleCreate.schedule.id;

// The timezone acceptance: 2026-11-17T07:00:00.000Z must read 08:00 in Lagos.
test.use({ timezoneId: "Africa/Lagos" });

for (const width of [390, 1440]) {
  test(`medications manual create, mark taken and progress at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await signedIn(page, context);

    let created = false;
    let detail = structuredClone(scheduleDetail);
    let body: { medications?: Array<{ drug: string; dose: string }> } | null = null;

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace("/api/v1", "");
      const method = request.method();

      if (method === "GET" && path === "/medications") {
        if (!created) return json(route, { ...scheduleList, schedules: [], total: 0, totalPages: 0 });
        const schedule = { ...detail.schedule, moments: undefined };
        delete schedule.moments;
        return json(route, { ...scheduleList, schedules: [schedule] });
      }
      if (method === "POST" && path === "/medications") {
        body = request.postDataJSON();
        created = true;
        return json(route, scheduleCreate, 201);
      }
      if (method === "GET" && path === `/medications/${ID}`) return json(route, detail);
      if (method === "PATCH" && path === `/medications/moments/${momentUpdate.moment.id}`) {
        detail = {
          schedule: {
            ...detail.schedule,
            progress: momentUpdate.progress,
            score: momentUpdate.score,
            moments: detail.schedule.moments.map((moment) => (moment.id === momentUpdate.moment.id ? momentUpdate.moment : moment)),
          },
        };
        return json(route, momentUpdate);
      }
      return unmocked(route);
    });

    await page.goto("/app/medications");
    await expect(page.getByRole("heading", { name: "Medications", level: 1 })).toBeVisible();
    await expect(page.getByText("No schedules yet")).toBeVisible();
    await expectNoSeriousAxe(page);

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Schedule dates" }).click();
    await page.getByRole("button", { name: "Today" }).click();
    await page.getByRole("button", { name: "Apply" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Schedule title").fill("Headache relief plan");
    await page.getByLabel("Drug name").fill("Paracetamol");
    await page.getByLabel("Dose", { exact: true }).fill("500 mg");
    await page.getByLabel("Frequency").fill("Three times daily");
    await page.getByRole("button", { name: "Create schedule" }).click();

    await expect(page).toHaveURL(new RegExp(`/app/medications/${ID}$`));
    await expect(page.getByRole("heading", { name: "Headache relief plan", level: 1 })).toBeVisible();
    expect(body!.medications?.[0]).toMatchObject({ drug: "Paracetamol", dose: "500 mg" });

    const first = page.getByRole("group", { name: /Status for Paracetamol at 08:00/ }).first();
    await expect(first).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Adherence" })).toHaveAttribute("aria-valuenow", "0");
    await first.getByRole("button", { name: "Taken" }).click();
    await expect(page.getByText("Paracetamol marked taken.")).toBeVisible();
    await expect(first.getByRole("button", { name: "Taken" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("progressbar", { name: "Adherence" })).toHaveAttribute("aria-valuenow", "100");
    await expectNoSeriousAxe(page);
    await page.screenshot({ path: `test-results/screens/medications-detail-${width}.png`, fullPage: true });

    await page.goto("/app/medications");
    await expect(page.getByRole("link", { name: /Headache relief plan/ })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Adherence" })).toHaveAttribute("aria-valuenow", "100");
  });
}
