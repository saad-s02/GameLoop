import { test, expect } from "@playwright/test";

/**
 * Conversational flows, all in demo mode against the poisoned-key webServer:
 * proves the zero-LLM guarantee holds through the clarification-answer and
 * follow-up-refinement paths.
 */

test.setTimeout(60_000);

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/enter");
  await page.getByLabel("Access code").fill(process.env.SMOKE_ACCESS_CODE ?? "letmein");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL(/\/plan/);
}

test("answer a clarification inline: vague chip, party steppers, merged replan", async ({ page }) => {
  await enter(page);
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Short on details" }).click();
  await page.getByRole("button", { name: "Plan my night" }).click();

  const contractCard = page.locator('section[aria-label="Constraint contract"]');
  await expect(contractCard).toContainText("How many adults and how many children are going?");

  await page.getByLabel("Adults").fill("1");
  await page.getByLabel("Children").fill("2");
  await page.getByRole("button", { name: "Use this" }).click();

  // The merged contract shows the answered party and the question card is gone.
  await expect(contractCard).toContainText("1 adult, 2 children");
  await expect(contractCard).not.toContainText("How many adults");

  const decisionLog = page.locator('section[aria-label="Decision log"]');
  const itineraryList = decisionLog.locator("xpath=following::ol[1]");
  await expect(itineraryList).toBeVisible();

  // The answer reads as a visible constraint_adjusted in the log.
  await expect(decisionLog).toContainText("Added in your follow-up.");
  // No food preference was stated, so the food timing assumption surfaces with provenance.
  await expect(page.locator('section[aria-label="Assumed for this plan"]')).toContainText("assumed");
});

test("follow-up refinement: family plan, quick chip change, diff and history", async ({ page }) => {
  await enter(page);
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Family + gluten-free" }).click();
  await page.getByRole("button", { name: "Plan my night" }).click();

  const decisionLog = page.locator('section[aria-label="Decision log"]');
  const itineraryList = decisionLog.locator("xpath=following::ol[1]");
  await expect(itineraryList).toBeVisible();
  await expect(itineraryList.locator("li", { hasText: "18:15" })).toBeVisible();

  await page.getByRole("button", { name: "Arriving at 6:00 instead" }).click();

  // 18:00 snaps to the 18:12 Lakeshore East train; the transit step is replaced, stable steps keep badges.
  await expect(itineraryList).toContainText("18:12");
  await expect(itineraryList).toContainText(/kept/);
  await expect(itineraryList).toContainText(/replaced|dropped/);

  // The change is logged as a constraint adjustment and remembered in the history thread.
  await expect(decisionLog).toContainText("Updated in your follow-up.");
  await expect(page.locator('section[aria-label="What you have told us"]')).toContainText("Arriving at 6:00 instead");

  // Free text is disabled in demo mode with honest copy.
  await expect(page.locator('section[aria-label="Follow-up"]')).toContainText("quick chips");
});
