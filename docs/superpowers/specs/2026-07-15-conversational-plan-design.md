# Conversational Plan My Night: design

Date: 2026-07-15 overnight session. Branch: feature/conversational-plan off master 0f56de8. Prod stays frozen; no pushes, no deploys.

## Problem

A real user prompt ("plan a basketball game for my family of 2 with 2 adults we eat halal") produced a clarification card asking for an arrival time with no way to answer it. The only recourse was editing the whole prompt and resubmitting, which restarts from a blank parse. Four product gaps: clarifications are dead ends, there is no way to refine a plan conversationally, the system interrogates where it could assume, and domain edges (wrong sport, unsupported dietary needs) are not handled honestly.

Decisions locked with Saad before he went to sleep: wrong-sport requests redirect and plan anyway; party stays the one blocking clarification (now answerable inline) while arrival and food timing become surfaced assumptions; a fourth always-visible example chip demonstrates the clarification flow.

## Findings that shape the design

1. Halal is already supported end to end on the deterministic side: `halal` is in `DietaryNeedSchema` and Anchor Smokehouse (stand-anchor-smoke) carries a halal item. No extraction vocabulary widening is needed for halal. Nut-free is the only dietary enum no stand covers; it already produces an honest infeasible result with violations.
2. The planner already handles a missing arrival: `resolveTransitBranches` enumerates every in-range train and the winning candidate carries the chosen one. Assume-not-interrogate for arrival is therefore a route-level policy change plus provenance surfacing, not planner work.
3. The replan diff baseline recomputes `evaluate(input, {})` with the same request. A conversational refinement changes the request, so the API must carry the prior constraint set for an honest diff baseline.
4. Demo mode's zero-LLM guarantee is satisfiable for both new flows: structured answers build typed `Constraint` objects client side (no model call), and the planner plus merge are deterministic. Only free-text refinement needs a model, so in demo mode free text is refused with scoped copy while quick chips still work.
5. `add-accessibility` in `applyDisruptions` is existing precedent for injecting a constraint into a request server side.

## Approaches considered

For the merge step: (a) model-side merge, where the extraction re-reads the whole conversation and emits a full new contract; (b) deterministic merge, where the model (or a typed control) produces only a delta and `lib/planning` merges it into the base set by fixed rules. Chosen: (b). Model-side merge can silently drop constraints, restarts from a blank parse in spirit, and cannot run in demo mode. Deterministic merge is TDD-able, works zero-LLM for typed answers, and makes every change explainable as a `constraint_adjusted` event.

For the diff baseline: (a) trust prior steps sent by the client; (b) recompute the prior plan server side from prior constraints plus prior disruptions. Chosen: (b), route-level recompute (milliseconds, pure), with the client still keeping prior steps only for readable dropped-row titles as today.

For the wrong-sport signal: (a) deterministic keyword sniffing on raw text; (b) an optional `eventMismatch` field on the extraction schema. Chosen: (b). Keyword sniffing is brittle and bypasses the NL layer; the schema field is additive, hand-reviewed, and eval-guarded.

## Architecture

### 1. Schema additions (lib/planning/schemas.ts, all additive)

- `PlanRequestSchema` gains `eventMismatch: z.object({ requested: z.string() }).optional()`. Set by extraction when the fan asks for a different sport or event at the arena. This changes the compiled extraction grammar, so the eval suite reruns and the warmup note stands.
- `TraceEventSchema` gains `assumption_made { field: string, assumed: string, reason: string }`. Rendered in the Decision Log and next to the contract with an ASSUMED chip (icon plus text, mono caps). Never a dashed border, which stays reserved for SIMULATED.
- `PlanApiInputSchema` gains `refinement` (optional):

```
refinement: {
  baseConstraints: Constraint[] (max 12),
  answerConstraints?: Constraint[] (max 3),   // typed inline answers and quick chips, zero-LLM
  followUpText?: string (1..INPUT_CHAR_CAP),  // free text, live mode only
  prior?: { planId: string, constraints: Constraint[] (max 12), disruptions: DisruptionId[] (max 5) }
}
```

Exactly one of `answerConstraints` or `followUpText` must be present (refined by a Zod refinement). `chipId` enum gains `"vague"` for the fourth demo chip.

### 2. Deterministic merge (lib/planning/merge.ts, new, TDD)

`mergeConstraints(base, deltas) -> { merged, changes }`. Rules: singleton types (arrival, party, budget, seated_by, noise, food_preference) replace in place at the old index; dietary and accessibility are keyed by `value.need` (replace same need, append new needs); new types append. Post-merge cap of 12 drops lowest-tier non-hard constraints from the end, recorded in `changes`. Each change is `{ op: added | replaced, type, before?, after }` and the route emits one `constraint_adjusted` event per change (requested: summary of before or "not set"; resolved: summary of after; reason: "updated in your follow-up"). Constraint summaries reuse one shared summarize helper so the copy matches the contract card.

### 3. Refinement extraction (lib/ai, hand-reviewed on main thread)

New `REFINEMENT_SYSTEM` prompt plus `extractRefinement(text)`: extracts ONLY constraints stated in the follow-up message, never emits clarifications, returns zero constraints for chatter, keeps `offTopic` for actual derailment. Reuses `PlanRequestSchema` so the compiled grammar is a cache hit (no new warmup cost). `EXTRACTION_SYSTEM` gains one rule: a different sport or event at the arena sets `eventMismatch.requested` and is NOT offTopic; everything else in the prompt is untouched to protect the 11/13 baseline.

### 4. Route flow (app/api/plan/route.ts)

When `refinement` is present:

1. Demo mode with `followUpText`: scoped refusal decision event (mirrors the demo-no-chip refusal), done. Zero-LLM holds.
2. `answerConstraints`: merge deterministically. No model call in any mode, so demo mode without a chip is now legal when `refinement.answerConstraints` is present (the guard updates from "demo without chip refuses" to "demo without chip and without a deterministic refinement refuses").
3. `followUpText` (live): `extractRefinement`, then merge. Zero extracted constraints: decision event "no change detected", done, prior plan stands. offTopic: scoped decision, done.
4. Emit `request_parsed` with the merged set (the contract card updates in place), one `constraint_adjusted` per merge change, then proceed to the standard planner path.
5. Diff baseline: when `refinement.prior` is present, recompute `evaluate(loadPlannerInput(prior.constraints), { disruptions: prior.disruptions })` and pass its winner's steps into the new evaluation via a new `EvaluateOptions.priorSteps` option (takes precedence over the existing priorPlanId recompute, which stays untouched for the legacy disruption path). `result.priorPlanId` is set from `prior.planId`.

Clarification policy (applies to initial parses and refinements): only `party` clarifications block. Arrival clarifications are dropped and planning proceeds; after evaluation the route emits `assumption_made` for arrival ("no arrival time given; picked the best scheduled train, [resolved train and clock]; tell me if you are arriving differently") whenever the merged set has no arrival constraint and the winner used transit. Food timing gets the same treatment when stands exist and no food_preference was stated (assumed strategy named from the winner). Budget and dietary clarifications convert to non-blocking decision notes ("planning without a budget cap; add one any time").

`eventMismatch` handling: immediately after the contract is known, emit a decision event naming what Harbourview actually hosts tonight (label composed deterministically from the showcase game's team refs) and continue planning with the extracted constraints.

### 5. Client (app/plan/page.tsx plus components)

New state: `history` (the running list of what the fan has said: initial prompt, each answer, each follow-up) and `lastPlanContext` ({ planId, constraints, disruptions } captured when a feasible plan_result lands). `persistedRequestParsed.constraints` remains the canonical `baseConstraints` source.

- `ConstraintContract` clarification cards become answerable: the party question renders adults and children steppers with a submit that builds a typed party Constraint (priority hard, sourceText "Answered inline: N adults, N children") and posts `refinement { baseConstraints, answerConstraints: [party] }`. Other fields never render as blocking (arrival converts to an assumption, budget and dietary to notes), so party is the only answer form built tonight.
- New `FollowUpComposer` below the plan: persistent input ("Change something or add a detail"), plus three deterministic quick chips that build typed deltas and work in both modes ("Arriving at 6:00 instead" arrival, "Add wheelchair access" accessibility step-free, "Cap food spend at $60" budget). In demo mode the free-text input is disabled with visible copy explaining demo uses the chips; in live mode free text posts `refinement { followUpText }`. The composer renders once a contract exists (it also lets you answer or adjust while a clarification is pending).
- History thread ("What you have told us") renders above the composer; resets on a fresh base submit; every refinement appends.
- Assumption rendering: `assumption_made` gets a Decision Log card (EVENT_TITLE "Assumed") and an ASSUMED chip row under the contract, with copy inviting correction via the composer.
- Disruption buttons: unchanged legacy body while no refinement has happened this session (keeps the scripted demo sequence byte-identical); after any refinement they post through the refinement path so merged constraints survive disruptions.
- Replan visuals: existing replan-dim, diff badges, and dropped rows are reused untouched; refinements set `priorPlanSteps` exactly like disruptions do.

### 6. Demo fixtures (fourth chip)

`CHIPS` gains `{ id: "vague", label: "Short on details", text: "Two kids, one gluten-free, train at 6:18, seated for warmups" }`. `demo-extractions.json` gains a matching entry: gluten-free hard, arrival 6:18 train hard, seated_by warmups high, and `clarificationsNeeded: [{ field: "party", question: "How many adults and how many children are going?" }]`. Answering via the steppers merges a party constraint and replans, all zero-LLM.

### 7. Evals (baseline 13 untouched, new cases appended)

- halal-family (extraction): "We are a family of 2 with 2 adults and we eat halal" expects party 2+0, dietary halal hard, feasible plan (Anchor Smokehouse).
- basketball-redirect (extraction): the user's verbatim prompt expects eventMismatch present, offTopic false, halal and party still extracted, feasible plan.
- nutfree-honest (planner, no model call): hard nut-free expects infeasible, non-empty violations, bestAlternative present.
- refinement cases (new runner kind "refinement" executing extractRefinement plus mergeConstraints against a fixed base): "actually we arrive at 6" (arrival only, no clarifications), "add wheelchair access" (accessibility only), "cheaper food please" (must NOT invent a budget number; food_preference or empty both accepted).

Report deltas against the 11/13 baseline separately from the new cases.

### 8. Smoke (new file e2e/conversational-smoke.spec.ts; demo-smoke.spec.ts untouched)

- Test A, answer a clarification (demo): vague chip, party question card, steppers, submit, contract shows the party chip, plan renders, decision log shows the party constraint_adjusted.
- Test B, follow-up refinement (demo): family chip plan, quick chip refinement, replan with kept and replaced diff badges, history row visible.

Both run under the existing poisoned-key webServer, proving the zero-LLM guarantee through the new paths.

## Error handling

- Refinement extraction failure (live): fallback_used event plus decision copy inviting a retry; prior plan and contract stay rendered.
- Refinement producing an infeasible plan: existing infeasible section, violated chips, and bestAlternative render unchanged; the history row stays so the fan can walk it back with another follow-up.
- Merge overflow past 12 constraints: deterministic drop of lowest-tier non-hard, surfaced as constraint_adjusted.
- Zod rejects malformed refinement payloads at the boundary (400, same as today).

## Testing

Deterministic core first (merge.ts, schema additions, evaluate priorSteps) with exact fixtures; route tests for every new branch (demo guard, answer merge, follow-up merge, party-only blocking, assumption emission, eventMismatch decision, prior diff); component behavior covered by the two new smoke tests; gates (vitest, build, playwright) at every commit; eval rerun after the lib/ai changes with deltas reported.

## Out of scope tonight

Multi-session conversation persistence (history is per-page-load state), answer forms for non-party fields, any prod deploy, any change to the three existing chips or the scripted demo sequence.
