import { test, expect, Locator } from "@playwright/test";

/**
 * Seeded demo smoke: walks the exact scripted demo sequence end to end
 * against the real built app (access -> plan -> disruption -> reset),
 * asserting on markup that actually exists in components/ and app/
 * rather than guessed attribute names. Runs entirely in demo mode: see
 * playwright.config.ts for why ANTHROPIC_API_KEY is deliberately
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

test("scripted demo sequence: access, plan, disruption, reset", async ({ page }) => {
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

  // The auto-collapse contract: once the stream completes, the log folds to
  // its summary strip. Pin that state before the first manual expand (a
  // manual toggle wins for the rest of the plan).
  const logDetails = decisionLog.locator("details.log-details");
  await expect(logDetails).toHaveJSProperty("open", false);

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
  // The disruption re-plan is a fresh stream, so the manual-toggle override
  // resets and the log must auto-collapse again once it completes, even
  // though it was open when the replan started.
  await expect(logDetails).toHaveJSProperty("open", false);
  await expandDecisionLog(decisionLog);
  await expect(decisionLog).toContainText(/traded:\s*seated_by/);

  // ---- 4. Reset ----
  // ResetControl only renders on /plan; navigate back there to reach it.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  const sessionAfterReset = await page.evaluate(() => window.localStorage.getItem("gameloop.session.v1"));
  expect(sessionAfterReset).toBeNull();

  await page.goto("/plan");
  await expect(page.locator('[aria-label="What GameLoop remembers"]')).toContainText("Nothing saved yet.");
});
