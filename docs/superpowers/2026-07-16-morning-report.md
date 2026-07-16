# Morning report: conversational Plan My Night (overnight 2026-07-15 to 07-16)

Branch: feature/conversational-plan, 16 commits on top of master 0f56de8. Prod untouched and frozen at gameloop-gilt.vercel.app. Final gate state: npx vitest run 206/206, npm run build clean, npx playwright test 3/3 (the original scripted demo smoke unmodified and green at every commit). Spec: docs/superpowers/specs/2026-07-15-conversational-plan-design.md. Plan: docs/superpowers/plans/2026-07-15-conversational-plan.md.

## The four goals, and where each landed

### 1. Answerable clarifications (done, zero-LLM)

A clarification is no longer a dead end. Party questions render adults and children inputs with a Use this button directly inside the question card; the answer becomes a typed hard constraint, merges deterministically into the existing contract server side, and replans without re-extracting anything. A fourth example chip, Short on details ("Two kids, one gluten-free, train at 6:18, seated for warmups"), demonstrates the flow in demo mode with zero model calls. Only party blocks planning now; everything else proceeds.

### 2. Conversational refinement (done; typed paths zero-LLM, free text live)

Every plan now carries a persistent composer ("Change something or add a detail") with three deterministic quick chips (arrival 6:00, wheelchair access, food budget $60) that work in demo and live, plus a free-text input that runs live delta extraction ("actually we arrive at 6", "add wheelchair access", "cheaper food"). Deltas merge into the prior constraint set by fixed rules (singletons replace in place, dietary and accessibility key by need, cap of 12 drops lowest tier non-hard), every change is emitted as a visible constraint_adjusted event, the replan diffs against the true prior plan (kept, replaced, dropped badges reuse the existing grammar), priorPlanId and sessionContext are preserved, and a running history thread ("What you have told us") records every utterance. In demo mode free text is honestly disabled with copy pointing at the quick chips, keeping the zero-LLM guarantee.

### 3. Assume, don't interrogate (done)

Missing arrival no longer blocks: the planner picks the best scheduled train and the route surfaces it as an assumption event with provenance ("picked Lakeshore West arriving 18:15... tell us in a follow-up if you are arriving differently"), rendered both in the decision log and in an Assumed for this plan row near the contract. Missing food timing gets the same treatment. Missing budget and dietary become non-blocking notes. A bare time change in a follow-up keeps the fan's previous travel mode (deterministic merge rule), so "actually we arrive at 6" refines the train plan instead of destroying it.

### 4. Honest domain edges (done)

The verbatim failing prompt ("plan a basketball game for my family of 2 with 2 adults we eat halal") now produces: an honest redirect decision ("You asked about basketball game. Tonight Harbourview Arena hosts hockey: Vegas Golden Knights versus Carolina Hurricanes, puck drop 19:30. Planning your night around it."), a real plan with halal satisfied through Anchor Smokehouse (the venue fixture already carried a halal item; no vocabulary widening was needed), and the standard cross-contact disclaimer. Verified live tonight against a local production build. Uncoverable dietary needs (nut-free is the only enum value no stand carries) now yield a named violation ("dietary: no stand tonight offers nut-free"), a violated chip, and a best alternative, instead of a generic message with no alternative.

## Eval results (prompts changed, so the suite reran)

Full detail in evals/report-conversational.md; raw runs in report-run-3.json and report-run-4.json. Headline: 17 of 19. All 6 new conversational cases pass (halal, basketball redirect, nut-free honesty, three refinement deltas). The original 13 hold at 11 of 13, the same count as the recorded baseline, with a different mix: temperature 0 (the baseline report's own deferred follow-up, applied tonight) made abbreviated-asks consistently correct while both paraphrases now consistently drop the implicit food_preference, the residual class the baseline had already documented. A candidate one-line prompt fix is recorded but deliberately not applied hours before the demo.

## Extended smoke

New e2e/conversational-smoke.spec.ts: answer-a-clarification (vague chip, steppers, merged contract, assumption row) and follow-up-refinement (quick chip, 18:12 resnap, kept and replaced badges, history row, demo free-text refusal). Both run against the poisoned-key webServer, so their green status is proof the zero-LLM guarantee survives the new paths. The original demo-smoke spec is untouched.

## Per-commit summary

1. 6860970 spec, c2a86f9 plan documents
2. 4a977c9 schemas: assumption_made event, eventMismatch, refinement input, vague chip id
3. 41a7b6d + 867d969 deterministic merge module with full test coverage
4. 42205f4 evaluate accepts priorSteps (true prior diffs for refinements)
5. 2e38230 vague demo fixture (party clarification)
6. 6b99226 route: party-only blocking, arrival and food timing assumptions
7. 861c9ff lib/ai: refinement delta extraction, eventMismatch rule (hand-reviewed)
8. bec7346 route: refinement path, deterministic merge wiring, demo guard, prior diffs
9. 1fa046c + ea20e1d honest event redirect with fiction-safe "versus" copy
10. 36eab3c UI: answerable party clarification, Short on details chip
11. a4754ac UI: composer, quick chips, history, assumption row, hybrid disruptions
12. 78707a8 planning fixes: arrival mode preservation, uncoverable dietary honesty
13. bddf5d2 lib/ai: bare-time rule, temperature 0 (hand-reviewed)
14. 79eabc4 eval suite: 6 new cases, refinement runner kind, delta report
15. c6689d8 conversational smoke spec
16. 48b20b7 constraint_adjusted copy polish for newly added constraints

Every task went through an implementer subagent (sonnet) plus an opus review with fix loops, except the lib/ai and eval tasks, which were hand-written and hand-reviewed on the main thread per the standing rule.

## Recommendation for Thursday's demo script

Include the conversational flow, in demo mode only, as two beats appended to the proven sequence; keep live free text as an optional encore, not scripted.

The two beats are Short on details (chip, party question, inline answer, plan with the assumption row) and Arriving at 6:00 instead (quick chip, replan with kept, replaced, dropped badges and the history thread). Rationale: both are fully deterministic and zero-LLM (the poisoned-key smoke proves it), they rehearse identically every time, they reuse the Lit Sheet's existing visual grammar so nothing new can surprise you, and together they directly answer the dead-end critique that motivated tonight. The basketball-halal redirect and free-text refinement work and were verified live tonight, but they ride live extraction latency and variance, so show them only if the room asks.

The real decision is the deploy, since the demo runs against frozen prod. If you have time this morning for the full freeze protocol (review the branch, merge, conscious re-verify on master, redeploy, deployed smoke with the real access code, one rehearsal of the two new beats, warmup 15 minutes before), the risk is low: every commit kept the original sequence green, and the two new beats are covered by the new smoke. If the morning is tight, keep prod as is and run the proven script; the conversational flow can be shown from a local production build as a second act, exactly as it was verified tonight. Screenshots from tonight's walkthrough are in the session scratchpad (01-clarification-card, 02-answered-plan-with-assumption, 03-refined-diff-history, 04-live-basketball-redirect, 05-live-followup).

## Final whole-branch review

Verdict READY (opus, full master..HEAD diff). All branch invariants verified with evidence: demo zero-LLM holds through layered route guards plus the Zod answer-or-followUp exclusivity; the family-chip event stream is provably unchanged (fixture carries arrival and food preference so no assumptions fire, plus a dedicated test); deterministic-core, Zod-boundary, lib/ai-confinement, no-new-deps, and copy-discipline checks all pass. No Critical or Important findings. One new defensive-depth note: the merged constraint set is not re-parsed against the schema's 12-cap after an all-hard overflow, a state the UI cannot produce; recorded with the other minors below for post-demo cleanup.

## Known polish items (recorded, not blocking)

- Mode-less NEW arrivals (no prior arrival to inherit a mode from) plan as a doors-open walk-in and honestly mark the arrival chip traded; offering the nearest train explicitly would read better.
- The paraphrase food_preference prompt line (evals/report-conversational.md).
- Reviewer minors held for the whole-branch review: a shared type for merge adjustment shapes, stale pre-fix violation wording as synthetic input in explainInput.test.ts, loose regex scoping in the new smoke.
