import { test, expect, Locator } from "@playwright/test";

/**
 * Conversational flows in the chat workspace, all in demo mode against the
 * poisoned-key webServer: proves the zero-LLM guarantee holds through the
 * clarification-answer and follow-up-refinement paths, plus the 390px
 * mobile stack.
 */

test.setTimeout(60_000);

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/enter");
  await page.getByLabel("Access code").fill(process.env.SMOKE_ACCESS_CODE ?? "letmein");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL(/\/plan/);
}

async function expandReasoning(turn: Locator) {
  const details = turn.locator("details.log-details");
  const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    await turn.locator("details.log-details > summary").click();
  }
}

test("clarification answered inline in the thread: vague prompt, steppers, merged replan", async ({ page }) => {
  await enter(page);
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Short on details" }).click();

  const thread = page.locator('[aria-label="Conversation"]');
  await expect(thread).toContainText("How many adults and how many children are going?");

  await page.getByLabel("Adults").fill("1");
  await page.getByLabel("Children").fill("2");
  await page.getByRole("button", { name: "Use this" }).click();

  // The answer becomes a user turn and the merged replan lands in the panel.
  await expect(thread).toContainText("1 adult, 2 children");
  const panel = page.locator('[aria-label="Plan panel"]');
  await expect(panel.locator(`[aria-label="Tonight's plan"] ol`)).toBeVisible();

  // The merge reads as a visible adjustment inside the new turn, and the
  // unstated food preference surfaces as an assumption with provenance.
  const lastTurn = thread.locator('[data-role="assistant-turn"]').last();
  await expect(lastTurn).toContainText("Added in your follow-up.");
  await expect(lastTurn).toContainText("assumed");
});

test("refinement quick chip: replan diff in the panel, adjustment in the turn", async ({ page }) => {
  await enter(page);
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Family + gluten-free" }).click();

  const panel = page.locator('[aria-label="Plan panel"]');
  const itineraryList = panel.locator(`[aria-label="Tonight's plan"] ol`);
  await expect(itineraryList).toBeVisible();
  await expect(itineraryList.locator("li", { hasText: "18:15" })).toBeVisible();

  await page.getByRole("button", { name: "Arriving at 6:00 instead" }).click();

  // 18:00 snaps to the 18:12 Lakeshore East train; the transit step is
  // replaced, stable steps keep their badges.
  await expect(itineraryList).toContainText("18:12");
  await expect(itineraryList).toContainText(/kept/);
  await expect(itineraryList).toContainText(/replaced|dropped/);

  const thread = page.locator('[aria-label="Conversation"]');
  // The transcript is the history thread: the chip label is the user turn.
  await expect(thread).toContainText("Arriving at 6:00 instead");
  const refTurn = thread.locator('[data-role="assistant-turn"]').last();
  // Collapse contract on the replan path, then the visible adjustment.
  await expect(refTurn.locator("details.log-details")).toHaveJSProperty("open", false);
  await expect(refTurn).toContainText("Updated in your follow-up.");

  // Free text is honestly disabled in demo mode.
  const composer = page.locator('[aria-label="Composer"]');
  await expect(composer).toContainText("quick chips");
  await expect(composer.locator("textarea")).toBeDisabled();
});

test("mobile 390px: panel stacks below the thread with a working jump control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.goto("/plan?demo=1");

  const jump = page.getByRole("link", { name: "Jump to plan" });
  await expect(jump).toBeVisible();

  await page.getByRole("button", { name: "Family + gluten-free" }).click();
  const panel = page.locator('[aria-label="Plan panel"]');
  await expect(panel.locator(`[aria-label="Tonight's plan"] ol`)).toBeVisible();

  const threadBox = await page.locator('[aria-label="Conversation"]').boundingBox();
  const panelBox = await panel.boundingBox();
  expect(panelBox!.y).toBeGreaterThan(threadBox!.y);

  await jump.click();
  await expect(panel).toBeInViewport();
});
