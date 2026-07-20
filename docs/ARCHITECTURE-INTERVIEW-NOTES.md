# GameLoop: Architecture and Interview Notes

A single reference to study before, and glance at during, the interview. Everything here is backed by the actual code in this repository. Plain prose, no em dashes.

Live demo: https://gameloop-gilt.vercel.app  Access code: letmein

---

## 1. What GameLoop is

GameLoop is a Next.js demo pitched as an adaptive game-day copilot. A fan describes their group in their own words ("bringing my dad and two kids, one needs gluten-free, our train arrives at 6:18, seeing warmups matters more than food choices") and the app builds a step-by-step arrival, food, and seating plan for a night at Harbourview Arena, then re-plans live when a disruption hits.

The core product bet is three things held together:

- **Honesty and provenance.** Every externally sourced value on screen is tagged live, snapshot, or simulated and renders a `SourceBadge`. Real data and fabricated data are never mixed silently. This is enforced in the Zod schemas themselves, not just at render time.
- **A deterministic core.** All feasibility, arithmetic, ranking, and memory writes are plain, testable code (`lib/planning`, `lib/games`), developed test-first against exact fixtures.
- **AI only at the edges.** The model has exactly two jobs: translate a fan's free text into a validated constraint contract, and translate verified planner output into prose. The model never computes a number or picks a plan.

This is deliberately bounded orchestration, not an open agent loop. The workflow is closed-world and known in advance, and it must not fail live in front of an interviewer, so the model's surface area is intentionally small.

---

## 2. System architecture overview

The whole reasoning trace streams to the browser as a typed, versioned Server-Sent Events (SSE) envelope stream over a single POST to `/api/plan`. Layers are: client (chat workspace), route (composition and SSE), AI layer (two model calls, live mode only), deterministic core (planning), and data fixtures.

```mermaid
flowchart TD
    subgraph client["Browser: client components"]
        composer["ChatComposer / DisruptionControls"]
        hook["useTraceStream hook"]
        compose["composeAssistantTurn (lib/chat/turns.ts)"]
        thread["MessageThread + AssistantTurn"]
        panel["PlanPanel + ItineraryTimeline"]
    end

    subgraph edge["Route: app/api/plan/route.ts"]
        gate["verifyAccess: gl_access HMAC cookie"]
        branch{"demo=1 ?"}
        sse["createTraceStream: emit TraceEnvelope"]
    end

    subgraph ai["AI layer: lib/ai (live mode only)"]
        extract["extractPlanRequest: Haiku 4.5 + Output.object"]
        narrate["explainPlanStream: Sonnet 5, thinking disabled"]
    end

    subgraph core["Deterministic core: lib/planning"]
        adapters["loadPlannerInput (adapters.ts)"]
        candidates["generateCandidates"]
        evaluate["evaluate: score, feasibility, selection"]
        summarize["fallbackNarrative / decisionSummary"]
    end

    subgraph data["Data and fixtures: lib/data"]
        game["loadShowcaseGame 2025030413 (snapshot)"]
        venue["loadVenue (simulated)"]
        transit["loadTransit GTFS (snapshot)"]
    end

    composer -->|"POST PlanApiInput"| gate
    gate -->|"401 if no cookie"| composer
    gate --> branch
    branch -->|"demo: fixture or typed delta"| adapters
    branch -->|"live: free text"| extract
    extract --> adapters
    adapters --> game
    adapters --> venue
    adapters --> transit
    adapters --> candidates
    candidates --> evaluate
    evaluate --> summarize
    evaluate -->|"plan_result"| sse
    summarize -->|"demo or fallback narrative"| sse
    evaluate -.->|"live: verified plan only"| narrate
    narrate -->|"live response_chunk"| sse
    sse -->|"SSE TraceEnvelope frames"| hook
    hook --> compose
    compose --> thread
    hook --> panel
```

Event order on the wire (single ordered sequence): `decision` "Reading your request." (emitted before any model round-trip, for the sub-750ms first paint), then `request_parsed` and `constraint_adjusted`, any early exit (off-topic, event-mismatch, clarification), adapter `data_requested`/`data_received`, planner `candidates_summary`, `candidate_evaluated` (winner plus runner-up only, "flood control"), `assumption_made`, `decision` (the summary), `plan_result`, the `response_chunk` narrative stream, then `done`.

---

## 3. Tech stack and versions

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Framework | Next.js App Router | 16.2.10 | TS strict, server + client components |
| UI runtime | React | 19.2.4 | |
| Language | TypeScript | ^5 | strict mode |
| AI SDK | `ai` | 7.0.26 | ESM only, Node >= 22 |
| Model provider | `@ai-sdk/anthropic` | 4.0.14 | |
| Validation | Zod | 4.4.3 | at every boundary |
| Styling | Tailwind CSS | 4.3.2 | dark-only "Lit Sheet" (DESIGN.md) |
| Unit tests | vitest | 4.1.10 | 287 tests across 33 files, all green |
| E2E | @playwright/test | 1.61.1 | 2 spec files, 4 test cases, poisoned key |
| Extraction model | claude-haiku-4-5-20251001 | pinned dated snapshot | free text to constraint contract |
| Narrative model | claude-sonnet-5 | dateless id is the pinned snapshot | verified plan to prose, thinking disabled |
| Structured output | `Output.object({ schema })` | via generateText/streamText | native constrained decoding, not tool emulation |
| Deploy | Vercel CLI | `vercel --prod` | manual, alias auto-reassign, no vercel.json |

No new dependencies ship without a DECISIONS.md entry. The SSE transport, for example, is hand-rolled specifically to avoid adding a dependency.

---

## 4. Subsystem deep-dives

### 4.1 Planning core (`lib/planning`)

The "code decides, model narrates" engine. Nine files (`schemas.ts`, `time.ts`, `venueGraph.ts`, `candidates.ts`, `evaluate.ts`, `disruptions.ts`, `merge.ts`, `summarize.ts`, `adapters.ts`) turn a validated `PlanRequest` into a scored, feasible plan with zero model involvement in feasibility, arithmetic, or ranking.

- **Time math (`time.ts`).** Everything is normalized minutes from puck drop, never clock-string comparison. Puck drop = 0, doors (17:45) = -105, warmups (18:40) = -50, the 18:15 Lakeshore West arrival = -75. `clockToMinutesOfDay` uses a strict zero-padded 24h regex and throws on anything else, including the fan's raw "6:18", which is the hard boundary between the model's words and the core's arithmetic. Formatting never passes through a `Date`, so server timezone cannot skew a rendered time.
- **Candidate generation (`candidates.ts`).** Enumerates every gate x stand-set x transit-branch x arrival-strategy combination. Dominated stands are pruned per gate before arrival time is known (a time-independent MIN-of-bands proxy keeps pruning stable), stand-set cardinality is capped at 2, and an arrival constraint with a train mode collapses transit to exactly one snapped option. Bounded and tested to stay between 9 and 200 candidates for the demo family prompt.
- **The arrival snap.** A stated time with no exact scheduled match snaps to the nearest real GO arrival by absolute normalized-minute distance (ties to the earlier train) and records the exact reason string shown in the UI: "No scheduled arrival at 18:18; nearest real GO arrival, GTFS snapshot 2026-07-07". The demo's "6:18" snaps to the real 18:15 Lakeshore West train.
- **Scoring (`evaluate.ts`).** `score = 1000*hardSatisfied + 100*highSatisfied + 20*mediumSatisfied + 5*lowSatisfied - 0.5*walkingMinutes - waitMinutes - budgetOverage`. The tier weights guarantee no stack of lower-tier wins can outweigh one hard constraint. Walking is half the cost of waiting because standing in a queue is the more annoying cost.
- **Feasibility vs scoring are two gates.** A candidate is infeasible only on hard-priority failures (uncovered dietary need, unmet accessibility, missed seated_by, no usable transit for the stated mode, budget overage). Non-hard failures never gate feasibility; they only cost score and surface as "traded".
- **Selection order.** Total deterministic order: score desc, walking asc, wait asc, then `candidateId` lexicographic as the always-decisive final tie-break. `JSON.stringify(evaluate(input))` called twice is byte-identical, and that idempotency is an actual test.
- **Impossibility.** When zero candidates are feasible, `evaluate()` finds the violation types that are universal across every candidate, relaxes only those, re-sorts by the same order, and returns that as `bestAlternative`. The fallback is always the genuinely best candidate once the truly blocking constraint is set aside, never a plan that quietly violates something.
- **planId.** `'plan-' + sha256(candidateId + '|' + sortedDisruptions).slice(0,12)`. No `Date`, no randomness, so the same request plus disruption set always reproduces the same id, which is what makes replan diffs trustworthy.
- **Disruptions (`disruptions.ts`).** A pure function that `structuredClone`s its input and never mutates it. Six toggles: `train-plus-18`, `gate1-wait-22`, `gf-stand-closed`, `milestone-puck-drop`, `add-accessibility`, and `july25-weekend-service`. The last is grounded in real researched GO Transit / Metrolinx Ontario Line construction for the weekend of July 25 to 26, 2026 (`research/2026-07-25-real-data`); it re-snaps the demo's arrival from the 18:15 Lakeshore West train to the 18:12 Lakeshore East train and composes with `train-plus-18` to 18:30, all pinned in tests.
- **Merge (`merge.ts`).** Conversational follow-ups merge one-per-type, except dietary and accessibility which key by their `need` value, so a party can hold gluten-free and halal at once. A bare time-only follow-up (mode "other") keeps the prior arrival's mode rather than overwriting it.

All 88 planning tests pass against current code.

### 4.2 Game data and NHL integration (`lib/games`, `lib/data`)

Three independent pipelines that all land in `lib/data` as validated, provenance-tagged fixtures.

- **Normalization (`lib/games/normalize.ts`).** Reduces a raw NHL play-by-play to six mapped types, carries a running score onto every play, and computes one monotonic elapsed-seconds clock across regulation and any number of overtimes. It sorts strictly by `sortOrder`, guarded by a regression test literally named "the eventId 221 trap" because NHL eventIds are not chronological. It hand-decodes the 4-digit `situationCode` into EV/PP/SH/EN plus an extra-attacker flag rather than trusting a strength field.
- **Showcase entity (`buildShowcaseGame`).** The single seam where real NHL play-by-play is stitched to simulated event-ops (doors 17:45, warmups 18:40, puck drop 19:30, venue Harbourview Arena, `eventOpsSource: simulated`), validated by `ShowcaseGameSchema.parse`.
- **The anchor game.** `loadShowcaseGame("2025030413")` returns the committed snapshot fixture: Vegas Golden Knights 5, Carolina Hurricanes 4, in double overtime, Stanley Cup Final Game 3, played 2026-06-06, source snapshot. The app hardcodes this game because it is currently the NHL offseason and there is no live game to fetch. A second fixture (`2025030313`, Carolina 3 at Montreal 2, OT) is committed and byte-pinned in tests (`moments.fixtures.test.ts`); `listShowcaseGames` can enumerate it, but no picker UI is wired.
- **Live NHL client (`lib/games/client.ts`).** `fetchLiveShowcaseGame` is real, fully unit-tested, and timeout-bounded at 4000ms per call via `AbortSignal.timeout`, with a fail-closed contract (any non-2xx, network error, or schema mismatch rejects so the caller falls back to the snapshot plus a `fallback_used` event). It is exercised in the eval suite but never imported by any `app/` route. The shipped app always loads the snapshot.
- **Moments engine (`lib/games/moments.ts`).** A layered claim-and-rank pipeline (OT winner, then comeback arcs, then scoring runs, then leftover goals, then goalie performances) that keeps the top 3. Built test-first against synthetic fixtures (ADR-004), then re-verified with byte-exact pins against the real game (`moments.fixtures.test.ts` pins the score line "VGK 5, CAR 4 (2OT)" verbatim). It has no live UI today; it was built for the removed Relive mode and is now proven in isolation only.
- **Real-nearby evidence (`lib/data/realNearby.ts`).** A separate, hand-authored card ("Real places near the arena") that names real Toronto-area restaurants under the fictional arena. It carries its own three-tier evidence model (certified / self-described / friendly). "Certified" is printed only when a named certifier is on record for that exact outlet (one restaurant, against the Halal Monitoring Authority). `nut-free` and `dairy-free` are hardcoded `UNVERIFIABLE_NEEDS` that always force an honest absence statement, because research found zero citable nut-allergy policies. This data never touches the planner or the model prompts, so shipping it required no change to the NO_GEOGRAPHY rule or the TDD-protected core.

### 4.3 AI layer (`lib/ai`, `/api/plan`, `/api/warmup`)

A bounded, two-model pipeline.

- **Two models, two jobs.** Haiku 4.5 (`claude-haiku-4-5-20251001`) does extraction and refinement via `Output.object({ schema: PlanRequestSchema })`. Sonnet 5 (`claude-sonnet-5`) does narrative, either streamed plain text (`explainPlanStream`) or a structured recap (dead in the live app). Code owns every number.
- **Native constrained decoding.** ADR-002's live spike captured the outgoing request body and confirmed `Output.object` compiles to Anthropic's native `output_config` json_schema decoding (tool_choice null, no tools array), not forced-tool emulation. The `deprecated` `generateObject`/`streamObject` are never used, and `partialOutputStream` is unused; only plain-text token streaming exists.
- **Belt and braces.** Extraction re-runs `PlanRequestSchema.parse` on the model output even though the API enforces it natively. ADR-005 frames this as defense in depth, and it is the exact spot a malformed response would surface as a catchable error for fallback logic.
- **Thinking disabled on Sonnet only.** Both narrative calls pass `providerOptions.anthropic.thinking.type = "disabled"`, because Sonnet 5 defaults to adaptive thinking at effort high, which PRD-DELTA D3 flags as the single biggest way to breach the 12-second target. Haiku calls omit the param entirely (no thinking mode to disable).
- **Prompt-injection guard.** `wrapUserData` strips any literal `</fan_input>` from the fan's text before wrapping it, and `DATA_DISCIPLINE` tells the model everything inside is data. Directly asserted in `prompts.test.ts`. `NO_GEOGRAPHY` pins both narrative prompts to never name the real city or arena.
- **Cost and latency guards (`CALL_LIMITS`).** `maxRetries: 1` on every model call (three `CALL_LIMITS` configs, extraction, explanation, and recap, with `extractRefinement` reusing the extraction config; the SDK default of 2 retries with backoff can burn most of a 12s budget). `maxOutputTokens` capped per call. Extraction pins `temperature: 0` to cut variance at the classification boundary; narrative leaves temperature at default for prose warmth.
- **Warmup route.** `POST /api/warmup` runs one throwaway extraction to force the `PlanRequestSchema` grammar to compile ahead of the demo. First structured call cost about 3740ms including compile versus 1465ms plain, roughly 2.3s of compile, and the grammar caches about 24h. Gated by the same access cookie as `/api/plan`. It no longer warms a recap grammar; that caller was removed.

### 4.4 SSE trace and chat UI (`lib/trace`, `components`, `app/plan`)

- **Transport (`lib/trace/sse.ts`).** `createTraceStream(requestId)` returns a `ReadableStream` plus an `emit()` closure. Every event is wrapped in a `TraceEnvelope { v: 1, requestId, seq, event }`, validated with `TraceEnvelopeSchema.parse`, and written as exactly one `data: <json>` line. Because the whole envelope is one `JSON.stringify` blob, hostile model text containing a literal `data:` substring can never forge a second frame; a dedicated test in `sse.test.ts` proves it. Headers set `X-Accel-Buffering: no` to defeat proxy buffering.
- **Client hook (`useTraceStream.ts`).** POSTs the body (SSE cannot, since EventSource is GET-only with no body), reads the stream, `safeParse`s each frame (malformed frames are silently skipped), and exposes `{ events, streamText, status, retry, httpStatus }`. A 6-second stall timer flips status to `stalled` without aborting the still-alive request. Every async continuation is guarded by a monotonic `runIdRef` so a superseded request's late resolution can never clobber a newer one.
- **Turn composition (`lib/chat/turns.ts`).** `composeAssistantTurn` is a pure function over `TraceEnvelope[]`, unit-tested for every emission-order edge case (redirect vs body vs clarification vs error vs plan result) without rendering React.
- **Workspace (`app/plan/PlanWorkspace.tsx`).** Owns a frozen `completedTurns` ledger plus one live turn synthesized from the current stream. `freezeActiveTurn()` snapshots the live turn before the next submit fires, so past turns stay pixel-stable. Two-region layout: `MessageThread` on the left, `PlanPanel` (itinerary, memory, reset) on the right, both composed from the one SSE stream with no separate endpoint or schema per region.
- **Reasoning disclosure.** As of the latest work (2026-07-21), the Decision Log stays folded through the entire stream and raises a completion invite (an unread sodium dot plus a finite 3-iteration glow) instead of auto-expanding over the streaming narrative, which used to push the reply off screen. A real regression was fixed here: native `<details>` fires its toggle event even for programmatic opens, so the summary click calls `e.preventDefault()` and React alone owns `open`.
- **Demo narrative pacing.** `chunkNarrative(text, 3)` slices deterministic fallback text into roughly 3-word pieces (concatenation byte-identical to the source) and the route sleeps about 45ms between `response_chunk` emissions, so a demo reply visibly streams in about 14 frames over roughly 1.2s instead of popping in as one blob.
- **Session memory.** Written to `localStorage` key `gameloop.session.v1` only after a feasible plan lands and `SessionContextSchema.safeParse` succeeds, with a 7-day expiry. A custom `gameloop:session-updated` window event is dispatched alongside the native `storage` listener, because `storage` never fires in the tab that wrote the value.

### 4.5 Provenance and access

- **Provenance is a Zod enum.** `SourceClassSchema = z.enum(["live","snapshot","simulated"])` is embedded in the data schemas (`ItineraryStepSchema.source`, the `data_received` trace event), so a value's provenance is a type-level fact, not a render-time decoration. `SourceBadge` maps each to a style where the visible word carries the meaning and color only reinforces. SIMULATED gets the app's only dashed border so fabricated data reads differently even in grayscale; LIVE gets the only pulsing dot besides the streaming indicator.
- **Two provenance axes.** `SourceClass` answers "where did this come from and when". The separate `EvidenceTier` (certified / self-described / friendly) on the real-places card answers "how strongly is this specific dietary claim substantiated". A restaurant is always snapshot provenance, but each of its claims can carry its own evidence tier.
- **Access gate (`lib/server/access.ts`).** A signed cookie, not a session store. `signAccess` is `HMAC-SHA256(code, secret)`; `verifyAccess` compares with `timingSafeEqual` (constant-time). `POST /api/access` checks the code against `process.env.ACCESS_CODE` and sets an httpOnly, secure, sameSite lax `gl_access` cookie with 7-day maxAge. The gate is enforced on `/api/plan` and `/api/warmup`; `/api/access` itself is the unauthenticated login route that checks the submitted code against `process.env.ACCESS_CODE` and issues the cookie (gating it would be circular). There is no `middleware.ts`, and `app/plan/page.tsx` renders the shell unconditionally. The protected asset is the model-calling API surface (cost), not the static page HTML.

### 4.6 Testing

- **287 vitest tests across 33 files, all green** (verified by running the suite), scoped to `lib/**/*.test.ts` and `components/**/*.test.tsx`, environment node.
- **TDD with exact fixture pinning.** `moments.fixtures.test.ts` pins the literal score line "VGK 5, CAR 4 (2OT)", the exact moment-type ordering, a sub-11000-character package budget, and even the raw byte counts of the source fixture, so a silent fixture regeneration is caught.
- **Eight component test files** (`AssistantTurn`, `ChatComposer`, `ConstraintsStrip`, `ItineraryTimeline`, `NearbyRealOptions`, `ReasoningDisclosure`, `SkeletonTimeline`, `SourceBadge`), part of the 33. ADR-003 mandated only the `SourceBadge`/`NearbyRealOptions` pair; the other six were added during the chat-workspace build. `lib/ai` is hand-reviewed with a narrow `prompts.test.ts` focused on injection resistance and geography-rule presence, since you cannot unit-test what the model will say.
- **Two Playwright e2e spec files (4 test cases) against a poisoned key.** The `playwright.config.ts` webServer starts the app with `ACCESS_CODE=letmein`, `ACCESS_COOKIE_SECRET=e2e-secret`, and a deliberately invalid `ANTHROPIC_API_KEY=sk-ant-invalid-e2e-placeholder`. An explicitly invalid key is the only reliable way to force every live-attempting path into its deterministic fallback, because Next.js will not let `.env.local` override a variable already present in `process.env` (the exact Windows env-shadowing bug documented in ADR-002).

### 4.7 Deployment

- **Manual `vercel --prod`.** No `vercel.json`, no CI/CD, no GitHub auto-deploy. Each deploy gets a fresh deployment id and Vercel auto-reassigns the prod alias `gameloop-gilt.vercel.app` to it; the previous deployment stays "Ready" as an instant rollback target.
- **Deploy-freeze protocol.** BUILDLOG records a "DEPLOY FREEZE re-declared" line after every deploy: build on a branch with all gates green, merge only on explicit approval, deploy only on explicit approval, then re-verify with an authenticated Playwright run against the live alias before re-declaring the freeze.
- **Rate limiting** is a Vercel WAF rule (30 requests / 60s per IP on `/api` paths), configured in the dashboard, not in the repo. Deployment Protection is Standard: raw preview URLs sit behind Vercel SSO, only the production alias is public behind the app's own access gate.

---

## 5. Key design decisions and rationale

- **Deterministic core, TDD, exact fixtures.** Decision: feasibility, arithmetic, ranking, and memory writes are plain code, developed test-first. Why: the workflow is closed-world and must not fail live; determinism makes the whole pipeline byte-for-byte testable, which an LLM ranking never could be.
- **AI only at the boundaries (ADR-001).** Decision: the model translates language in and out and nothing else. Why: an open ReAct loop adds failure surface without adding capability in a closed domain. Framed in DECISIONS.md as a deliberate choice: "I have built open ReAct loops (LedgerOne). I chose bounded here, deliberately."
- **Provenance everywhere.** Decision: three visible words (live / snapshot / simulated) plus color, never color alone, enforced in Zod. Why: honesty is the demo's evaluated quality (responsible-AI boundaries), and colorblind-safe legibility means fabricated data must read as fabricated even in grayscale.
- **Normalized-minutes time math.** Decision: all time is integer minutes from puck drop; clock parsing throws on unpadded input. Why: it eliminates an entire class of off-by-one and timezone bugs, and enforces a hard boundary between the model's raw words and the core's arithmetic.
- **Zod at every boundary.** Decision: requests, tool results, memory, model outputs, and every SSE frame are validated on both ends. Why: an interprocess boundary is otherwise untyped bytes; a malformed frame is dropped client-side rather than crashing the stream, and rejected server-side rather than written malformed.
- **Thinking disabled on Sonnet.** Decision: both narrative calls set thinking to disabled; Haiku omits the param. Why: Sonnet 5's default adaptive-thinking-at-high-effort is the biggest latency risk against the 12s target; Haiku has no thinking mode to disable.
- **Demo-mode determinism (`?demo=1`).** Decision: a hard, code-enforced zero-model-call mode, branched before any AI function runs, not a mock layer. Why: a scripted live demo must never depend on Anthropic availability, quota, or the roughly 2.3s grammar-compile latency, and the e2e suite gets deterministic assertions without stubbing the network.
- **The poisoned-key test webServer.** Decision: the Playwright webServer sets a deliberately invalid Anthropic key. Why: an unset key would not reliably beat a real key sitting in the shell (Next.js env precedence), so an invalid value is the only guaranteed way to force fallback paths on every machine.
- **Dark-only "Lit Sheet" design system.** Decision: one dark theme (arena at night), tokens in `app/globals.css`, an explicit motion budget where only two elements pulse continuously and all motion sits behind `prefers-reduced-motion: no-preference`. Why: a single locked, defensible design language with pre-computed contrast ratios, disciplined enough to argue line by line.
- **SSE over a single POST fetch, hand-rolled.** Decision: a tiny `data: <json>` envelope protocol, not EventSource or a library. Why: the reasoning trace must appear incrementally as it happens; EventSource cannot POST a body; and a hand-rolled envelope adds zero dependencies.

---

## 6. Interview Q&A

**Q1. Why is the planner fully deterministic instead of letting the model reason about trade-offs?**
The workflow is closed-world and known in advance, and it must not fail live. The model gets exactly two jobs (constraints in, prose out); code owns feasibility, arithmetic, ranking, and memory writes. It also makes the whole thing testable byte-for-byte, which an LLM-driven ranking never could be. This is ADR-001, framed as a deliberate choice against experience building open ReAct loops elsewhere.

**Q2. Walk me through the scoring formula.**
`score = 1000*hardSatisfied + 100*highSatisfied + 20*mediumSatisfied + 5*lowSatisfied - 0.5*walkingMinutes - waitMinutes - budgetOverage`. The tier weights are chosen so no combination of lower-tier satisfactions can outweigh one hard constraint. Walking is weighted at half of waiting because standing in a queue is the more annoying cost.

**Q3. How do you break a tie between two candidates that score identically?**
Total deterministic order: score desc, walking minutes asc, wait minutes asc, then `candidateId` lexicographic asc as the always-decisive final tie-break. There is always exactly one winner, and `JSON.stringify(evaluate(input))` twice is byte-identical, which is an actual idempotency test.

**Q4. What happens when a request is impossible to satisfy?**
The app never silently guesses. `evaluate()` finds the violation types universal across every candidate, relaxes only those, re-sorts by the normal order, and returns the best remaining candidate as `bestAlternative` alongside `feasible: false` and the full violations list. Tested with an unsatisfiable seated-by-plus-arrival combo and separately with an uncoverable nut-free need where the exact violation ("dietary: no stand tonight offers nut-free") is named.

**Q5. Why does the demo prompt say the train arrives at 6:18 if that is not a real time?**
It is the fan's stated belief, not a fact the app repeats uncritically. The extractor normalizes it to 18:18, and the planner snaps it to the nearest real scheduled GO arrival (18:15 Lakeshore West, or 18:12 Lakeshore East once the July 25 disruption applies), recording the exact adjustment reason with its snapshot provenance rather than pretending the stated time was achievable.

**Q6. Is any of this data real, or is it all synthetic?**
Mixed, and disclosed per field. The showcase game (Vegas 5, Carolina 4, 2OT) and its play-by-play are real NHL data, snapshotted because it is currently the offseason. The GO Transit times are real Metrolinx open data (GTFS snapshot 2026-07-07). The arena, gates, concessions, and seat map are simulated by necessity, since that operational data only exists inside organizations like the interviewer's own. All three tiers are labeled inline via `SourceBadge`, never mixed silently.

**Q7. Does this app hit the live NHL API right now, in front of me?**
No. `fetchLiveShowcaseGame` is real, fully tested against a mocked fetch, timeout-bounded at 4s per call, and exercised in the eval suite, but no route imports it. The app always loads the committed snapshot, because the showcase game is a specific real historical game, and there is no live NHL game to fetch in the offseason anyway.

**Q8. Is `Output.object` just a forced tool call under the hood?**
No, and I verified this live rather than trusting the docs. ADR-002's spike captured the outgoing request body via an injected fetch wrapper: it is native `output_config` constrained decoding (json_schema format, tool_choice null, no tools array). The Zod re-parse in `outputs.ts` is defense in depth, not the primary correctness mechanism.

**Q9. If the API already enforces the schema, why disable thinking only on Sonnet and not Haiku?**
Sonnet 5 defaults to adaptive thinking at effort high, which is the single biggest latency risk against the 12s target, so both narrative calls pass `thinking.type = "disabled"`. Haiku 4.5's fast extraction path has no thinking mode to begin with, so those calls simply omit the parameter rather than disabling it.

**Q10. How do you guarantee demo mode never calls the model, not just usually?**
It is a structural branch in `app/api/plan/route.ts`, not a best-effort setting. `demo && !chipId && !refinement` short-circuits before any AI import runs; a demo chip pulls a fixture from `demo-extractions.json`; a demo refinement with free text is explicitly refused; and the explanation step always uses `fallbackNarrative()` when demo is true. The e2e suite independently backs this by running against a deliberately invalid Anthropic key, so any accidental live call would fail the test loudly.

**Q11. How do you keep the narration step from hallucinating a venue or game fact?**
The narration call only ever receives already-verified, Zod-validated structure (the selected plan, the runner-up, the violation list) plus a `DATA_DISCIPLINE` system prompt requiring every number to come verbatim from the provided data. The runner-up delta strings are handed to Sonnet already phrased, so it can misword a sentence but cannot bend a walking-minutes figure. For the now-dead recap path, two invariants were enforced in code (score line must match verbatim, every referenced moment id must exist) with a thrown error treated as an expected fallback trigger.

**Q12. How does the SSE transport stop hostile model output from forging a fake frame?**
Two layers. Every event is `TraceEnvelopeSchema.parse`d before serialization, and the entire envelope is one `JSON.stringify` blob per line, so any text value (including narrative chunks) is escaped as a JSON string and can never inject a second `data:` line. There is a dedicated test that fires a `response_chunk` containing a fake forged frame and asserts exactly one real frame comes out.

**Q13. Why SSE and not WebSockets, and why not the built-in EventSource?**
The trace is one-directional (server to client) and fits on a single POST fetch with a streaming body, so WebSockets would add bidirectional complexity the app never uses. EventSource is GET-only and cannot carry a body, but the request needs to POST a full `PlanApiInput`, so the client does its own POST plus `getReader()` loop and parses the `data:` framing itself.

**Q14. What happens if the stream stalls mid-request?**
A 6-second no-frame timer flips status to `stalled`, distinct from `error`, without aborting the underlying fetch, because the request may still resolve. The UI surfaces a Retry button in that state; Retry aborts the current controller and re-POSTs the same body. A genuine error (network failure, non-2xx, or an explicit `error` envelope) becomes `error` instead, also with Retry.

**Q15. Why is the access gate per-route instead of Next.js middleware, and is the page protected?**
Just the API is gated. There is no `middleware.ts`, and the plan page renders its shell for anyone with the URL; only `POST /api/plan` and `/api/warmup` check the `gl_access` cookie. `/api/access` is the unauthenticated login endpoint itself: it checks the submitted code and sets the cookie. The only asset worth protecting is the model-calling surface (cost), and each route already needs its own error shape (401 JSON vs SSE abort) that shared middleware would have to special-case anyway.

**Q16. Why sign the cookie with HMAC and compare it in constant time?**
So the browser only ever holds a signed token, never the raw code, and rotating `ACCESS_CODE` instantly invalidates every prior cookie with no session store. `verifyAccess` re-derives the expected HMAC and compares with `timingSafeEqual` to avoid leaking how many leading bytes matched through response-time variance. Small but correct hygiene, even though the demo code is openly disclosed.

**Q17. Where is Relive the Game? The PRD describes two modes.**
It was cut on 2026-07-20 (commit 30e9877) as a deliberate end-to-end removal: the nav tab, homepage card, `/relive` route, and `GameMemoryCard` were all deleted, and the homepage now centers a single Plan My Night CTA. The moments engine and deterministic recap builder still exist and pass their tests, exercised only by the offline eval harness. Concentrating on one flow demonstrates the full bounded-orchestration thesis (extraction, deterministic scoring, narration, disruption replan) without a second mode.

**Q18. What is the July 25 disruption and why does it sit alongside the toy ones?**
It is the one disruption grounded in freshly researched real data: Ontario Line construction at Exhibition Station genuinely reduces Lakeshore West service the weekend of July 25 to 26, 2026. It filters transit down to West-Harbour-origin Lakeshore West trips, one notch stronger than the real headline 30-minute figure, a disclosed abstraction rather than a misrepresentation. It shows the provenance discipline extends even to how synthetic what-if scenarios are authored, and it composes correctly with the stacked delay.

---

## 7. Honest limitations and what I would do next

Framed as deliberate scoping for a single-demo-day, single-audience project.

- **Two-mode docs vs one-mode app.** PRD.md, PRD-DELTA.md, and BASELINE.md still describe a two-mode product. The live app is Plan My Night only; the interview narrative and `/how-it-works` were kept in sync, but the PRD documents themselves were not rewritten.
- **Dead but deliberate code.** `lib/server/recap.ts`, `generateRecap`, `RECAP_SYSTEM`, `fetchLiveShowcaseGame`, and `ReliveApiInputSchema` are unreachable from any live route. They were left in place on purpose (`lib/ai` is hand-reviewed and never force-deleted, and the eval harness still imports them) rather than half-removed. `/relive` and `/api/relive` return 404.
- **The live NHL adapter is experimental**, labeled as such in the app's own compliance copy (undocumented endpoint, no auth, not officially supported). It is a credible plug-in point to narrate, not a production integration.
- **Free-text in demo mode is disabled by design.** An off-script typed question in demo mode cannot be answered; that requires live mode. The four demo chips and the quick chips are the only zero-model paths.
- **Extraction is not perfect.** The pinned eval suite holds at 11 of 13 cases, with a known party-count boundary failure class and a one-line candidate fix that was deliberately not applied the night before a demo. An honest "we know the fix, we chose not to risk it" story.
- **Access is a single shared code, not per-user auth.** `/how-it-works` lists this as a production gap. The current code (letmein) is disposable, since the project is shut down after the interview; it is not a durable secret.
- **The venue geometry is intentionally exaggerated** (Union to the gates modeled as 8 to 14 minutes versus a real roughly 5-minute walk) to give the planner meaningful trade-offs. It is a simulated-venue design choice, not a data error.
- **Coarse accessibility and budget modeling.** Step-free requires gate, section, and every stand accessible (no partial-path routing); budget uses a cheapest-covering-item estimate with no per-person orders. Both are deliberate simplifications at this venue's fixed scale.

**Roadmap, in order:**
1. Rewrite the PRD to match the shipped one-mode product, and either revive Relive behind a flag or formally retire its dead code after hand review.
2. Turn on the live NHL path for the October season open, with the snapshot as a tested fallback.
3. Apply the known extraction fix and re-baseline the evals toward the party-count boundary.
4. Replace the shared access code with real per-user sign-in and add application-level rate limiting.
5. Swap the hand-authored enumeration for a real optimizer if the venue scale grows beyond the current 4 gates and roughly 8 to 10 stands.

---

## 8. Quick-reference facts box

| Fact | Value |
|---|---|
| Live URL | https://gameloop-gilt.vercel.app |
| Access code | letmein |
| Deploy command | `vercel --prod` (alias auto-reassigns) |
| Showcase game | Vegas Golden Knights 5, Carolina Hurricanes 4, double OT |
| Event | Stanley Cup Final Game 3, played 2026-06-06 |
| NHL gameId | 2025030413, provenance snapshot |
| Score line (pinned in test) | `VGK 5, CAR 4 (2OT)` |
| Game-night times | doors 17:45, warmups 18:40, puck drop 19:30 |
| Normalized minutes | puck drop 0, doors -105, warmups -50, 18:15 train -75 |
| Venue | Harbourview Arena (fictional, never name the real city) |
| Transit | real GO Transit / Metrolinx GTFS, snapshot 2026-07-07 |
| Constraint types | 8: arrival, seated_by, dietary, budget, accessibility, party, noise, food_preference |
| Disruptions | 6: train-plus-18, gate1-wait-22, gf-stand-closed, milestone-puck-drop, add-accessibility, july25-weekend-service |
| Scoring | 1000 hard, 100 high, 20 medium, 5 low, minus 0.5 x walk, minus wait, minus budget overage |
| Selection order | score desc, walking asc, waiting asc, candidateId asc |
| planId | plan- + first 12 of sha256(candidateId + sorted disruptions) |
| Unit tests | 287 across 33 files, all green (vitest 4.1.10) |
| E2E | 2 Playwright spec files, 4 test cases (1.61.1), poisoned key |
| Extraction model | claude-haiku-4-5-20251001, temperature 0 |
| Narrative model | claude-sonnet-5, thinking disabled |
| Structured output | Output.object, native constrained decoding |
| Grammar warmup | roughly 2.3s first compile, caches roughly 24h |
| Latency | 12s soft target, 30s hard AbortSignal budget, maxRetries 1 |
| SSE | one Zod-validated TraceEnvelope per data line, v = 1 |
| Demo mode | `/plan?demo=1`, zero model calls, code-enforced |
| Session memory | localStorage `gameloop.session.v1`, 7-day expiry |
| Stack | Next.js 16.2.10, React 19.2.4, ai 7.0.26, @ai-sdk/anthropic 4.0.14, Zod 4.4.3, Tailwind 4.3.2 |

**Scripted demo path:** go to `/enter`, type the code into "Access code", click "Enter" (redirects to `/plan`). Open `/plan?demo=1`, click "Family + gluten-free" (submits immediately, streams a plan into "Tonight's plan"). Then click "July 25 weekend service" (re-snaps to the 18:12 Lakeshore East train), then "Train delayed +18 min" (stacks to 18:30, trades the seating milestone). Scroll to "Real places near the arena". Finish with "Reset".
