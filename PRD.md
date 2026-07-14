# GameLoop PRD v1.0 (final)

**Owner:** Saad
**Purpose:** Interview project for MLSE conversation with Sandra Leon (VP Software Engineering & AI), Thursday July 16, 2026
**Build window:** Monday evening July 13 to Wednesday night July 15
**Supersedes:** v0.1 (July 13). Incorporates external critique review and the data-realness policy.

---

## 0. What changed from v0.1 and why

1. **Open ReAct loop replaced with bounded orchestration.** The workflow is known in advance and must not fail live. The model gets two jobs: translate natural language into structure, and translate verified structure into natural language. Code decides feasibility, arithmetic, and ranking. Interview line: "I have built open ReAct loops (LedgerOne). I chose bounded here, deliberately."
2. **ShowcaseGame entity unifies Plan and Relive.** v0.1 could hallucinate the memory bridge (fictional venue plan, real game recap, unverified seat claims). Both modes now share one coherent entity.
3. **Adaptive replanning is the new centerpiece.** Simulated disruption buttons ("train delayed 18 min") trigger a visible replan that preserves hard constraints. This is the demo peak.
4. **Data realness policy added (Section 4).** Fixtures are snapshots of real data, not inventions. Three provenance classes: LIVE, SNAPSHOT, SIMULATED.
5. **Trace panel became a Decision Log.** No "thinking" events. It shows extraction results, tool execution, candidate evaluations, and planner-derived decision summaries.
6. **Session memory hardened.** The model can no longer write memory directly. Server-validated schema, provenance per field, visible memory panel, Clear button, expiry.
7. **In-process rate limiting replaced with Vercel WAF.** Process memory does not span serverless instances.
8. **Eval suite promoted to a core deliverable.** Social caption variants and brand-voice toggle demoted to the cut list; output is one Personal Game Memory.
9. **Stack corrected: Next.js 16 (current stable), AI SDK latest for transport, Sonnet 5 available for narrative generation.**
10. **Measurable success criteria added; latency budgets tightened to product targets, not platform maximums.**

---

## 1. Product thesis

GameLoop is an adaptive game-day copilot. It converts a fan's messy preferences into a constraint-aware plan, adapts that plan when circumstances change, and uses the same verified game and venue context to create a personalized post-game memory.

Positioning versus existing venue apps: current tools sell individual transactions (tickets, food ordering, reservations). GameLoop resolves the trade-offs between them: gluten-free versus shortest wait, warmups versus the later train, budget versus proximity, keeping the family together versus splitting pickup stands.

Technical thesis: **responsible, bounded agentic software rather than an unrestricted chatbot.** The model understands the fan and explains results. Deterministic code performs time arithmetic, feasibility analysis, plan scoring, and game-event ranking. Every recommendation carries provenance. The complete experience works with seeded data when external systems fail.

This maps to the interviewer's published engineering philosophy (plan-before-fetch retrieval, context managed with intent, smarter architecture over brute force) and to the MLSE target stack named in the job description (Node.js, React/Next.js, TypeScript, cloud-native deployment).

---

## 2. Success criteria (measurable, demo-level)

1. At least 8 of 10 eval prompts produce valid structured constraint contracts.
2. Every itinerary states which constraints were satisfied, traded off, or violated.
3. Impossible scenarios return an explicit explanation plus the best feasible alternative.
4. Every externally sourced value displays provenance (LIVE / SNAPSHOT / SIMULATED).
5. No recap contains an unsupported seat-view or game-fact claim.
6. Seeded plan completes in under 12 seconds; replanning under 8 seconds.
7. Replanning preserves all unchanged hard constraints, verified by test.
8. All deterministic moment fixtures pass exact expected-output tests.
9. The full primary demo path runs with zero external dependencies.
10. One-command reset returns the app to a clean demo state.

---

## 3. Users

- **Attending fan (primary):** wants a feasible plan with minimal effort, clear trade-offs, fast replanning, and honest source confidence.
- **Returning fan (secondary):** wants continuity after the event, personalized but never fabricated memories, and control over what is remembered.
- **Technical interviewer (prototype stakeholder, not a product user):** evaluates architecture, judgment, reliability, responsible AI boundaries, and development process. The product is designed for fans; the Decision Log and /how-it-works page are designed for her.

---

## 4. Data realness policy

Seeded does not mean fake. Every data element belongs to exactly one class, displayed as a badge:

| Class | Meaning | Used for |
|---|---|---|
| **LIVE** | Fetched from an external source at request time | Optional NHL adapter behind a feature flag |
| **SNAPSHOT** | Real data captured once, reduced, committed with source and fetch date | Showcase game box score and play-by-play; GO Transit schedule times derived from the public GTFS file |
| **SIMULATED** | Synthetic by necessity, clearly labeled | Venue operations: concessions, gate waits, seat map. This data only exists inside organizations like MLSE |

Interview framing for SIMULATED: "I built the adapter contract; the simulated feed stands in for data only you possess. That is the plug-in point." The simulated data is never lazy: named stands, plausible menus, GTFS-shaped transit records, internally consistent timings.

---

## 5. Product overview

```
[Home] -> Plan My Night -> constraint contract -> plan + Decision Log
                -> disruption buttons -> visible replan
       -> Relive the Game -> showcase game -> moments -> Personal Game Memory
Shared: ShowcaseGame entity, SessionContext, Decision Log, provenance badges,
        memory panel, /how-it-works
```

**ShowcaseGame** is the spine:

```ts
type ShowcaseGame = {
  gameId: string;
  source: "snapshot" | "live";
  sourceMeta: { fetchedAt: string; endpoint: string };
  eventDate: string;
  startTime: string;
  homeTeam: string;   // plain text, no marks
  awayTeam: string;
  venueId: string;    // fictional overlay: "Harbourview Arena"
  sections: VenueSection[];        // SIMULATED
  concessions: ConcessionStand[];  // SIMULATED
  gatePolicies: GatePolicy[];      // SIMULATED
  transitOptions: TransitOption[]; // SNAPSHOT (GTFS-derived)
  boxScore: ReducedBoxScore;       // SNAPSHOT (real game)
  playByPlay: NormalizedPlay[];    // SNAPSHOT (real game)
};
```

Coherence rule: the game data is real; the venue overlay is simulated; the disclaimer states both. Plan and Relive both read this entity, so the memory bridge can never reference a game or section that does not exist in the demo world. If the user plans a non-showcase event, the personalized recap bridge is disabled and labeled "preview."

---

## 6. Feature specs

### 6.1 Plan My Night

**Input:** free-text box plus three preloaded natural prompts as chips. Primary demo prompt: "I'm bringing my dad and two kids. One child needs gluten-free food. Our train arrives at 6:18, and seeing warmups matters more than having many food choices."

**Step 1: Constraint contract (model extraction, validated).** The model converts text to a `PlanRequest`; Zod validates. Displayed to the user as a card before or alongside the plan:

```ts
type Constraint = {
  type: "arrival" | "seated_by" | "dietary" | "budget"
      | "accessibility" | "party" | "noise" | "food_preference";
  value: unknown;
  priority: "hard" | "high" | "medium" | "low";
  sourceText: string;   // the exact user words that produced it
};
```

Defaults: dietary and accessibility are hard; explicit "must/needs" language is hard; "matters more than" creates a priority ordering; unstated values are not invented (party size missing means ask, not guess).

**Step 2: Parallel retrieval.** Event context, concessions, transit, gate conditions fetched concurrently (all from the ShowcaseGame entity in seeded mode).

**Step 3: Deterministic feasibility and scoring.** Candidate itineraries are generated and scored in code:

```ts
score =
  hardConstraintsSatisfied * 1000 +
  highPrioritySatisfied * 100 +
  mediumPrioritySatisfied * 20 +
  lowPrioritySatisfied * 5 -
  walkingMinutes * 0.5 -
  estimatedWaitMinutes -
  budgetOveragePenalty;
```

Any hard-constraint violation marks a candidate infeasible. All time math uses normalized minutes from event start (never string comparison).

**Step 4: Model explanation.** The model receives the selected plan, the runner-up, and the violation lists, and writes the explanation and trade-off note: "This plan uses Gate 5B rather than Gate 1. It adds a four-minute walk but cuts the estimated queue by nine minutes and keeps the gluten-free pickup on your route."

**Output UI: Itinerary Timeline.** Ordered steps with time chips, provenance badges per element, a constraints strip (satisfied / traded / violated), and the constraint contract card.

**Disruption simulation (centerpiece).** Buttons under the plan:
- Train delayed +18 min
- Gate 1 wait rises to 22 min
- Selected gluten-free stand unavailable
- Change "warmups" to "puck drop"
- Add accessibility requirement

Each mutates the input state and re-runs steps 2 to 4. The UI highlights unchanged constraints, invalidated steps, replacement steps, and the new decision summary. Test-backed guarantee: replanning never sacrifices an unchanged hard constraint.

**Dietary and accessibility handling.** Distinguish preference, intolerance, and medically significant allergy in the contract. Never claim safety. Copy pattern: "Listed as offering a gluten-free item. Cross-contact information is unavailable; confirm with venue staff." (SIMULATED badge applies.)

### 6.2 Relive the Game

**Input:** showcase game picker (two committed SNAPSHOT games, primary path) plus a feature-flagged "experimental live data" list of recent real games.

**Pipeline (application-controlled, not model-selected):** load game data -> normalize -> deterministic moment scoring -> pass only the verified moment package and validated SessionContext to the model -> structured recap generation -> render.

**Normalized event type:**

```ts
type NormalizedPlay = {
  eventId: number;
  type: "goal" | "shot" | "penalty" | "period-start" | "period-end" | "shootout-attempt";
  period: number;
  periodType: "REG" | "OT" | "SO";
  elapsedGameSeconds: number;
  remainingPeriodSeconds: number;
  teamId?: string;
  scorerId?: string;
  homeScore: number;
  awayScore: number;
  strength?: "EV" | "PP" | "SH" | "EN";
  valid: boolean;   // overturned or voided plays excluded upstream
};
```

**Moment scoring (deterministic, full-game context allowed because games are complete):**

```ts
function scoreGoal(p: NormalizedPlay, ctx: GameContext): number {
  let s = 0;
  if (p.periodType === "OT") s += 10;
  if (isGameWinningGoal(p, ctx)) s += 7;
  if (createsLead(p) && isFinalTenMinutesOfThird(p)) s += 7;
  if (createsTie(p) && isFinalTenMinutesOfThird(p)) s += 6;
  if (completesMultiGoalComeback(p, ctx)) s += 6;
  if (isSecondGoalWithinThreeMinutes(p, ctx)) s += 4;
  if (p.strength === "SH") s += 2;
  if (p.strength === "EN") s -= 3;
  if (isGarbageTime(p, ctx)) s -= 3;
  return s;
}
```

Sequence detectors run separately and group plays: comeback arc, rapid scoring run (2+ goals by one team inside 3 minutes, or 3 inside 5), overtime winner, goalie performance (only when save counts support it; a shutout without a supporting event is not fabricated into a "moment"). Tie-breaks: larger win-probability swing proxy, then later game time. Shootouts are labeled separately and never ranked as goals.

**Deterministic tests (exact expected outputs on committed fixtures):**
- The OT/2OT winner ranks first.
- An empty-net goal never outranks a third-period tying goal.
- Overturned plays are excluded.
- A multi-goal comeback groups into one arc with member plays.
- A rapid run (see Fixture A's three goals in 39 seconds) groups as one run.
- An extra-attacker tying goal in the final two minutes outranks any first-period goal.
- Early goals by the eventual leader are not tagged garbage time when a comeback follows.

**Output: Personal Game Memory.** One card: verified headline, final score strip, three ranked moments as a mini timeline, "your night" context (only if SessionContext exists and matches the game), a short reflection, and a copyable text summary. Optional editorial brief line ("suggested 20-second highlight structure: run, tying goal, OT winner"). No video generation.

**Seat personalization is factual only.** Sections map deterministically to conservative view zones:

```ts
type ViewZone = "centre-ice" | "attack-end" | "defend-end"
             | "upper-bowl-centre" | "upper-bowl-corner";
```

Allowed copy: "Your saved plan shows you were seated near centre ice as that third-period run unfolded." Forbidden: any sightline claim not derivable from section metadata.

### 6.3 Decision Log (formerly trace panel)

Streamed activity panel. Event types:

```ts
type TraceEvent =
  | { type: "request_parsed"; constraints: Constraint[] }
  | { type: "data_requested"; tool: string; input: unknown }
  | { type: "data_received"; tool: string; latencyMs: number; source: "live" | "snapshot" | "simulated" }
  | { type: "candidate_evaluated"; planId: string; violations: string[] }
  | { type: "decision"; summary: string }   // generated from planner data, not model introspection
  | { type: "response_chunk"; text: string }
  | { type: "fallback_used"; reason: string }
  | { type: "error"; message: string };
```

Compact cards; raw JSON behind a disclosure. No model "thinking" is displayed. Decision summaries are computed from the planner's own evaluation data ("Candidate B selected: only option satisfying gluten-free and warmups").

### 6.4 Session memory

```ts
type SessionContext = {
  schemaVersion: 1;
  plannedGameId: string;
  venueId: string;
  party: { adults: number; children: number };
  dietaryRequirements: Array<{ value: string; source: "explicit-user-input" }>;
  seatSection?: string;
  viewZone?: ViewZone;
  arrivalChoice?: { mode: "train" | "drive" | "walk" | "other"; scheduledArrival: string };
  selectedPlanId: string;
  createdAt: string;
  expiresAt: string;  // 7 days
};
```

Rules: persistence happens only after structured-output validation and game/venue consistency checks; the model has no memory-write tool. Client storage (localStorage) is treated as untrusted input and re-validated server-side (schema version, expiry, game existence). UI: a "What GameLoop remembers" panel with per-field provenance and a Clear Memory button. Production note for interview: authenticated server-side storage with consent and retention rules.

---

## 7. Architecture

**Plan flow:** input -> structured extraction (model) -> Zod validation -> parallel domain adapters -> deterministic candidate generation -> deterministic feasibility + scoring -> model explanation -> validated SessionContext -> UI.

**Relive flow:** showcase game -> normalize -> deterministic moment scoring -> verified moment package + SessionContext -> structured recap (model) -> UI.

- **Routes:** `/api/plan` and `/api/relive` (separate, easier to validate and observe), sharing orchestration code in `/lib`.
- **Models:** Haiku 4.5 for constraint extraction if it passes the eval set; Sonnet 5 for plan explanation and recap. If routing adds friction, Sonnet 5 throughout: interview-scale cost is negligible either way (Haiku 4.5 is $1/$5 per MTok; Sonnet 5 launched June 30, 2026 at introductory $2/$10 through August 31). Pin exact model IDs in `lib/ai/models.ts` after confirming strings at docs.claude.com. Use strict tool/output schemas.
- **Transport:** AI SDK (install `ai@latest`, pin the resolved major) with the Anthropic provider for streaming and loop plumbing; custom TraceEvent stream, deterministic planner, reducers, and moment logic remain hand-written. Rationale: hand-rolling SSE framing and cancellation adds demo risk without proving domain knowledge.
- **Budgets:** 3 to 4 model steps maximum per request; per-external-tool timeout 4s; primary seeded path target 12s; hard request timeout 30s; instant seeded fallback on live-data timeout. Platform limits (300s on Vercel Fluid) are not the product target.
- **Prompt-injection posture:** the system prompt is not a security boundary. Zod-validate every request and tool result; allow-listed mode enum; input length cap (1,000 chars); no URL-fetch or code-execution tools; memory treated as untrusted; structured outputs required; off-topic requests get a boring scoped refusal.

---

## 8. Function contracts

| Function | Mode | Kind | Provenance |
|---|---|---|---|
| extract_plan_request | Plan | Model operation (structured output) | n/a |
| get_event_context | Plan | Adapter | SNAPSHOT/SIMULATED |
| search_concessions | Plan | Adapter | SIMULATED |
| get_transit_options | Plan | Adapter | SNAPSHOT (GTFS-derived) |
| get_gate_conditions | Plan | Adapter | SIMULATED |
| generate_candidate_plans | Plan | Deterministic | n/a |
| evaluate_candidate_plans | Plan | Deterministic | n/a |
| explain_plan | Plan | Model operation | n/a |
| list_showcase_games | Relive | Endpoint (no model) | SNAPSHOT |
| get_game_data | Relive | Adapter (box score + PBP concurrent) | SNAPSHOT or LIVE (flagged) |
| normalize_play_by_play | Relive | Deterministic | n/a |
| find_key_moments | Relive | Deterministic (always runs) | n/a |
| generate_recap | Relive | Model operation (structured output) | n/a |

Transit stub schema (enables deterministic disruption testing):

```ts
type TransitOption = {
  routeId: string;
  origin: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  walkingMinutes: number;
  reliability: "scheduled-only" | "simulated-delay";
  source: "gtfs-snapshot";
};
```

Payload discipline: reduce raw game payloads to the normalized schema server-side; assert in tests `estimateTokens(reducedPayload) < 4000`. Record measured raw sizes of the committed fixtures in sourceMeta rather than quoting unmeasured ranges.

---

## 9. Verified platform constraints and compliance wording

**NHL data.** Community references document `api-web.nhle.com/v1/gamecenter/{id}/play-by-play`, `/boxscore`, `/v1/schedule/{date}`, `/v1/score/{date}`. PRD wording, to be reused verbatim on /how-it-works: "The prototype includes an optional adapter for an undocumented NHL web endpoint observed to be accessible without authentication. Because the endpoint is not an officially supported developer API, committed seeded fixtures are the guaranteed demonstration source. The live adapter is experimental and is not a production integration. The prototype minimizes intellectual-property risk with plain-text factual references, no logos or imagery, reduced fixtures, and a non-affiliation disclaimer. Production use would require review of applicable data and licensing terms." Server-side calls only; cache per instance; be polite.

**Vercel.** Fluid compute default; max duration 300s on Hobby (configurable via maxDuration). Function instance memory is not a durable cross-request session store; user-controlled memory stays in the browser and is re-validated server-side. Rate limiting via **Vercel WAF rules**, not process memory. Unlisted deployment; seeded demo mode via query flag plus simple access code; demo mode requires no LLM key if budget is exhausted.

**Anthropic.** Current rates: Haiku 4.5 $1/$5 per MTok; Sonnet 4.6 $3/$15; Sonnet 5 intro $2/$10 through Aug 31, 2026. Full demo plus testing lands under $5 on any routing. Pin model IDs; verify at docs.claude.com before build.

**Transit.** Metrolinx publishes the GO Transit GTFS static file (public download, use agreement) and a registration-gated GO API. Decision: derive the SNAPSHOT transit records offline from the GTFS file once (real Union/Exhibition-corridor times, labeled with snapshot date); no runtime dependency, attribution note per the Metrolinx open-data license on /how-it-works.

**Branding.** No NHL, team, or MLSE logos or marks anywhere. Team names as plain text data. Fictional venue overlay ("Harbourview Arena") with fictional concession brands. Non-affiliation disclaimer in the footer.

---

## 10. Fixture spec (the two showcase games)

**Fixture A (primary, torture test): 2026 Stanley Cup Final Game 3, June 6, 2026: Vegas 5, Carolina 4 (2OT).** Carolina trailed 4-0 in the third, scored three goals in 39 seconds, tied it at 18:18 with the goalie pulled on a power play, and lost at 5:38 of double overtime on Shea Theodore's goal. One game exercises nearly every algorithm branch: rapid-run grouping, comeback arc, extra-attacker tying goal, garbage-time non-tagging (early goals precede a comeback), OT handling, and a winner for the eventual champion of the night. It also demos honestly: the comeback fell short, and the recap must say so accurately.

**Fixture B (contrast profile):** a tight, low-event game with a single OT winner, so ranking is exercised under sparse data. Leading candidate: the Carolina at Montreal overtime game from the 2026 playoffs (Svechnikov OT winner, series tied 1-1 entering the night). Confirm its play-by-play shape when fetching; any clean one-goal OT game from the 2026 playoffs is acceptable.

**Resolution steps (Monday):** GET `/v1/score/2026-06-06` to obtain Fixture A's gameId; fetch boxscore and play-by-play; run the reducer; commit reduced JSON with sourceMeta (endpoint, fetchedAt, measured raw size). Repeat for Fixture B. Never commit raw payloads.

**Important context flag:** the Maple Leafs missed the 2026 playoffs (last in the Atlantic; first miss since 2016) and drafted Gavin McKenna first overall in June. Do not build the demo around a 2026 Leafs playoff game (none exist) and avoid jokes about the season in the room. The McKenna pick is the safe positive Toronto hockey topic if it comes up.

**GTFS snapshot steps (Monday):** download the GO Transit GTFS zip (accepting the use agreement), extract 6 to 10 real evening arrivals on the Lakeshore corridor into the TransitOption schema, label `gtfs-snapshot` with the file date, add license attribution to /how-it-works.

**Venue simulation design:** 8 to 10 named stands with menus, dietary flags, price bands, and wait profiles; 4 gates with time-banded queue estimates; 12 sections mapped to ViewZones; all internally consistent (walking times form a sane graph) so the planner's trade-offs are real.

---

## 11. Tech stack and repository

- Next.js 16 (current stable; scaffold with `npx create-next-app@latest`, commit the lockfile), TypeScript strict, Tailwind
- AI SDK latest + Anthropic provider; Zod; Vitest; React Testing Library (a few component tests); Playwright (one seeded smoke test)
- Vercel deployment, WAF rate limit, unlisted URL

```
/app
  page.tsx                     (mode select, minimal)
  how-it-works/page.tsx
  api/plan/route.ts
  api/relive/route.ts
/components
  ConstraintContract.tsx  ItineraryTimeline.tsx  DisruptionControls.tsx
  ActivityPanel.tsx  GameMemoryCard.tsx  SourceBadge.tsx  MemoryPanel.tsx
/lib
  /planning   extract.ts  candidates.ts  evaluate.ts  schemas.ts  fixtures.test.ts
  /games      client.ts  normalize.ts  moments.ts  moments.test.ts
  /ai         models.ts  prompts.ts  outputs.ts
  /data       showcase-game-a.json  showcase-game-b.json  venue.json  transit-snapshot.json
/evals        plan-cases.json  run-plan-evals.ts
CLAUDE.md  DECISIONS.md  BUILDLOG.md
```

**Share output:** copy-text summary plus native Web Share API where supported. Image download is a cut-line feature; if attempted, keep the card fully local (system fonts, no remote assets) and test Safari.

---

## 12. Non-functional requirements

**Performance (seeded mode):** UI visible immediately; first Decision Log event under 750ms; constraint contract under 4s; completed plan under 12s; replan under 8s; recap under 15s after data load; live-mode plan under 20s; full fallback path under 20s.

**Security:** Zod on every request and tool result; mode allow-list; body-size cap; WAF rate limit; no model-generated URLs rendered as links; escaped output; AbortSignal propagation; no raw stack traces to users; truncate tool results before logging; keep request content out of persistent logs.

**Reliability:** request IDs; trace schema version; fallback reason surfaced; source timestamps; idempotent planner; `?demo=1` seeded mode; one-click reset.

**Accessibility:** keyboard-operable timeline and disclosures; screen-reader announcements for streaming status; no color-only meaning; icon text alternatives; reduced-motion support; focus moved to results; semantic ordered list for itinerary; accessible error summaries; sufficient contrast.

**Privacy and responsible AI:** all memory local and visible; 7-day expiry; Clear control; no accounts or tracking; no inference of sensitive attributes; explicit-versus-derived provenance per field; no allergy-safety claims; no raw model reasoning displayed.

---

## 13. Eval plan

`/evals/plan-cases.json`, 10 to 12 cases, run by a script that calls the extraction and planning pipeline and asserts:

```json
{
  "input": "Two kids, one gluten-free, train at 6:18, seated for warmups",
  "expect": {
    "partySize": 4,
    "children": 2,
    "dietaryIncludes": ["gluten-free"],
    "hardConstraints": ["dietary"],
    "mustProduceFeasiblePlan": true
  }
}
```

Include failure cases: impossible arrival; missing event; off-topic prompt; contradictory budget; edited/invalid memory blob; live tool timeout (must fall back). Keep the eval report (initial pass rate, failures, fixes, final pass rate) for the interview. This artifact outranks any commit graph.

---

## 14. Build plan (three evenings, hard gates)

**Monday, July 13: the seeded product exists without an LLM.**
Lock schemas; scaffold Next 16; resolve and commit both fixtures plus GTFS snapshot and venue data; build deterministic planner and moment engine with unit tests; static UI rendering precomputed outputs.
Gate: the whole journey can be demonstrated with zero model calls.

**Tuesday, July 14: the AI layer, deployed.**
Constraint extraction (structured output); recap generation; Decision Log streaming; error and timeout handling; memory bridge with validation and memory panel; first eval run; deploy to Vercel.
Gate: complete seeded AI journey works on the deployed URL.

**Wednesday, July 15: reliability and presentation.**
Disruption controls and replanning; live NHL adapter only if the core is stable; accessibility pass; WAF rules; /how-it-works; demo mode and reset; record a 90-second backup capture; rehearse the six-minute script twice.

**Cut order:** image download -> caption variants -> brand voice -> live game picker -> separate landing polish -> broad date search.
**Never cut:** coherent showcase data; deterministic planner; moment detection; **adaptive replanning (protected ahead of the memory bridge)**; provenance; memory controls; tests; a reliable deployed path.

---

## 15. Demo script (six minutes)

- **0:00 to 0:35, thesis:** "Most game-day services solve one transaction at a time. GameLoop resolves the trade-offs between them and carries the fan's context through the whole experience. The model understands and explains; code decides."
- **0:35 to 1:45, plan:** run the preloaded family prompt; point at the constraint contract and provenance badges.
- **1:45 to 2:40, why this plan:** candidate comparison, hard versus soft, the gate trade-off explanation.
- **2:40 to 3:35, disruption (peak):** click "Train delayed 18 minutes"; show invalidated steps, preserved hard constraints, the new decision summary.
- **3:35 to 4:35, relive the same game:** open Fixture A; show the deterministic ranking (the 39-second run grouped, the 2OT winner on top); the Personal Game Memory references the saved centre-ice plan, conservatively.
- **4:35 to 5:25, architecture and responsible AI:** model extracts and narrates; code evaluates; memory is visible and clearable; every value is labeled live, snapshot, or simulated. One line: "I have built open ReAct agents; I chose bounded orchestration here because the workflow is known and it could not be allowed to fail in this room."
- **5:25 to 6:00, engineering process:** one ADR (DECISIONS.md), one eval failure caught and fixed, one Claude Code mistake and its correction (BUILDLOG.md). Offer the live-data flag as the closer if there is appetite: "pick any real game."

No commit-graph scrolling. The Claude Code and OPG discussion continues conversationally after the demo; this script only plants it.

---

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Plan and recap reference different worlds | Single ShowcaseGame entity; bridge disabled for non-showcase events |
| Model invents venue or seat facts | Closed schemas; deterministic ViewZone mapping; restrained copy patterns |
| NHL endpoint changes or blocks | SNAPSHOT primary path; live adapter feature-flagged and labeled experimental |
| Edited or stale local memory | Server-side validation, schema version, expiry, consistency checks |
| Prompt injection | Validated inputs, allow-listed modes, no dangerous tools, structured outputs; a boring scoped refusal, not a spectacle |
| Misleading reasoning display | Decision Log shows execution and planner-derived decisions only |
| Dietary guidance implies safety | Uncertainty copy plus venue-confirmation warning |
| Live output differs in the room | Seeded demo mode, preloaded prompt, `?demo=1`, backup capture |
| Rate limit fails across instances | Vercel WAF, not process memory |
| Replanning drops a hard constraint | Constraint-preservation unit test; violation summary in UI |
| Scope explosion | Section 14 gates and cut order are pre-agreed |

---

## 17. Claude Code workflow and evidence artifacts

**CLAUDE.md skeleton (write before scaffolding):**

```md
# GameLoop conventions
- Next.js 16 App Router, TS strict. No new deps without a DECISIONS.md entry.
- Deterministic core (lib/planning, lib/games) is TDD: tests first, exact fixtures.
- Model prompts and schemas (lib/ai) are hand-reviewed; never auto-merged.
- All time math in normalized minutes from event start. Never compare time strings.
- Every external value carries a provenance field. UI must render it.
- Plan mode before any multi-file change. Only touch files named in the plan.
- Zod at every boundary: requests, tool results, memory, model outputs.
- Never commit raw NHL payloads or secrets. Fixtures are reduced JSON only.
```

**Evidence artifacts for the interview (replace the commit-graph idea):**
- `DECISIONS.md`: 3 to 5 ADRs. ADR-001 is already written by this PRD: bounded orchestration over open ReAct, with the trade-off recorded.
- `BUILDLOG.md`: three honest incidents in the format what happened / how it was caught / correction / lesson (the time-arithmetic class of bug is a likely candidate).
- Eval report: initial pass rate, failures, fixes, final pass rate.

Claude Code remains the delivery system and a stated interview topic (the recruiter asked for it explicitly). The evidence above shows it credibly; the app shows it convincingly.

---

## 18. Out of scope

Authentication, payments, real ticketing or ordering integrations, live in-game data, push notifications, video generation, mobile apps, multi-venue support, real seat maps, production data licensing. Each has a one-sentence production path on /how-it-works.
