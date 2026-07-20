import { test, expect, Locator } from "@playwright/test";

/**
 * Seeded demo smoke on the chat workspace: access -> suggested prompt ->
 * July 25 weekend service -> train delay -> real places -> reset, all in
 * demo mode against the poisoned-key webServer (playwright.config.ts), so
 * no step ever depends on a live model call.
 */

test.setTimeout(60_000);

/**
 * The reasoning disclosure opens while streaming and auto-collapses on
 * completion (see components/ReasoningDisclosure.tsx). Click its summary
 * strip to expand before asserting on row content, guarded on the current
 * open state so this never re-collapses an already-open disclosure.
 */
async function expandReasoning(turn: Locator) {
  const details = turn.locator("details.log-details");
  const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    await turn.locator("details.log-details > summary").click();
  }
}

test("scripted demo sequence: access, prompt, July 25 service, delay, real places, reset", async ({ page }) => {
  // ---- 1. Access flow ----
  await page.goto("/enter");
  await page.getByLabel("Access code").fill(process.env.SMOKE_ACCESS_CODE ?? "letmein");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL(/\/plan/);

  // ---- 2. Suggested prompt submits immediately as a user turn ----
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Family + gluten-free" }).click();

  const thread = page.locator('[aria-label="Conversation"]');
  await expect(thread).toContainText("I'm bringing my dad and two kids");

  const panel = page.locator('[aria-label="Plan panel"]');
  const itineraryList = panel.locator(`[aria-label="Tonight's plan"] ol`);
  await expect(itineraryList).toBeVisible();
  const transitStep = itineraryList.locator("li", { hasText: "18:15" });
  await expect(transitStep).toBeVisible();
  await expect(transitStep).toContainText("SNAPSHOT");

  // Collapse contract: once the stream completes, the disclosure folds to
  // its signals summary. The snap adjustment renders inside the turn.
  const firstTurn = thread.locator('[data-role="assistant-turn"]').last();
  await expect(firstTurn.locator("details.log-details")).toHaveJSProperty("open", false);
  await expect(firstTurn).toContainText("You said 6:18");
  await expandReasoning(firstTurn);
  await expect(firstTurn).toContainText("Request parsed");

  // ---- 3. July 25 weekend service: Lakeshore West thins, arrival re-snaps ----
  await page.getByRole("button", { name: "July 25 weekend service" }).click();
  await expect(itineraryList.locator("li", { hasText: "18:12" })).toBeVisible();
  await expect(itineraryList).toContainText("Lakeshore East");
  await expect(itineraryList).toContainText(/replaced|dropped/);
  const julyTurn = thread.locator('[data-role="assistant-turn"]').last();
  await expect(julyTurn).toContainText("18:12 (Lakeshore East)");

  // ---- 4. Train delayed +18: stacks on the July 25 service ----
  await page.getByRole("button", { name: "Train delayed +18 min" }).click();
  await expect(itineraryList).toContainText("18:30");
  // Seating slips past warmups; the deterministic decision summary reports
  // the trade verbatim. The disruption replan is a fresh stream, so the
  // disclosure must auto-collapse again before the manual expand.
  const delayTurn = thread.locator('[data-role="assistant-turn"]').last();
  await expect(delayTurn.locator("details.log-details")).toHaveJSProperty("open", false);
  await expandReasoning(delayTurn);
  await expect(delayTurn).toContainText(/traded:\s*seated_by/);

  // ---- 5. Real places: research-labeled, evidence tier, provenance ----
  const realPlaces = panel.locator('[aria-label="Real places near the arena"]');
  await expect(realPlaces).toBeVisible();
  await expect(realPlaces).toContainText("research notes");
  await expect(realPlaces).toContainText("WVRST");
  await expect(realPlaces).toContainText("dedicated fryer");
  await expect(realPlaces).toContainText("SNAPSHOT");
  await expect(realPlaces).toContainText("2026-07-20");

  // ---- 6. Reset ----
  await page.goto("/plan");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  const sessionAfterReset = await page.evaluate(() => window.localStorage.getItem("gameloop.session.v1"));
  expect(sessionAfterReset).toBeNull();

  await page.goto("/plan");
  await expect(page.locator('[aria-label="What GameLoop remembers"]')).toContainText("Nothing saved yet.");
});
