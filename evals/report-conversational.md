# Eval report: conversational plan cases and baseline deltas

Run environment: 2026-07-16 overnight session, local, models claude-haiku-4-5-20251001 (extraction and refinement) and claude-sonnet-5 (narrative), 19 cases in evals/plan-cases.json (the original 13 byte-identical, 6 appended), executed sequentially by evals/run-plan-evals.ts with the env -u ANTHROPIC_API_KEY workaround. Raw per-case results: report-run-3.json (before fixes) and report-run-4.json (after fixes).

## What changed since the 11/13 baseline

Prompt and call changes, all hand-reviewed on the main thread:
1. EXTRACTION_SYSTEM gained one rule: a different sport or event at the arena sets eventMismatch and is not offTopic (commit 861c9ff).
2. New REFINEMENT_SYSTEM and extractRefinement for follow-up deltas, reusing PlanRequestSchema so the compiled grammar is a cache hit (commit 861c9ff).
3. REFINEMENT_SYSTEM gained the bare-time rule (a time-only follow-up uses mode other; the deterministic merge preserves the fan's previous mode), and the extraction call now runs at temperature 0, which was the baseline report's own recorded follow-up for variance reduction (commit bddf5d2).

Deterministic core changes driven by eval failures (commit 78707a8, TDD):
4. mergeConstraints preserves the prior arrival mode when a replacement delta carries mode other; a stated mode still replaces.
5. generateCandidates gates on coverable dietary needs only, so an uncoverable hard need (nut-free: no venue stand carries it) now produces real candidates that each carry a named violation ("dietary: no stand tonight offers nut-free"), an honest infeasible result, a bestAlternative, and a violated dietary chip, instead of zero candidates and a generic message.

## Run 1 (report-run-3.json, before fixes): 14 of 19

New-case failures that were real product gaps, both fixed deterministically: nutfree-honest (zero candidates, no bestAlternative) and refine-arrival ("actually we arrive at 6" extracted mode other, which wiped the prior train mode and made every candidate infeasible). One baseline case (paraphrase-1) also threw a one-off "No object generated" parse error at default temperature.

Probes before fixing (3 runs of the refinement delta, 2 each of the paraphrases) confirmed: mode other is the model's consistent, honest reading of a bare time change, and the paraphrase food_preference drop is the baseline's documented variance class, not something the eventMismatch rule introduced.

## Run 2 (report-run-4.json, after fixes): 17 of 19

- All 6 new cases pass: halal-family, basketball-redirect, nutfree-honest, refine-arrival, refine-access, refine-vague-cheaper.
- Baseline 13: 11 of 13, the same count as the recorded 11/13 baseline, with a different mix. abbreviated-asks now passes (at temperature 0 the model consistently asks the party clarification, which is the D1 split-pair behavior the case was designed to pin). paraphrase-1 and paraphrase-2 now both fail the tier-gap check the same way: the implicit food_preference in "warmups matter more to us than food variety" phrasing is consistently not extracted. Temperature 0 converted this from a per-run coin flip (paraphrase-1 failed in the baseline too) into a stable outcome.
- Every failure-class case still passes: injection (both), impossibility, off-topic, contradiction, tampered memory, tool timeout, no-market-strings.
- The demo path (primary prompt, budget chip, all four demo fixtures, disruptions, refinements) is fully green.

## Verdict against the baseline

No net regression: the baseline block holds at 11/13 and the failing class (implicit food_preference on paraphrase inputs) is the same residual class the baseline report documented. The conversational surface adds 6 of 6.

## Candidate follow-up, deliberately not applied inside the budgeted cycle

One prompt line would likely restore the paraphrases: the existing pairwise-comparison rule says X lands above Y but never says to extract Y; an explicit "a comparison states both sides; extract the lesser side too, at a lower tier" should pin food_preference on both paraphrases. Not applied tonight because the budgeted fix-and-rerun cycle was already spent on the two real product gaps, and a further prompt change would put the 11 passing baseline cases back at risk the night before the demo. Recorded here for the buffer phase, mirroring the baseline report's own discipline.
