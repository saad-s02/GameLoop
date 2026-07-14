# PRD-DELTA.md: proposed edits to PRD.md

Each delta lists the PRD location, the current text or assumption, the proposed change, and the rationale with its evidence source. PRD.md itself is untouched; apply these after human review. D1 is the only blocker; everything else is a tightening.

---

## D1 (BLOCKER). Section 13: fix the eval case that contradicts the extraction contract

**Current:** eval input "Two kids, one gluten-free, train at 6:18, seated for warmups" with expected `partySize: 4, children: 2`.

**Proposed:** split into two cases.

1. Input becomes the full primary demo prompt ("I'm bringing my dad and two kids. One child needs gluten-free food. Our train arrives at 6:18, and seeing warmups matters more than having many food choices."), keeping `partySize: 4, children: 2` (1 speaker + dad + 2 kids, all stated).
2. Add the abbreviated string as a new failure-class case expecting clarification behavior, for example `expect: { asksClarification: "party" , mustProduceFeasiblePlan: false }`.

**Rationale:** the abbreviated input never states an adult count, so `partySize: 4` requires inventing two adults, directly violating section 6.1's rule "unstated values are not invented (party size missing means ask, not guess)." The split preserves the intended coverage and adds a test that the ask-not-guess rule actually fires. (research/07, inconsistency 1)

## D2. Section 6.2: align NormalizedPlay and the deterministic tests with the real feed shape

**Changes:**

1. `strength` is not a feed field. Note that it is derived from `situationCode` (four digits: awayGoalieIn, awaySkaters, homeSkaters, homeGoalieIn) plus `eventOwnerTeamId`, with the decode rules recorded in research/01 F5. The 6-on-4 extra-attacker tying goal decodes as PP, which is what the scorer expects.
2. Overturned plays: the final feed expunges overturned goals entirely (no goal event, no marker; only challenge stoppages like `chlg-vis-off-side` remain). Keep the `valid` flag for synthetic fixtures, set it true for all real snapshot plays, and change the test "Overturned plays are excluded" to run against a synthetic fixture with an injected voided play. Optional demo color: the recap may truthfully say Vegas had two more goals overturned on Carolina challenges, derivable from the committed stoppage events.
3. Ordering: order by `sortOrder` (strictly increasing, gappy), never by `eventId` (the tying goal is eventId 221, mid-feed). Key by eventId.
4. Scores: `homeScore`/`awayScore` appear only on goal events and are post-goal totals; the reducer carries the running score across non-goal plays. `createsTie` becomes a simple equality on the goal's own post-goal score.
5. OT naming: `periodType` is "OT" for both OT1 and OT2; detect depth via `period.number - regPeriods` (top-level `regPeriods`), not `otPeriods`, which is absent on OT1.
6. Names: plays carry playerIds only; join `rosterSpots` for scorer and assist names.
7. Reducer hygiene: strip `highlightClipSharingUrl`, headshots, and other nhle.com asset URLs (branding posture, section 9).

**Rationale:** all verified by execution against the real Fixture A payload. (research/01, field mapping and E4 through E9)

## D3. Sections 7 and 9: add the Sonnet 5 latency configuration the 12s budget silently depends on

**Changes:**

1. Add to the model config spec: narrative calls (explain_plan, generate_recap) must explicitly set `thinking: {type: "disabled"}` or adaptive with `effort: "low"` or `"medium"`; Sonnet 5 defaults to adaptive thinking at effort high, which is the single most likely way to breach 12 seconds. Haiku 4.5 extraction: omit thinking entirely.
2. Warm both structured-output schemas with one throwaway request at deploy time: first use of a schema compiles a grammar (added latency); compiled grammars cache for 24 hours.
3. Cap SDK auto-retries on demo-path calls (default is 2 with exponential backoff, which can silently blow the budget); rely on the seeded fallback instead.
4. Set small explicit max_tokens (extraction about 1k, narrative 2k to 4k) and stream everything.
5. Wording: replace docs.claude.com references with platform.claude.com (301 redirect today).

**Rationale:** all quoted from platform docs fetched today. (research/03, section 4 and adjustments)

## D4. Section 8: pin the token-budget referent and the tokenizer baseline

**Current:** "assert in tests `estimateTokens(reducedPayload) < 4000`."

**Proposed:** the 4,000-token budget applies to the verified moment package sent to the model (per section 6.2's pipeline), not to the full normalized array, and the assertion must measure with the Sonnet 5 tokenizer (count_tokens endpoint), since Sonnet 5's tokenizer produces roughly 30 percent more tokens for the same text than Haiku 4.5 or Sonnet 4.6. Optionally keep a separate, larger cap on the full normalized array as a staging-size guard.

**Rationale:** a synthetic full-array estimate for Fixture A lands at or above 4,000 tokens, while the moment package is far smaller; as written the test is ambiguous and would likely fail against the torture-test fixture for the wrong reason. (research/07 A16 and inconsistency 8; research/03 adjustment 2)

## D5. Sections 7 and 11: record the AI SDK v7 API surface

**Changes:** ai@latest is major 7. `generateObject`/`streamObject` are deprecated: structured output is `generateText`/`streamText` with `Output.object({ schema })` (Zod accepted directly), streaming partials via `partialOutputStream`; the full event stream is `stream` (renamed from `fullStream`); result-method response helpers are deprecated in favor of stateless imports. ai@7 is ESM-only and requires Node >= 22 (local machine has 22.17.0; set the Vercel project runtime to 22.x; any eval-runner script must be ESM). Provider remains `@ai-sdk/anthropic` (4.0.14). Add these names to CLAUDE.md so generated code does not mix API eras.

**Rationale:** npm view and ai-sdk.dev migration guides fetched today. (research/04)

## D6. Section 9, Vercel paragraph: correct the "unlisted" posture and scope the WAF rule

**Changes:**

1. Rate limiting on Hobby is confirmed free but capped at one rule per project (fixed window, IP or JA4 keyed). Specify: one rule scoped to path starts-with /api covering both routes, for example 20 requests per 60s per IP, action 429 or Deny. Note counters are per-region (irrelevant at demo scale).
2. Replace the "unlisted deployment" claim: Hobby production URLs are publicly accessible and receive no automatic noindex (previews do); Hobby Deployment Protection cannot cover production (Password Protection is Enterprise, or a $150/month Pro add-on). Add: app-served `robots: { index: false }` metadata (one line in root layout), and keep the access code as the actual gate for anything that spends LLM budget. Demoing from a preview URL (auto-noindex plus Vercel Authentication) is a valid alternative when presenting from your own laptop.
3. Mark ANTHROPIC_API_KEY as a Sensitive environment variable (non-readable after creation, redacted in build logs).

**Rationale:** all quoted from Vercel docs fetched today. (research/05, verdicts 3, 7, 8 and adjustments)

## D7. Sections 6.1 and 10: make the demo prompt's train time real, and note the feed's calendar model

**Changes:**

1. The demo prompt's "Our train arrives at 6:18" matches no real weekday arrival at Union in the July 2026 feed; nearest are 18:12 (Lakeshore East) and 18:15 (Lakeshore West). Either change the prompt to "arrives at 6:15" or, better for the demo, keep the fan's stated 6:18 and have the planner visibly snap to the real 18:15 arrival with a provenance note (the data realness policy in section 4 requires the itinerary to display the real time either way).
2. GTFS snapshot note: the GO feed has no calendar.txt; it uses calendar_dates.txt with one service_id per date (service_id equals yyyymmdd). "Weekday" means picking a concrete weekday date. Also: stop_sequence values are not consecutive; GTFS times can exceed 24:00:00 (none in our window); walkingMinutes in transit-sample.json is a placeholder owned by the venue simulation.
3. Bonus corridor fact worth using: every Lakeshore West train calls at Exhibition GO nine minutes before Union, which strengthens the Union/Exhibition venue framing.

**Rationale:** extracted from the real feed dated 2026-07-07. (research/06)

## D8. Section 9, Anthropic paragraph: remove or justify the Sonnet 4.6 pricing row

**Proposed:** drop "Sonnet 4.6 $3/$15" (no routing path in section 7 uses that model), or add one sentence naming Sonnet 4.6 as the explicit fallback if Sonnet 5 misbehaves. The rate itself is accurate.

**Rationale:** cross-section consistency; looks like a leftover from the v0.1 revision. (research/07, inconsistency 2)

## D9. Section 6.2: define the shootout-attempt behavior in one line

**Proposed:** add "shootout-attempt events are recorded by the normalizer but excluded from find_key_moments and never rendered as moments." Playoff feeds have shootoutInUse false, so no committed fixture can exercise the branch; the line protects the feature-flagged live path.

**Rationale:** schema defines the variant, prose promises separate labeling, nothing consumes it. (research/07, inconsistency 3; research/01, note 4)

## D10. Section 6.1: state the priority-ordering approximation

**Proposed:** add "pairwise comparisons ('X matters more than Y') are mapped to a tier gap (X at least one tier above Y); chains that exceed the four tiers collapse to the nearest available gap, and ties within a tier break by input order." The demo prompt exercises exactly this path, so the approximation should be a stated design decision.

**Rationale:** a 4-value enum cannot losslessly represent pairwise orderings. (research/07, inconsistency 4)

## D11. Section 6.3: envelope the trace stream

**Proposed:** wrap TraceEvent in a stream envelope carrying `requestId` and `traceSchemaVersion`, matching the SessionContext precedent and delivering what section 12 promises ("request IDs; trace schema version").

**Rationale:** the union as written has no such fields. (research/07, inconsistency 5)

## D12. Section 9, NHL paragraph: caveat "cache per instance"

**Proposed:** amend to "cache per instance (best effort only; instance memory is not durable, the same reason section 0 moved rate limiting to WAF); the SNAPSHOT-first design is the real protection."

**Rationale:** internal consistency with the PRD's own architecture reasoning. (research/07, inconsistency 6)

## D13 (minor). Wording cleanups

1. Section 7 versus 12: note that "per-external-tool timeout 4s" and "constraint contract under 4s" are different quantities that share a number.
2. Section 9 title: verification is now complete (this Phase 0); keep the title accurate by noting model IDs were confirmed on 2026-07-13.
3. Scoring formula note: `hardConstraintsSatisfied * 1000` is vestigial given the infeasibility filter removes hard violators before scoring; harmless, keep or drop.

**Rationale:** research/07, claims A15 and A21, inconsistency 7.
