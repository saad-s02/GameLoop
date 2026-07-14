// evals/run-plan-evals.ts
//
// Runs the 13 pinned eval cases from evals/plan-cases.json against the real pipeline:
// live extractPlanRequest calls for extraction cases, the deterministic planner
// (loadPlannerInput + evaluate) for planner cases, the server-side session validator for
// memory cases, the live NHL client for the tool-timeout case, and live explainPlanStream
// plus generateRecap calls for the narrative case.
//
// Usage:
//   node --import tsx evals/run-plan-evals.ts             (live run, writes a report)
//   node --import tsx evals/run-plan-evals.ts --dry-run    (load and list cases only, no live calls)
//
// Model-calling cases run sequentially, never with Promise.all, so latency measurements
// stay clean and the CALL_LIMITS maxRetries:1 semantics in lib/ai/models.ts apply as-is.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { extractPlanRequest, explainPlanStream, generateRecap } from "../lib/ai/outputs";
import { EXTRACTION_SYSTEM } from "../lib/ai/prompts";
import { loadPlannerInput } from "../lib/planning/adapters";
import { evaluate } from "../lib/planning/evaluate";
import { Constraint, PlanRequest, PlanResult } from "../lib/planning/schemas";
import { buildDeterministicRecap, buildWarmupMomentPackage, resolveSessionContext } from "../lib/server/recap";
import { buildExplainInput } from "../lib/server/explainInput";
import { fetchLiveShowcaseGame } from "../lib/games/client";
import { loadShowcaseGame } from "../lib/data/load";
import { buildMomentPackage } from "../lib/games/moments";

// ---------- case file loading ----------

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CASES_PATH = path.join(EVALS_DIR, "plan-cases.json");

const CaseSchema = z.object({
  id: z.string(),
  kind: z.enum(["extraction", "planner", "memory", "live-timeout", "narrative"]),
  input: z.unknown(),
  expect: z.record(z.string(), z.unknown()),
});
type Case = z.infer<typeof CaseSchema>;
const CasesFileSchema = z.array(CaseSchema);

function loadCases(): Case[] {
  const raw = readFileSync(CASES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return CasesFileSchema.parse(parsed);
}

// ---------- small helpers ----------

interface CaseResult {
  id: string;
  kind: string;
  pass: boolean;
  reason: string;
  elapsedMs?: number;
}

function errMsg(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, " ").trim();
}

function pass(c: Case, reason = "all checks passed"): CaseResult {
  return { id: c.id, kind: c.kind, pass: true, reason };
}

function fail(c: Case, reasons: string[]): CaseResult {
  return { id: c.id, kind: c.kind, pass: false, reason: reasons.join("; ") };
}

const TIER_ORDER: Record<string, number> = { hard: 0, high: 1, medium: 2, low: 3 };
function tierIndex(p: string): number {
  return TIER_ORDER[p] ?? 99;
}

function findConstraint<T extends Constraint["type"]>(
  constraints: Constraint[],
  type: T,
): Extract<Constraint, { type: T }> | undefined {
  return constraints.find((x): x is Extract<Constraint, { type: T }> => x.type === type);
}

function constraintsOfType<T extends Constraint["type"]>(
  constraints: Constraint[],
  type: T,
): Extract<Constraint, { type: T }>[] {
  return constraints.filter((x): x is Extract<Constraint, { type: T }> => x.type === type);
}

/** The seated_by milestone of a constraint, or undefined for every other constraint type. */
function constraintMilestone(c: Constraint): string | undefined {
  return c.type === "seated_by" ? c.value.milestone : undefined;
}

// Loosely typed accessors into a case's expect block (an arbitrary fixture-defined shape, not a
// runtime request boundary), scoped narrowly at each call site instead of a blanket `any`.
type ExpectRecord = Record<string, unknown>;
interface PartySizeExpect {
  adults: number;
  children: number;
}
interface DietaryIncludeExpect {
  need: string;
  priority?: string;
}
interface BudgetConstraintExpect {
  maxTotalCad: number;
  priority?: string;
}
interface TierGapExpect {
  higherType: string;
  higherMilestone?: string;
  lowerType: string;
}

// ---------- hardcoded contracts for non-extraction cases ----------

const SHOWCASE_GAME_ID = "2025030413";

/** The primary demo contract, matching lib/data/demo-extractions.json's "family" entry. */
const PRIMARY_CASE_REQUEST: PlanRequest = {
  constraints: [
    { type: "party", value: { adults: 2, children: 2 }, priority: "hard", sourceText: "I'm bringing my dad and two kids" },
    { type: "dietary", value: { need: "gluten-free", severity: "intolerance" }, priority: "hard", sourceText: "One child needs gluten-free food" },
    { type: "arrival", value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" }, priority: "hard", sourceText: "Our train arrives at 6:18" },
    { type: "seated_by", value: { milestone: "warmups" }, priority: "high", sourceText: "seeing warmups matters more than having many food choices" },
    { type: "food_preference", value: { preference: "many-choices" }, priority: "medium", sourceText: "seeing warmups matters more than having many food choices" },
  ],
  clarificationsNeeded: [],
  offTopic: false,
};

/** Literal, code-built PlanRequest per planner-kind case (no model call). */
const PLANNER_REQUESTS: Record<string, PlanRequest> = {
  "impossible-arrival": {
    constraints: [
      // "land" (a flight, not a scheduled train) has no usable transit option under mode "other",
      // so every candidate carries the hard arrival violation regardless of the clock value.
      { type: "arrival", value: { statedClock: "7:45", normalizedClock: "19:45", mode: "other" }, priority: "hard", sourceText: "We land at 7:45" },
      { type: "seated_by", value: { milestone: "warmups" }, priority: "hard", sourceText: "absolutely must be seated for warmups" },
    ],
    clarificationsNeeded: [],
    offTopic: false,
  },
  "contradictory-budget": {
    constraints: [
      { type: "party", value: { adults: 4, children: 0 }, priority: "hard", sourceText: "the four of us" },
      { type: "budget", value: { maxTotalCad: 20 }, priority: "hard", sourceText: "Keep the night under $20 total for the four of us" },
    ],
    clarificationsNeeded: [],
    offTopic: false,
  },
};

// ---------- extraction cases ----------

async function runExtractionCase(c: Case): Promise<CaseResult> {
  const e = c.expect as ExpectRecord;
  const reasons: string[] = [];

  let request: PlanRequest;
  try {
    request = await extractPlanRequest(c.input as string);
  } catch (err) {
    return fail(c, [`extractPlanRequest threw: ${errMsg(err)}`]);
  }

  const allowOffTopicTrue = e.allowOffTopicTrue === true;
  const tookAlternateBranch = allowOffTopicTrue && request.offTopic === true;

  if (!tookAlternateBranch) {
    if (e.offTopic !== undefined && request.offTopic !== e.offTopic) {
      reasons.push(`offTopic expected ${e.offTopic}, got ${request.offTopic}`);
    }

    if (e.partySize) {
      const wanted = e.partySize as PartySizeExpect;
      const party = findConstraint(request.constraints, "party");
      if (!party) reasons.push("missing party constraint");
      else if (party.value.adults !== wanted.adults || party.value.children !== wanted.children) {
        reasons.push(`party mismatch: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(party.value)}`);
      }
    }

    if (e.dietaryIncludes) {
      for (const d of e.dietaryIncludes as DietaryIncludeExpect[]) {
        const found = constraintsOfType(request.constraints, "dietary").find(
          (x) => x.value.need === d.need && (!d.priority || x.priority === d.priority),
        );
        if (!found) reasons.push(`missing dietary constraint need=${d.need}${d.priority ? " priority=" + d.priority : ""}`);
      }
    }

    if (e.arrivalNormalizedClock) {
      const arrival = findConstraint(request.constraints, "arrival");
      if (!arrival) reasons.push("missing arrival constraint");
      else if (arrival.value.normalizedClock !== e.arrivalNormalizedClock) {
        reasons.push(`arrival normalizedClock expected ${e.arrivalNormalizedClock}, got ${arrival.value.normalizedClock}`);
      }
    }

    if (e.noisePreference) {
      const noise = findConstraint(request.constraints, "noise");
      if (!noise) reasons.push("missing noise constraint");
      else if (noise.value.preference !== e.noisePreference) {
        reasons.push(`noise preference expected ${e.noisePreference}, got ${noise.value.preference}`);
      }
    }

    if (e.budgetConstraint) {
      const wanted = e.budgetConstraint as BudgetConstraintExpect;
      const budget = findConstraint(request.constraints, "budget");
      if (!budget) reasons.push("missing budget constraint");
      else {
        if (budget.value.maxTotalCad !== wanted.maxTotalCad) {
          reasons.push(`budget maxTotalCad expected ${wanted.maxTotalCad}, got ${budget.value.maxTotalCad}`);
        }
        if (wanted.priority && budget.priority !== wanted.priority) {
          reasons.push(`budget priority expected ${wanted.priority}, got ${budget.priority}`);
        }
      }
    }

    if (e.tierGap) {
      const tg = e.tierGap as TierGapExpect;
      const higher = request.constraints.find(
        (x) => x.type === tg.higherType && (!tg.higherMilestone || constraintMilestone(x) === tg.higherMilestone),
      );
      const lower = request.constraints.find((x) => x.type === tg.lowerType);
      if (!higher || !lower) {
        reasons.push(`tier gap check missing constraint(s): higher present=${!!higher}, lower present=${!!lower}`);
      } else if (tierIndex(higher.priority) >= tierIndex(lower.priority)) {
        reasons.push(`expected ${tg.higherType} priority above ${tg.lowerType}, got ${higher.priority} vs ${lower.priority}`);
      }
    }

    if (e.constraintTypesOnly) {
      const allowed = e.constraintTypesOnly as string[];
      const bad = request.constraints.filter((x) => !allowed.includes(x.type));
      if (bad.length > 0) reasons.push(`unexpected constraint types present: ${bad.map((x) => x.type).join(",")}`);
    }

    if (e.constraintsEmpty && request.constraints.length !== 0) {
      reasons.push(`expected no constraints, got ${request.constraints.length}`);
    }

    if (Array.isArray(e.clarificationsNeeded) && e.clarificationsNeeded.length === 0) {
      if (request.clarificationsNeeded.length !== 0) {
        reasons.push(`expected no clarifications, got ${request.clarificationsNeeded.length}`);
      }
    }

    if (e.clarificationsNeededFields) {
      for (const field of e.clarificationsNeededFields as string[]) {
        if (!request.clarificationsNeeded.some((x) => x.field === field)) {
          reasons.push(`expected a clarification for field ${field}`);
        }
      }
    }
  }

  if (e.noSystemPromptLeak) {
    const dump = JSON.stringify(request);
    const marker = EXTRACTION_SYSTEM.slice(0, 40);
    if (dump.includes(marker)) reasons.push("extraction output appears to leak system prompt text");
  }

  // Planner follow-through, only when the expect block asks for it (cases 1, 3, 4, 13).
  if (reasons.length === 0 && (e.feasiblePlan !== undefined || e.adjustmentResolvedContains !== undefined)) {
    try {
      const { input } = loadPlannerInput(request);
      const result = evaluate(input);
      if (e.feasiblePlan !== undefined && result.feasible !== e.feasiblePlan) {
        reasons.push(`feasiblePlan expected ${e.feasiblePlan}, got ${result.feasible}`);
      }
      if (e.adjustmentResolvedContains !== undefined) {
        const wantedSubstr = e.adjustmentResolvedContains as string;
        const found = result.adjustments.some((a) => a.resolved.includes(wantedSubstr));
        if (!found) reasons.push(`no adjustment resolved value contains "${wantedSubstr}"`);
      }
    } catch (err) {
      reasons.push(`planner follow-through threw: ${errMsg(err)}`);
    }
  }

  return reasons.length === 0 ? pass(c) : fail(c, reasons);
}

// ---------- planner cases (no model call) ----------

function runPlannerCase(c: Case): CaseResult {
  const e = c.expect as ExpectRecord;
  const reasons: string[] = [];
  const request = PLANNER_REQUESTS[c.id];
  if (!request) return fail(c, [`no hardcoded PlanRequest wired for case id ${c.id}`]);

  let result: PlanResult;
  try {
    const { input } = loadPlannerInput(request);
    result = evaluate(input);
  } catch (err) {
    return fail(c, [`evaluate threw: ${errMsg(err)}`]);
  }

  const expectedFeasible = e.feasible !== undefined ? e.feasible : e.feasiblePlan;
  if (expectedFeasible !== undefined && result.feasible !== expectedFeasible) {
    reasons.push(`feasible expected ${expectedFeasible}, got ${result.feasible}`);
  }
  if (e.violationsNonEmpty && result.violations.length === 0) {
    reasons.push("expected non-empty violations, got none");
  }
  if (e.bestAlternativePresent && !result.bestAlternative) {
    reasons.push("expected bestAlternative to be present");
  }

  if (e.budgetConstraint) {
    const wanted = e.budgetConstraint as BudgetConstraintExpect;
    const budget = findConstraint(request.constraints, "budget");
    if (!budget) reasons.push("hardcoded contract missing budget constraint");
    else {
      if (budget.value.maxTotalCad !== wanted.maxTotalCad) {
        reasons.push(`budget maxTotalCad expected ${wanted.maxTotalCad}, got ${budget.value.maxTotalCad}`);
      }
      if (wanted.priority && budget.priority !== wanted.priority) {
        reasons.push(`budget priority expected ${wanted.priority}, got ${budget.priority}`);
      }
    }
  }

  if (e.neverSilentOverage && result.feasible && result.plan) {
    const budget = findConstraint(request.constraints, "budget");
    if (budget && result.plan.estimatedCostCad > budget.value.maxTotalCad) {
      reasons.push(`silent overage: plan cost ${result.plan.estimatedCostCad} exceeds budget ${budget.value.maxTotalCad}`);
    }
  }

  return reasons.length === 0 ? pass(c) : fail(c, reasons);
}

// ---------- memory cases (server-side session validator, no model call) ----------

function runMemoryCase(c: Case): CaseResult {
  const e = c.expect as ExpectRecord;
  const reasons: string[] = [];
  const input = c.input as { gameId: string; sessionContext: unknown };

  const { session, dropped } = resolveSessionContext(input.sessionContext, input.gameId);

  if (e.expectDropped !== undefined && dropped !== e.expectDropped) {
    reasons.push(`expected dropped=${e.expectDropped}, got ${dropped}`);
  }
  if (e.expectSessionNull !== undefined && (session === null) !== e.expectSessionNull) {
    reasons.push(`expected session null=${e.expectSessionNull}, got session null=${session === null}`);
  }

  if (e.recapNoYourNight) {
    const pkg = buildWarmupMomentPackage();
    const memory = buildDeterministicRecap(pkg, session);
    if (memory.yourNight !== undefined) {
      reasons.push("expected recap to omit yourNight when session was dropped");
    }
  }

  return reasons.length === 0 ? pass(c) : fail(c, reasons);
}

// ---------- live-timeout case ----------

async function runLiveTimeoutCase(c: Case): Promise<CaseResult> {
  const e = c.expect as ExpectRecord;
  const reasons: string[] = [];
  const input = c.input as { gameId: string; nhlApiBase: string; liveGamesEnv: string };

  const prevBase = process.env.NHL_API_BASE;
  const prevLive = process.env.LIVE_GAMES;
  process.env.NHL_API_BASE = input.nhlApiBase;
  process.env.LIVE_GAMES = input.liveGamesEnv;

  let fallbackTriggered = false;
  const start = Date.now();
  try {
    await fetchLiveShowcaseGame(input.gameId);
  } catch {
    fallbackTriggered = true;
  }
  const elapsedMs = Date.now() - start;

  if (prevBase === undefined) delete process.env.NHL_API_BASE;
  else process.env.NHL_API_BASE = prevBase;
  if (prevLive === undefined) delete process.env.LIVE_GAMES;
  else process.env.LIVE_GAMES = prevLive;

  if (!fallbackTriggered) {
    reasons.push("expected fetchLiveShowcaseGame to reject against the unreachable endpoint, it resolved instead");
  } else {
    // Same catch-and-fall-back-to-snapshot shape as app/api/relive/route.ts's fallback_used path.
    const snapshotGame = loadShowcaseGame(input.gameId);
    if (snapshotGame.source !== "snapshot") reasons.push("snapshot fallback game did not report source snapshot");
  }

  if (e.budgetMs !== undefined) {
    const budgetMs = e.budgetMs as number;
    if (elapsedMs >= budgetMs) reasons.push(`fallback took ${elapsedMs} ms, expected under ${budgetMs} ms`);
  }

  const reason =
    reasons.length === 0
      ? `fallback matches app message "${String(e.fallbackReason)}" (${elapsedMs} ms)`
      : reasons.join("; ");
  return { id: c.id, kind: c.kind, pass: reasons.length === 0, reason };
}

// ---------- narrative case (live explanation + recap for the primary case) ----------

async function runNarrativeCase(c: Case): Promise<CaseResult> {
  const e = c.expect as ExpectRecord;
  const reasons: string[] = [];
  const forbidden = (e.forbiddenStrings as string[]) ?? [];

  let explanationText = "";
  try {
    const { input } = loadPlannerInput(PRIMARY_CASE_REQUEST);
    const result = evaluate(input);
    if (!result.feasible) {
      return fail(c, ["primary case planner result was infeasible, cannot build explanation input"]);
    }
    const explainInput = buildExplainInput(result);
    const stream = await explainPlanStream(explainInput);
    for await (const chunk of stream) explanationText += chunk;
  } catch (err) {
    return fail(c, [`explainPlanStream failed: ${errMsg(err)}`]);
  }

  let recapText = "";
  try {
    const game = loadShowcaseGame(SHOWCASE_GAME_ID);
    const pkg = buildMomentPackage(game);
    const memory = await generateRecap(pkg, null);
    recapText = JSON.stringify(memory);
  } catch (err) {
    return fail(c, [`generateRecap failed: ${errMsg(err)}`]);
  }

  const combined = `${explanationText}\n${recapText}`;
  for (const s of forbidden) {
    if (combined.includes(s)) reasons.push(`forbidden string found: "${s}"`);
  }

  return reasons.length === 0 ? pass(c, "no forbidden market strings found") : fail(c, reasons);
}

// ---------- dispatch ----------

async function runCase(c: Case): Promise<CaseResult> {
  switch (c.kind) {
    case "extraction":
      return runExtractionCase(c);
    case "planner":
      return runPlannerCase(c);
    case "memory":
      return runMemoryCase(c);
    case "live-timeout":
      return runLiveTimeoutCase(c);
    case "narrative":
      return runNarrativeCase(c);
  }
}

// ---------- report writing ----------

function nextReportPath(dir: string): string {
  let n = 1;
  while (existsSync(path.join(dir, `report-run-${n}.json`))) n++;
  return path.join(dir, `report-run-${n}.json`);
}

// ---------- main ----------

async function main() {
  const cases = loadCases();
  const dryRun = process.argv.includes("--dry-run");

  console.log(`Loaded ${cases.length} eval cases from ${CASES_PATH}`);
  for (const c of cases) console.log(`  ${c.id} [${c.kind}]`);

  if (dryRun) {
    console.log("Dry run complete. No live calls were made.");
    return;
  }

  const results: CaseResult[] = [];
  for (const c of cases) {
    const start = Date.now();
    let result: CaseResult;
    try {
      result = await runCase(c);
    } catch (err) {
      result = { id: c.id, kind: c.kind, pass: false, reason: `case runner threw: ${errMsg(err)}` };
    }
    result.elapsedMs = Date.now() - start;
    results.push(result);
    console.log(`${result.pass ? "PASS" : "FAIL"} ${c.id}: ${result.reason}`);
  }

  const passCount = results.filter((r) => r.pass).length;
  console.log(`passed ${passCount} of ${results.length}`);

  const reportPath = nextReportPath(EVALS_DIR);
  writeFileSync(
    reportPath,
    JSON.stringify({ ranAt: new Date().toISOString(), passCount, total: results.length, results }, null, 2) + "\n",
  );
  console.log(`Report written to ${reportPath}`);

  process.exitCode = passCount === results.length ? 0 : 1;
}

main().catch((err) => {
  console.error(`Eval runner crashed: ${errMsg(err)}`);
  process.exitCode = 1;
});
