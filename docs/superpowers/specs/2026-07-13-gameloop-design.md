# GameLoop design specification

Date: Monday July 13, 2026. Status: approved through brainstorm; supersedes nothing (PRD.md remains the product spec; this document is the build design against PRD.md as amended by the 13 accepted PRD-DELTA edits). Inputs: PRD.md, BASELINE.md (Phase 0 verified facts), PRD-DELTA.md, and an eight-lens adversarial gap review whose fixes are folded in below. Demo: Thursday July 16. Build target: today.

## 1. Locked decisions

1. All 13 PRD-DELTA edits are accepted, including D1 (eval case split) and D7 (planner visibly snaps the fan's "6:18" to the real 18:15 Lakeshore West arrival).
2. Model routing: `claude-haiku-4-5-20251001` for constraint extraction, `claude-sonnet-5` for plan explanation and recap. Thinking disabled (or adaptive effort low, measured) on Sonnet 5 calls. maxRetries 1, transport failures only. Structured-output schemas warmed via a dedicated warmup route, re-triggered same day as the demo.
3. Demo chips trigger real live model calls. `?demo=1` is the disclosed zero-LLM fallback mode (precomputed extraction fixtures, deterministic decision summaries), used only if budget or connectivity fails.
4. Demo URL and auth: production URL plus access code. A one-time code entry POST sets a signed cookie; both API routes require it server side. The code is never carried in the query string.
5. Build orchestration: hybrid parallel. Main thread locks schemas and contracts, parallel Sonnet subagents implement modules against TDD briefs, main thread reviews and integrates. Opus for anything subtle.

## 2. Architecture and module boundaries

Stack (pinned, BASELINE appendix): Next.js 16.2.10 App Router, TypeScript strict, Tailwind 4.3.2, ai 7.0.26 with @ai-sdk/anthropic 4.0.14 (ESM only, Node 22), zod 4.4.3, vitest 4.1.10, Playwright 1.61.1. Vercel Hobby, Fluid compute, Node 22 runtime, single WAF rate rule scoped to path starts-with /api.

- `lib/planning/schemas.ts`: every Zod schema. Locked first; all parallel work builds against it. Externally sourced types carry a required `source: "live" | "snapshot" | "simulated"` field. `Constraint.value` is a discriminated union keyed by constraint type (never `unknown`; an unconstrained field cannot participate in schema-constrained decoding).
- `lib/games/normalize.ts`: raw NHL payload to `NormalizedPlay[]`. Two call sites: offline fixture build script (committed reduced JSON) and the feature-flagged live adapter. Encodes the verified feed realities: order by `sortOrder` (eventId is not monotonic), strength derived from `situationCode` plus `eventOwnerTeamId`, running score propagated across non-goal plays, OT depth from `period.number - regPeriods`, scorer names joined from `rosterSpots`, nhle.com asset URLs stripped, and the real venue field scrubbed (the fiction owns venue identity; raw payloads stay gitignored).
- `lib/games/moments.ts`: `NormalizedPlay[]` to a ranked MomentPackage. Pure.
- `lib/planning/candidates.ts` and `evaluate.ts`: bounded enumeration, feasibility, scoring, deterministic selection. Pure.
- `lib/ai/`: models.ts (pinned IDs, thinking config, maxTokens, maxRetries), prompts.ts (including the data-not-instructions delimiter convention and the no-geography rule), outputs.ts (Output.object schemas). The only module that calls Anthropic.
- `lib/trace/`: SSE envelope and typed emitter. Every frame is exactly one JSON.stringify'd envelope per data: line; model text only ever appears as a JSON string value. Envelope carries `requestId` and `traceSchemaVersion`.
- `lib/data/`: showcase-game-a.json, showcase-game-b.json (reduced, sourceMeta with measured raw sizes), venue.json, transit-snapshot.json.
- `app/api/plan`, `app/api/relive`: thin orchestrators (validate, run pipeline, emit events). `app/api/warmup`: fires one throwaway structured-output call per schema. Access-code check enforced in all three.

## 3. Time model

All time math is in normalized minutes with puck drop = 0; pre-game times are negative. Every module uses this epoch; no module invents its own zero. GTFS clock strings and event clock strings are display artifacts formatted directly from source HH:MM values (no Date round-trip, so server UTC versus client Toronto cannot shift them). A test asserts rendered times match source strings regardless of process TZ.

ShowcaseGame carries SIMULATED event-operations fields: `doorsOpenAt`, `warmupStartAt`, `puckDropAt` (clock times on the fictional "tonight"). The real game date and Pacific start time never surface in Plan mode; game times are re-anchored to one coherent fictional evening consistent with the 18:15 transit arrival. Authored event times (pinned): doorsOpenAt 17:45, warmupStartAt 18:40, puckDropAt 19:30. Tension check: the 18:15 arrival plus the venue walk seats the family about 18:30, ahead of warmups at 18:40; the +18 disruption (18:33 arrival) lands them about 18:48, after warmups begin, flipping warmups from satisfied to traded while the plan stays feasible for puck drop. This authoring constraint is verified by test against these pinned values.

## 4. Deterministic planner

**Enumeration space:** gate x stand-set x transit option x arrival strategy, where stand-set is bounded to cardinality 0, 1, or 2, restricted to sets that cover the required dietary constraints, with dominated stands pruned (same coverage, strictly worse wait plus walk). Arrival strategy is a small explicit enum (pickup-en-route, pickup-after-seating). Candidate count is capped by test for the demo prompt.

**Seat assignment:** the winning candidate gets a deterministic section assignment (gate-to-nearest-suitable-section lookup honoring accessibility), which populates `SessionContext.seatSection` and `viewZone`. Without this the Relive centre-ice callback can never fire.

**Selection:** score by the PRD formula, then a total deterministic order: score, then fewer walking minutes, then fewer wait minutes, then lexicographic composite candidate id (gate|stands|transit|strategy). Enumeration iterates ordered arrays only. Test: evaluate() twice on identical input yields identical full output (idempotent planner is a stated NFR and an expected interviewer probe).

**Replan:** same pipeline, mutated inputs, priorPlanId for diffing via stable step IDs. Disruptions mutate the resolved values (the 18:15 arrival), not the belief string ("6:18"). The preservation guarantee, stated precisely: if the feasible set is non-empty, the selected plan satisfies every unchanged hard constraint; if the feasible set is empty, the response is an explicit impossibility with the violation list and best feasible alternative, and never a silently violating plan. venue.json is authored with redundancy so every demo disruption has a feasible, visibly different answer: at least two gluten-free stands, at least one accessible plus gluten-free plus on-time path. A test iterates every disruption button and asserts both feasibility and a visible plan change.

**The snap:** when the extracted arrival matches no real scheduled option, the planner resolves to the nearest real arrival and emits a `constraint_adjusted` TraceEvent `{field, requested, resolved, reason}` rendered as a Decision Log card ("You said 6:18; nearest real GO train arrives 18:15, Lakeshore West, GTFS snapshot 2026-07-07") and as a one-line note on the itinerary's transit step.

## 5. Moments engine

`scoreGoal` per the PRD formula, plus the gap fixes:

- **Group scoring:** sequence detectors emit groups (comeback arc, rapid run, OT winner, goalie performance) with their own group rank score, including a rapid-run rarity bonus, because the 39-second run's member goals score near zero individually and the run must rank as a marquee moment.
- **Nesting and dedup:** a play belongs to at most one displayed moment; the rapid run and the tying goal render inside the comeback arc structure rather than as duplicate standalone entries. The exact intended Fixture A top three is pinned as an exact-output test: first the 2OT Theodore winner, second the comeback arc (fell short) containing the 39-second run and the extra-attacker tying goal, third Vegas's second-period scoring run (three goals from 10:26 to 14:32, Marner hat trick color; also the subject of the garbage-time non-tagging assertion). If the implemented scorer ranks differently, changing this pin is a conscious test-fixture edit, not a silent adjustment.
- **Comeback semantics:** `completesMultiGoalComeback` fires when a team erases a deficit of two or more to at least tie; the arc carries an outcome flag (won, led, tied, fell-short). Fixture A's arc is asserted fell-short, its tying goal is never tagged game-winning, and `isGarbageTime` is outcome-aware so Vegas's second-period goals are not garbage-tagged.
- **Synthetic fixtures:** a voided-play fixture (real feeds expunge overturned goals), an empty-net-goal fixture (neither committed game has one; exercises the minus-3 and the EN-never-outranks-tying-goal test), and a single-game fixture containing both a first-period goal and a final-two-minutes extra-attacker tying goal so that ordering is testable in one scoring run. Detectors key off monotonic `elapsedGameSeconds`, never per-period time.
- **Moment package budget:** the package schema is explicit (per-moment fields, member plays as references with minimal detail, assists included only for ranked moments). Deterministic trim priority: assist names first, then non-representative member-play detail, never the verified facts the recap states. Fixture A's package is measured with the count_tokens endpoint against `claude-sonnet-5` (its tokenizer runs roughly 30 percent heavier); the 4,000-token assertion targets this package. A separate larger cap guards the full normalized array as a staging artifact.

## 6. AI layer

**Wave 0 verification spike (before anything builds on lib/ai):** one live call verifying (a) the exact `providerOptions.anthropic` key path that disables thinking on `claude-sonnet-5` actually reaches Anthropic (observed via latency or logged request body), (b) whether Output.object on @ai-sdk/anthropic 4.0.14 uses native `output_config` constrained decoding or forced-tool emulation (changes strictness guarantees and thinking compatibility; if tool-emulated, thinking must be fully disabled on structured calls and Zod-failure fallback is a routine path), and (c) Zod 4.4.3 round-trips a discriminated union plus optional fields through Output.object. Findings recorded in DECISIONS.md.

**Calls:** extraction (Haiku, strict schema, no thinking, maxTokens about 1k). Explanation (Sonnet 5, plain streamed prose, thinking disabled or effort low). Recap (Sonnet 5, structured): does not stream incrementally; the Decision Log shows one "generating recap" event and the validated object arrives whole. Explanation input is a narrow type that structurally excludes boxScore and playByPlay (Plan mode must not know the outcome).

**Prompt discipline:** all user-derived strings (sourceText, constraint values, SessionContext fields) are wrapped in a delimited block with a system instruction that delimited content is data to describe, never instructions to follow. Both narrative prompts carry the no-geography rule: never state or imply the real host city or arena; the venue is Harbourview Arena only; no crowd, weather, or locality detail not present in venue.json. Numeric claims in prose are pre-computed by the planner and interpolated; the model never invents numbers.

## 7. Transport and Decision Log

One custom SSE stream per route. Envelope rule and injection test as in section 2. Flood control: enumeration emits one aggregate event ("N candidates evaluated, M feasible") plus individual `candidate_evaluated` events only for the top three and any candidate referenced in the explanation. Progressive reveal is locked: the constraint contract card renders on `request_parsed` (target under 750ms), strictly before the plan; adapter and candidate events animate next; itinerary steps stream last. Client stall detector: no event for 6 seconds shows a visible "connection interrupted, retrying" state with a manual retry, distinct from server timeouts.

## 8. UI components

Per PRD section 11, plus: a Considered-and-Rejected card (runner-up score breakdown and the specific differentiator) feeding the 1:45-2:40 demo beat; replan diff visual language locked as icon plus color pairs (check = preserved, struck X = invalidated, arrow badge = replaced) with text alternatives (accessibility bars color-only meaning); during the up-to-8s replan the old plan dims under the live Decision Log; MemoryPanel is persistently visible (open drawer or sidebar) so the memory beat needs no navigation; a visible Reset control performs a hard reset (clears the app's localStorage keys, reloads to the canonical clean URL) with a test asserting the documented clean state; model-authored strings render as plain React text nodes only (no dangerouslySetInnerHTML, no markdown pipeline) with a minimal CSP header as defense in depth; laptop-distance legibility pass for the Decision Log and badges.

**Frozen copy (verbatim, used by every component that needs it):**
Non-affiliation: "GameLoop is an independent demo, not affiliated with or endorsed by the NHL, its teams, or any venue."
Fiction: "Game results and plays shown are real, from the NHL's public record. Harbourview Arena, its gates, concessions, and seat map are fictional, simulated for this demo."
The footer carries both; the Relive picker and the raw-JSON disclosure carry the fiction sentence.

**Provenance:** walkingMinutes is computed at render from venue.json's walking graph, so a transit step shows SNAPSHOT (scheduled times) and SIMULATED (walk) badges side by side. The Relive bridge sentence renders with the two-badge convention (SNAPSHOT fact plus SIMULATED-derived seat zone). GTFS attribution on /how-it-works: "Contains information licensed under the Open Government Licence - Ontario - Metrolinx." plus a link to the licence and the snapshot date 2026-07-07.

## 9. Security and abuse

Access-code cookie as in section 1 (origin-independent, closes the cross-origin fan-out bypass of the per-IP WAF rule; a per-IP rule alone cannot stop distributed traffic). Optional cheap secondary: reject foreign Origin headers. WAF threshold sized against the real demo-day budget (warmup pings plus rehearsals plus the live run from one venue IP, double-click headroom) and the exact demo sequence tested against the deployed rule once. Zod at every boundary; 1,000-char input cap; mode allow-list; body cap; no model URLs rendered as links; escaped output; no raw stack traces; request content out of persistent logs; ANTHROPIC_API_KEY marked Sensitive; app-served noindex metadata (production Hobby URLs are public and not auto-noindexed). Eval suite includes at least two prompt-injection cases (embedded instructions in the free-text prompt and in a tampered SessionContext) asserting the scoped-refusal or data-treated-as-data path.

## 10. Error handling and degradation

Unchanged from the approved sections, made concrete: extraction failure falls back to the precomputed contract (chips) or a scoped retry message (free text); narrative failure renders the deterministic decision-summary text labeled as fallback (the model is load-bearing for interpretation and prose, never for feasibility, arithmetic, or ranking); live NHL timeout (4s) falls back to snapshot with surfaced reason; 30s hard cap; AbortSignal propagation end to end; SSE stall detector client-side.

## 11. Testing

- normalize: real Fixture A slices (eventId 221 ordering trap, situationCode decode table including 0641, penalty shot, 2OT labeling, score propagation, venue scrub).
- moments: the seven PRD tests reframed per section 5, the three synthetic fixtures, Fixture B negative (opposite-team goals 54 seconds apart never group), pinned Fixture A and B top-3 exact outputs.
- planner: feasibility, scoring order, idempotency (run twice, byte-identical), tie-break totality, candidate-count cap, per-disruption feasibility and visible-change, hard-constraint preservation across the full disruption matrix, seat assignment determinism.
- venue consistency: walking graph sanity, dietary satisfiability with redundancy, authored time-tension assertion (18:15 clears warmups, 18:33 does not), itinerary steps strictly increasing in normalized minutes.
- token budget: Fixture A moment package under 4,000 via count_tokens calibration.
- trace: SSE injection unit test; TZ-independence rendering test.
- evals: 12-plus cases including the D1 split pair, paraphrase variants of the primary prompt, two injection cases, impossible arrival, off-topic, contradictory budget, tampered memory blob, tool-timeout fallback, and a no-real-market-strings coherence check on narrative outputs. One full fix-and-rerun cycle is budgeted; the report (initial rate, failures, fixes, final rate) is an interview artifact.
- UI: two component tests (provenance badges, semantic ordered-list timeline); one Playwright seeded smoke on ?demo=1; reset-state test.

## 12. Execution plan (today)

- **Wave 0 (main thread):** commit this spec; scaffold Next 16; deploy the bare skeleton to Vercel immediately (Node 22 pinned, throwaway Sensitive env var, WAF /api rule created) so Wave 3 redeploys a proven pipeline instead of debugging a first deploy at the point of least slack; run the lib/ai verification spike; fetch Fixture B boxscore into research/raw; lock schemas.ts, module contracts, CLAUDE.md API-era notes, and the frozen copy.
- **Wave 1 (parallel Sonnet, TDD):** 1a normalize plus fixture script plus committed fixtures (head start; everything else consumes its output); 1b venue.json plus transit plus consistency tests (authored redundancy and time tension); 1c moments (starts on hand-written schema-conformant stubs, hard re-gate against 1a's real fixtures before Wave 1 closes); 1d candidates/evaluate (flagged pacer; extra review). The demo-prompt trade-off check runs after 1d lands.
- **Wave 2 (parallel Sonnet):** 2e AI layer (against spike findings), 2f routes plus SSE plus access-code middleware plus warmup route, 2g UI components against schema-conformant fixture objects (not blocked on 1d).
- **Wave 3A (main thread, time-boxed):** integration, first eval run plus one fix-and-rerun cycle, redeploy. If 3A overruns, eval polish moves behind 3B, never ahead of it.
- **Wave 3B (protected):** disruption controls and diff UI, memory panel, reset control, final WAF sizing, smoke on the deployed URL.
- **Buffer:** /how-it-works, accessibility pass, backup capture, DECISIONS.md and BUILDLOG.md (now never-cut; incidents captured in real time as they happen, not reconstructed).

## 13. Demo-day runbook (Thursday)

1. Fifteen minutes before: hit /api/warmup from the venue network (grammar cache is roughly 24h; deploy-time warming does not survive to Thursday); one full-script run against production; curl the live NHL endpoint and silently drop the "pick any real game" closer if it fails.
2. Reset: click Reset, verify the memory panel and Relive personalization are empty.
3. Deploy freeze: after the final pre-demo deploy and verification run, no further pushes.
4. Auth: access-code cookie already established on the presenting browser; the code entry is rehearsed.
5. WAF: threshold already sized for warmup plus rehearsal plus live traffic.

## 14. Interview readiness notes

ADR-001 (bounded orchestration) states the cost side explicitly: requests outside the eight constraint types or five disruptions get a scoped refusal, not a dynamic response; acceptable for a closed-world venue domain, wrong for an open-ended product. One sentence answers "why not template the explanation" (combinatorial violation/trade-off space versus one flexible prompt). The misextraction framing is prepared: the model is load-bearing for interpretation, not decisions; the contract card renders strictly before the plan so a wrong read is visible before compute. The eval report carries a one-sentence generalization argument (schema-constrained classification over eight types and four tiers, plus paraphrase robustness data).

## 15. Out of scope

Unchanged from PRD section 18. Cut order unchanged from PRD section 14, with DECISIONS.md and BUILDLOG.md added to never-cut. Adaptive replanning remains protected ahead of the memory bridge.
