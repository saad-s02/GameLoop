import { test, expect, Locator } from "@playwright/test";

/**
 * Seeded demo smoke: walks the exact scripted demo sequence end to end
 * against the real built app (access -> plan -> disruption -> relive ->
 * reset), asserting on markup that actually exists in components/ and
 * app/ rather than guessed attribute names. Runs entirely in demo mode:
 * see playwright.config.ts for why ANTHROPIC_API_KEY is deliberately
 * poisoned for the webServer so no step ever depends on a live model call.
 */

test.setTimeout(60_000);

/**
 * The decision log's <details> opens while streaming and auto-collapses on
 * completion (see components/ActivityPanel.tsx). Click its summary chip to
 * expand it before asserting on log row content -- guarded on the current
 * open state so this never accidentally re-collapses an already-open log.
 */
async function expandDecisionLog(decisionLog: Locator) {
  const details = decisionLog.locator("details.log-details");
  const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    await decisionLog.locator("details.log-details > summary").click();
  }
}

test("scripted demo sequence: access, plan, disruption, relive, reset", async ({ page }) => {
  // ---- 1. Access flow ----
  await page.goto("/enter");
  await page.getByLabel("Access code").fill(process.env.SMOKE_ACCESS_CODE ?? "letmein");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL(/\/plan/);

  // ---- 2. Plan demo: family chip ----
  // The task's suggested selector text ("I'm bringing my dad and two kids...")
  // is the sentence the chip *fills into the textarea*, not the chip button's
  // own visible label -- app/plan/page.tsx renders CHIPS[].label ("Family +
  // gluten-free") as the button text. Selecting by that real accessible name
  // instead.
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Family + gluten-free" }).click();
  await page.getByRole("button", { name: "Plan my night" }).click();

  const contractCard = page.locator('section[aria-label="Constraint contract"]');
  const decisionLog = page.locator('section[aria-label="Decision log"]');

  // Contract card must appear (and be checked) before the itinerary content,
  // per the required sequence.
  await expect(contractCard).toContainText("gluten-free");

  // The itinerary <ol> (ItineraryTimeline) now renders inside the "Tonight's
  // plan" hero, which the flipped page order puts *before* the Decision Log
  // section, so it is located by that wrapper's aria-label rather than by
  // DOM position relative to the log.
  const itineraryList = page.locator(`[aria-label="Tonight's plan"] ol`);
  await expect(itineraryList).toBeVisible();

  const transitStep = itineraryList.locator("li", { hasText: "18:15" });
  await expect(transitStep).toBeVisible();
  await expect(transitStep).toContainText("SNAPSHOT");

  // Decision Log: the constraint_adjusted card renders "You said 6:18; ..."
  // directly as visible text (not just inside a collapsed "Raw event" JSON
  // blob), echoing the family chip's stated train time. Expand the log first,
  // since by now the stream has completed and it has auto-collapsed.
  await expandDecisionLog(decisionLog);
  await expect(decisionLog).toContainText("6:18");

  // ---- 3. Disruption: train delayed +18 min ----
  await page.getByRole("button", { name: "Train delayed +18 min" }).click();

  await expect(itineraryList).toContainText(/replaced|dropped/);
  await expect(itineraryList).toContainText("18:33");

  // The "warmups" ask is the seated_by(warmups) constraint; once the delay
  // pushes seating past warmups it flips from satisfied to traded, and the
  // deterministic decision summary reports it verbatim as "traded: seated_by".
  // The disruption re-plan is a fresh stream, so the log has auto-collapsed
  // again by the time it completes; expand it again before asserting.
  await expandDecisionLog(decisionLog);
  await expect(decisionLog).toContainText(/traded:\s*seated_by/);

  // ---- 4. Relive: Fixture A ----
  await page.goto("/relive");
  const fixtureA = page
    .locator('section[aria-label="Showcase games"] > div', { hasText: "Stanley Cup Final" })
    .getByRole("button", { name: "Relive this game" });
  await fixtureA.click();

  const memoryCard = page.locator("article");
  await expect(memoryCard).toBeVisible({ timeout: 20_000 });
  await expect(memoryCard).toContainText("VGK 5, CAR 4 (2OT)");

  const momentRows = memoryCard.locator("ol > li");
  await expect(momentRows).toHaveCount(3);
  await expect(momentRows.first()).toContainText(/overtime|OT/i);

  // The deterministic recap fallback (lib/server/recap.ts buildDeterministicRecap)
  // renders session.viewZone into the "Your night" paragraph (e.g. "near centre
  // ice") whenever a saved plan's plannedGameId matches the relived game -- true
  // here since the family-chip plan above and Fixture A both use gameId
  // 2025030413. Hard assertion: a regression in that sentence should fail the suite.
  await expect(memoryCard).toContainText(/centre/i);

  // ---- 5. Reset ----
  // ResetControl only renders on /plan; navigate back there to reach it.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  const sessionAfterReset = await page.evaluate(() => window.localStorage.getItem("gameloop.session.v1"));
  expect(sessionAfterReset).toBeNull();

  await page.goto("/plan");
  await expect(page.locator('[aria-label="What GameLoop remembers"]')).toContainText("Nothing saved yet.");
});
