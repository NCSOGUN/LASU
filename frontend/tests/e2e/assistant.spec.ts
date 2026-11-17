import { test, expect } from "@playwright/test";
import { symptomCreate, symptomFollowUp, symptomList, symptomUpdate } from "../../src/api/mocks/fixtures/symptom";
import { expectNoSeriousAxe, json, signedIn, unmocked } from "./lane-d-support";

const ID = symptomCreate.symptom.id;

for (const width of [390, 1440]) {
  test(`assistant create, follow-up and cancel at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await signedIn(page, context);

    let created = false;
    let messages = [...symptomCreate.messages];
    let symptom = symptomCreate.symptom;
    let posts = 0;
    let followUps = 0;

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace("/api/v1", "");
      const method = request.method();

      if (method === "GET" && path === "/symptom") {
        return json(route, created ? { ...symptomList, symptoms: [symptom] } : { ...symptomList, symptoms: [], total: 0, totalPages: 0 });
      }
      if (method === "POST" && path === "/symptom") {
        posts += 1;
        created = true;
        return json(route, symptomCreate, 201);
      }
      if (method === "GET" && path === `/symptom/${ID}`) return json(route, { symptom, messages });
      if (method === "POST" && path === `/symptom/${ID}/follow-up`) {
        followUps += 1;
        if (followUps === 1) {
          messages = [...messages, ...symptomFollowUp.messages];
          // The agent may rewrite the record's name and severity; use the snapshot's PATCH example for that.
          symptom = symptomUpdate.symptom;
          return json(route, { symptom, messages: symptomFollowUp.messages }, 201);
        }
        // The second follow-up hangs so the user can cancel it.
        await new Promise((resolve) => setTimeout(resolve, 8_000));
        return route.fulfill({ status: 201, contentType: "application/json", body: "{}" }).catch(() => undefined);
      }
      return unmocked(route);
    });

    await page.goto("/app/assistant");
    await expect(page.getByRole("heading", { name: "Assistant", level: 1 })).toBeVisible();
    await expect(page.getByText("No conversations yet")).toBeVisible();
    await expect(page.getByText(/General information only\. Not a diagnosis\./)).toBeVisible();
    await expectNoSeriousAxe(page);

    await page.getByLabel("Describe how you feel").fill("I have had a mild headache and a runny nose for two days.");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(new RegExp(`/app/assistant/${ID}$`));
    await expect(page.getByRole("heading", { name: "Mild headache and runny nose", level: 1 })).toBeVisible();
    expect(posts).toBe(1);

    await page.getByLabel("Ask a follow-up").fill("Should I be worried if the headache gets a little worse in the evening?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/isn’t necessarily a reason to worry/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Headache and runny nose (day 2)", level: 1 })).toBeVisible();
    await expectNoSeriousAxe(page);

    await page.getByLabel("Ask a follow-up").fill("Is it fine to take paracetamol at night?");
    await page.getByRole("button", { name: "Send" }).click();
    const thread = page.getByRole("list", { name: "Conversation messages" });
    await expect(thread.getByText("Thinking. This can take up to 3 minutes.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.getByText("Request cancelled").first()).toBeVisible();
    await expect(thread.getByText(/isn’t necessarily a reason to worry/)).toBeVisible();
    await page.screenshot({ path: `test-results/screens/assistant-thread-${width}.png`, fullPage: true });

    await page.getByRole("link", { name: "Back to assistant" }).click();
    const renamed = page.getByRole("link", { name: /Headache and runny nose \(day 2\)/ });
    await expect(renamed).toBeVisible();
    await expect(renamed).toContainText("Moderate");
  });
}
