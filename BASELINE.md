# BASELINE.md: Phase 0 verification results

Produced Monday evening, July 13, 2026, by a seven-agent adversarial verification swarm. Every factual claim in PRD.md was attacked by execution (curl, npm view, live downloads, node scripts) or primary documentation fetched today. Full evidence lives in `research/01` through `research/07`; raw payloads live in `research/raw/` (gitignored, never committed).

**Verdict totals: 74 claims examined. 62 CONFIRMED, 6 CORRECTED, 6 UNVERIFIED. 1 BLOCKER, 13 ADJUSTMENTS.** The PRD survives verification structurally intact: no architecture change is required, and both fixtures, the model IDs, the stack, the WAF answer, and the GTFS snapshot all resolved.

---

## Verification table

Evidence pointers reference the research file and its internal section or evidence ID. Impact: none (spec holds), edit (see PRD-DELTA.md), or blocker.

### NHL API and Fixture A (research/01-nhl-fixture-a.md)

| Claim | Verdict | Evidence | PRD impact |
|---|---|---|---|
| `/v1/score/{date}` and gamecenter endpoints reachable, no auth, no special headers | CONFIRMED | 01, E1-E2 | none |
| Fixture A gameId resolvable from 2026-06-06 score feed | CONFIRMED: **2025030413** (CAR 4 at VGK 5, SCF Game 3) | 01, E1 | none |
| Carolina trailed 4-0 entering the third | CONFIRMED (all four VGK goals in P2; Marner hat trick) | 01, E3 | none |
| Three Carolina goals inside roughly 39 seconds | CONFIRMED: exactly 39s (07:03, 07:29, 07:42 of P3) | 01, E4 | none |
| Tying goal 18:18 of P3, goalie pulled, power play | CONFIRMED (Svechnikov, situationCode 0641, 6-on-4) | 01, E5 | none |
| Vegas winner 5:38 of 2OT by Shea Theodore | CONFIRMED (period 5, eventId 1785) | 01, E6 | none |
| Final 5-4 Vegas | CONFIRMED | 01, E3/E6 | none |
| `strength` field (EV/PP/SH/EN) available per play | CORRECTED: no such field; derive from `situationCode` + `eventOwnerTeamId` (decode documented) | 01, F5 | edit (D2) |
| Overturned plays identifiable via a `valid` flag | CORRECTED: feed expunges overturned goals entirely, no marker; only challenge stoppages remain | 01, E8, flag A1 | edit (D2) |
| Payloads "hundreds of KB" | CORRECTED favorably: pbp 209,296 B, boxscore 13,491 B, score 12,868 B | 01, E2 | none |
| periodDescriptor distinguishes OT tiers | CONFIRMED with caveat: 2OT is `number: 5`; `otPeriods` absent on OT1, use `number - regPeriods` | 01, E9 | edit (D2) |
| Scores are post-goal running totals, goal events only | CONFIRMED | 01, E4 | edit (D2) |
| Scorer names require rosterSpots join | CONFIRMED | 01, E7 | edit (D2) |
| Boxscore supports goalie-performance moments | CONFIRMED (saves, shotsAgainst, toi, starter) | 01, E10 | none |

### Fixture B (research/02-fixture-b.md)

| Claim | Verdict | Evidence | PRD impact |
|---|---|---|---|
| A Carolina at Montreal OT game exists in the 2026 playoffs | CONFIRMED: **2025030313**, 2026-05-25, ECF Game 3, CAR 3 at MTL 2 (OT), Centre Bell | 02, sec 1 | none |
| Svechnikov OT winner | CONFIRMED (14:06 of OT, even strength) | 02, sec 1 | none |
| Series tied 1-1 entering the night | CONFIRMED | 02, sec 1 | none |
| Contrast profile (tight, low event, single OT winner) | CONFIRMED: 5 goals, 403 events, scoreless P3, single OT, 161,233 B raw | 02, sec 2 | none |
| Alternates exist | CONFIRMED: 2025030217 (MTL 3 at BUF 2 OT, R2 G7) and 2025030126 (TBL 1 at MTL 0 OT, R1 G6), both verified with caveats | 02, sec 3 | none |

### Anthropic (research/03-anthropic.md)

| Claim | Verdict | Evidence | PRD impact |
|---|---|---|---|
| Haiku 4.5 $1/$5 per MTok | CONFIRMED | 03, verdict 1 | none |
| Sonnet 4.6 $3/$15 | CONFIRMED (but see delta D8: no routing path uses it) | 03, verdict 2 | edit (D8) |
| Sonnet 5 launched June 30, 2026, intro $2/$10 through Aug 31 | CONFIRMED ($3/$15 from Sep 1) | 03, verdict 3 | none |
| Exact model IDs pinnable | CONFIRMED: `claude-haiku-4-5-20251001` (dated snapshot) and `claude-sonnet-5` (dateless ID is itself the pinned snapshot; never append a date) | 03, sec 1 | none |
| Both models support tool use and structured outputs | CONFIRMED: `input_schema` + forced `tool_choice`; GA structured outputs via `output_config.format` (json_schema) and `strict: true` tools; old `output_format` deprecated | 03, sec 2 | none |
| Demo plus testing under $5 | UNVERIFIED (projection, enormous headroom; note Sonnet 5 tokenizer +30%) | 03, verdict 7 | none |
| 12s budget achievable with documented levers | CONFIRMED as doc facts, but Sonnet 5 defaults are latency-hostile: adaptive thinking on by default, effort defaults to high; first-use schema grammar compile adds latency; SDK auto-retries twice | 03, sec 4 | edit (D3) |
| docs.claude.com is the doc host | CORRECTED: 301 redirect to platform.claude.com | 03, header | edit (D3) |

### Stack (research/04-stack.md)

| Claim | Verdict | Evidence | PRD impact |
|---|---|---|---|
| Next.js 16 is current stable | CONFIRMED: next 16.2.10 = latest; create-next-app 16.2.10 | 04, table | none |
| AI SDK latest + Anthropic provider handles streaming transport | CONFIRMED with ADJUSTMENT: ai 7.0.26 (major 7), @ai-sdk/anthropic 4.0.14; `generateObject`/`streamObject` deprecated, use `generateText`/`streamText` with `Output.object({schema})`, `partialOutputStream`, `stream` (renamed from `fullStream`) | 04 | edit (D5) |
| Zod compatible | CONFIRMED: zod 4.4.3 satisfies shared peer `^3.25.76 \|\| ^4.1.8` | 04 | none |
| Node requirements | ai@7 requires Node >=22 and is ESM-only; local machine Node 22.17.0 OK; set Vercel runtime 22.x | 04 | edit (D5) |
| Peer conflicts | CONFIRMED none | 04 | none |

### Vercel (research/05-vercel.md)

| Claim | Verdict | Evidence | PRD impact |
|---|---|---|---|
| Fluid compute default for new projects | CONFIRMED (default since April 23, 2025) | 05, verdict 1 | none |
| maxDuration 300s on Hobby | CONFIRMED: 300s is both default and maximum; cannot be raised | 05, verdict 2 | none |
| **WAF rate limiting available on Hobby (priority question)** | **CONFIRMED: yes, free.** 1 rate-limit rule per project, fixed window, IP/JA4 keys, 10s to 10min window, 1,000,000 allowed requests included; plus 3 free custom rules | 05, WAF section | edit (D6: scope the single rule to /api) |
| Streaming counts toward duration | CONFIRMED; HTTP/2 PING keep-alive; TraceEvent stream doubles as heartbeat | 05, duration section | none |
| ANTHROPIC_API_KEY server-only env handling | CONFIRMED (encrypted at rest; only NEXT_PUBLIC_ reaches client; mark Sensitive) | 05, env section | none |
| "Unlisted deployment" provides privacy | CORRECTED: production .vercel.app URLs are public, not auto-noindexed; Hobby Deployment Protection covers previews only; Password Protection is Enterprise or $150/mo Pro add-on | 05, verdict 7 | edit (D6) |
| ?demo=1 plus access code viable | CONFIRMED (pure app code) | 05, verdict 8 | none |

### GO Transit GTFS (research/06-gtfs.md)

| Claim | Verdict | Evidence | PRD impact |
|---|---|---|---|
| GTFS static zip publicly downloadable | CONFIRMED: HTTP 200, 18,758,854 B, feed date 2026-07-07, valid through 2026-09-04 | 06, sec 1 | none |
| Archive structure as expected | CORRECTED: no calendar.txt; feed uses calendar_dates.txt with one service_id per date | 06, sec 2 | edit (D7) |
| Union and Exhibition stop IDs identifiable | CONFIRMED: UN (Union Station GO), EX (Exhibition GO); every LW train calls at Exhibition 9 min before Union | 06, sec 2 | none |
| 6 to 10 weekday evening arrivals extractable | CONFIRMED: exactly 10 in the 17:00 to 19:30 window, committed to research/transit-sample.json in exact TransitOption shape | 06, sec 3 | none |
| License and attribution capturable | CONFIRMED: Open Government Licence, Ontario, Metrolinx v1.0; exact attribution sentence captured | 06, sec 4 | none |
| Demo prompt "train arrives at 6:18" matches a real arrival | CORRECTED: no 18:18 arrival exists; nearest are 18:12 (LE) and 18:15 (LW) | 06, verdict table | edit (D7) |

### Claim sweep (research/07-claim-sweep.md)

| Claim | Verdict | Evidence | PRD impact |
|---|---|---|---|
| NHL compliance wording accurate and prudent | CONFIRMED | 07, A1 | none |
| localStorage assumptions (persistence, origin scoping, untrusted, limits) | CONFIRMED (4 claims) | 07, A2-A6 | none |
| Web Share API "where supported" hedge | CONFIRMED (desktop support patchy; copy-text fallback correct) | 07, A7 | none |
| html-to-image Safari risk | CONFIRMED real (multiple GitHub issues); PRD mitigation targets the right failure class | 07, A8 | none |
| Accessibility list achievable | CONFIRMED | 07, A9 | none |
| Leafs missed 2026 playoffs, last in Atlantic, first miss since 2016, McKenna first overall | CONFIRMED (all four, via live standings fetch and NHL.com) | 07, A10-A12 | none |
| July 16, 2026 is a Thursday; build window arithmetic | CONFIRMED | 07, A13-A14 | none |
| Scoring formula tier dominance | CONFIRMED (note: hardConstraintsSatisfied term is vestigial given the infeasibility filter) | 07, A15 | none |
| estimateTokens(reducedPayload) < 4000 plausible | UNVERIFIED, at risk: synthetic full normalized array estimates ~4,100 to 5,000 tokens; ambiguous whether budget targets the full array or the moment package; Sonnet 5 tokenizer +30% compounds | 07, A16 + inconsistency 8 | edit (D4) |
| Demo prompt within 1,000-char cap | CONFIRMED (157 chars) | 07, A17 | none |
| Interviewer identity and title | CONFIRMED | 07, A20 | none |
| Interviewer engineering philosophy attribution | UNVERIFIED (strong lead, no citable primary source pinned) | 07, A19 | none (soften in the room if pressed) |
| Timing budgets internally consistent | CONFIRMED (disambiguate the two different 4s values) | 07, A21 | edit (D13) |
| Eval case: partySize 4 from "Two kids, one gluten-free, train at 6:18..." | Internal contradiction with section 6.1 "ask, don't guess" | 07, B1 | **BLOCKER (D1)** |

---

## BLOCKERS (resolve before Phase 1)

**B1. The section 13 eval case contradicts the extraction contract's own rule.** The input "Two kids, one gluten-free, train at 6:18, seated for warmups" never states an adult count, yet the expected output asserts `partySize: 4`. Section 6.1 says "unstated values are not invented (party size missing means ask, not guess)." Ship it as written and either the eval fails against its own spec, or the pipeline learns to invent party members. The eval suite is a promoted core deliverable whose report "outranks any commit graph," so this is a blocker for the eval design, not a nitpick. Resolution is a spec edit (PRD-DELTA D1): use the full primary demo prompt (which states "my dad") for the partySize 4 case, and add the abbreviated input as a clarification-expected case. Nothing about the architecture changes.

No other blocker was found. Specifically: the NHL endpoint works without auth, both fixtures exist and their facts held, the model IDs and pricing are exactly as claimed, Next 16 is stable, WAF rate limiting is free on Hobby, and the GTFS pipeline works end to end.

---

## ADJUSTMENTS (spec edits, detailed in PRD-DELTA.md)

1. **D2, NormalizedPlay reducer reality (research/01):** no `strength` field exists (derive from situationCode); overturned plays are pre-excluded by the feed (the "overturned plays are excluded" test needs a synthetic voided-play fixture, and the two real challenge stoppages are recap color); order by sortOrder, never eventId; scores are post-goal and appear only on goal events; 2OT detection is `period.number - regPeriods`; scorer names need a rosterSpots join; strip nhle.com asset URLs in the reducer.
2. **D3, Sonnet 5 latency levers (research/03):** adaptive thinking is on by default at effort high; explicitly disable thinking or set effort low on the narrative calls, warm both structured-output schemas before the demo (first-use grammar compile), and cap SDK auto-retries (default 2 with backoff can blow the 12s budget). Cite platform.claude.com, not docs.claude.com.
3. **D4, token budget referent (research/03, 07):** decide that the 4,000-token assertion targets the moment package actually sent to the model, not the full normalized array, and measure with the Sonnet 5 tokenizer (count_tokens), which produces roughly 30 percent more tokens than older models.
4. **D5, AI SDK v7 surface (research/04):** structured output is `generateText`/`streamText` with `Output.object({schema})` and `partialOutputStream`; `fullStream` is renamed `stream`; ai@7 is ESM-only and requires Node 22 (set Vercel runtime 22.x). Codify in CLAUDE.md so generated code does not mix API eras.
5. **D6, Vercel posture (research/05):** scope the single Hobby rate-limit rule to path starts-with /api (covers both routes); add app-served noindex metadata because production URLs are public and not auto-noindexed on Hobby; keep the access code as the real gate; mark ANTHROPIC_API_KEY as Sensitive.
6. **D7, transit truth (research/06):** change the demo prompt train time to a real arrival (18:15 Lakeshore West, or keep 6:18 as the fan's belief and have the planner visibly snap to 18:15); note the feed uses calendar_dates.txt; walkingMinutes in the snapshot is a placeholder owned by the venue simulation.
7. **D8:** drop the Sonnet 4.6 pricing row (no routing path uses it) or label it an explicit fallback.
8. **D9:** state that shootout-attempt events are excluded from find_key_moments (no fixture can exercise them; playoff feeds have shootoutInUse false).
9. **D10:** document how pairwise "matters more than" maps into the 4-tier priority enum (stated approximation, not silent loss).
10. **D11:** carry requestId and trace schemaVersion in a stream envelope around TraceEvent.
11. **D12:** caveat "cache per instance" for the NHL adapter as best-effort (same per-instance-memory weakness the PRD itself uses to justify WAF).
12. **D13, minor:** disambiguate the two 4s values (per-tool timeout versus contract latency budget); retitle section 9 or note verification completed today.
13. **A1 test-design note (research/01):** keep the `valid` flag in NormalizedPlay for synthetic fixtures even though real snapshots never populate it false.

---

## Pinned values appendix

| Value | Pinned | Source |
|---|---|---|
| Fixture A gameId | **2025030413** (CAR 4 at VGK 5, 2OT, 2026-06-06, SCF Game 3) | research/01, E1 |
| Fixture B gameId | **2025030313** (CAR 3 at MTL 2, OT, 2026-05-25, ECF Game 3) | research/02, sec 1 |
| Fixture B alternates | 2025030217 (MTL at BUF, R2 G7); 2025030126 (TBL at MTL, R1 G6) | research/02, sec 3 |
| Extraction model ID | `claude-haiku-4-5-20251001` (dated snapshot; alias claude-haiku-4-5) | research/03, sec 1 |
| Narrative model ID | `claude-sonnet-5` (dateless ID is the pinned snapshot; never append a date) | research/03, sec 1 |
| Pricing | Haiku 4.5 $1/$5; Sonnet 5 intro $2/$10 through 2026-08-31, then $3/$15; Sonnet 4.6 $3/$15 | research/03, sec 3 |
| next | 16.2.10 | research/04 |
| ai | 7.0.26 (major 7, ESM-only, Node >=22) | research/04 |
| @ai-sdk/anthropic | 4.0.14 | research/04 |
| zod | 4.4.3 | research/04 |
| vitest | 4.1.10 | research/04 |
| @playwright/test | 1.61.1 | research/04 |
| tailwindcss | 4.3.2 | research/04 |
| @anthropic-ai/sdk | 0.111.0 (redundant if using the AI SDK; do not install by default) | research/04 |
| Local build machine | Node v22.17.0, npm 10.9.2 | research/04 |
| Fixture A payload sizes | play-by-play 209,296 B; boxscore 13,491 B; score 12,868 B | research/01, E2 |
| Fixture B payload size | play-by-play 161,233 B, 403 events | research/02, sec 2 |
| GTFS snapshot | feed date 2026-07-07 (feed_version 20260707085724), valid through 2026-09-04; service date sampled 2026-07-14; stops UN (Union), EX (Exhibition); routes 06260926-LW / 06260926-LE | research/06 |
| GTFS license | Open Government Licence, Ontario, Metrolinx, v1.0; attribution: "Contains information licensed under the Open Government Licence - Ontario - Metrolinx." | research/06, sec 4 |
| WAF on Hobby | Rate limiting available free: 1 rule per project, fixed window, IP/JA4 keys, 1M allowed requests included; 3 custom rules; Hobby maxDuration 300s default and max; Fluid default | research/05 |
