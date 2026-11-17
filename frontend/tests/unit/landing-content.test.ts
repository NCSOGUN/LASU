import { describe, expect, it } from "vitest";
import { bento, finalCta, hero, nav, steps, trust } from "@/features/landing/content";

describe("landing copy for scope §7.11", () => {
  it("points the final card at find care", () => {
    expect(finalCta.cardTitle).toBe("No account needed to find care.");
    expect(finalCta.primary.href).toBe("/find-care");
  });

  it("keeps the assistant behind sign-in and adds a public find care link", () => {
    expect(hero.primary.label).toBe("Open the assistant");
    expect(hero.primary.href).toBe("/app/assistant");
    expect(hero.secondary.href).toBe("/lookup");
    expect(hero.findCare.href).toBe("/find-care");
    expect(nav.cta.href).toBe("/app/assistant");
    expect(nav.findCare.href).toBe("/find-care");
  });

  it("describes the symptom assistant in the bento", () => {
    expect(bento.threads.body).toBe("Describe how you feel. Get general guidance and when to seek care.");
  });

  it("uses the find-care form in the first step", () => {
    expect(steps[0].body).toContain("find-care form");
    expect(steps[0].body).not.toContain("Type what you need");
  });

  it("qualifies the AI record claim", () => {
    expect(trust.items[3].title).toBe("Your record stays out of the AI unless you choose");
    expect(trust.items[3].body).toBe(
      "Codes are never sent to the AI. The assistant only uses your record if you switch it on.",
    );
  });
});
