# BUILDLOG.md: build incidents, captured in real time

Format per incident: what happened / how it was caught / correction / lesson.

## 2026-07-14 build start

Phase 2 build began from the approved design spec. Incidents append below as they happen.

## 2026-07-14 Fixture B goalie save count contradicts the research projection

What happened: the implementation plan pinned Fixture B's top three moments assuming no goalie reached the 35-save goalie-performance threshold, extrapolated from research/02's shots-on-goal figure. The Wave 0 boxscore fetch (13,522 bytes, gamecenter/2025030313/boxscore) shows Montreal's Jakub Dobes with 36 saves on 39 shots.

How it was caught: the plan's Task 4 verification step explicitly checks the 35-save threshold against the fetched boxscore before any moments code exists.

Correction: kept the threshold at 35 rather than tuning it to dodge real data, and re-pinned Fixture B's expected top three to [Svechnikov OT winner, Dobes goalie performance, Hutson power-play goal]. MomentSchema.memberPlays no longer requires a minimum of one, since goalie moments are boxscore-derived and have no play events.

Lesson: derived projections (SOG minus goals, split across goalies) are not verified facts. Pin expectations only against data actually fetched, and build verification steps that fire before the dependent code is written.

## 2026-07-14 Wave 0 environment gaps (deploy auth, API key)

What happened: the Vercel CLI token is invalid and the Vercel MCP integration lacks project-create permission, so the skeleton deploy is deferred pending a one-time vercel login. The ANTHROPIC_API_KEY in .env.local is well-formed (sk-ant-api..., 108 chars) but the API returns 401 invalid x-api-key, so the lib/ai spike's live confirmation is deferred pending a valid key.

How it was caught: Task 2 deploy attempt returned 403 forbidden on project creation; Task 3 spike run returned 401 from api.anthropic.com.

Correction: proceeding with Tasks 4 and 5 (fixture fetch, schema lock) and Wave 1, which have no cloud dependencies. Partial spike finding banked from the 401 error dump: the AI SDK v7 providerOptions path anthropic.thinking {type: disabled} maps to a top-level thinking field in the outgoing request body, and maxOutputTokens maps to max_tokens.

Lesson: prove credentials before the wave that needs them; the error dump of a failed call still carries request-shape evidence worth recording.

## 2026-07-14 Venue authoring arithmetic missed a wait-band crossing

What happened: the plan authored gate-1's wait profile with 10 minutes in the 18:30 to 19:00 band, but the spec's +18 disruption story (18:33 arrival seated about 18:48) assumed the same 6-minute wait as the baseline path. The delayed family reaches gate-1 at 18:41, inside the later band, so the authored numbers produced 18:52.

How it was caught: the venue consistency test pinned both outcomes exactly; the Task 7 implementation agent ran it, got -38 instead of -42, verified its transcription byte-for-byte against the brief, and reported BLOCKED instead of tuning the data.

Correction: main thread set gate-1's 18:30 to 19:00 band to 6 minutes, which lands the disrupted path at exactly 18:48 while touching no other pinned path (the 18:15 baseline uses the earlier band, and the gate-wait disruption overrides every band to 22). Plan document updated to match.

Lesson: authored fixture arithmetic must be traced through every band boundary it crosses, and the block-instead-of-tune rule did its job: the agent surfaced the contradiction instead of silently bending the data.

## 2026-07-14 The gate-wait disruption pin named the wrong gate

What happened: the plan pinned the "Gate 1 wait rises to 22" disruption as flipping the family plan to gate-5b, mirroring the PRD's illustrative Gate 5B prose. The planner implementation agent began verifying gate-5b's stand connectivity and the main thread completed the trace: gate-5b's two reachable stands offer no gluten-free item, so no gate-5b candidate can cover the hard dietary constraint, and gate-5b's own timing misses warmups anyway. Under the full four-gate arithmetic, gate-3 dominates (gluten-free via North Shore Grill, seated 18:34, gate wait 7 against the disrupted 22).

How it was caught: the implementer treated a pinned disruption expectation as something to verify against the authored venue before coding to it, and the main thread finished the arithmetic across all four gates.

Correction: conscious re-pin of the disruption expectation to gate-3. The venue data was not touched; it had already passed review, and bending data to rescue a pin is the failure mode the rules exist to prevent. The PRD's Gate 5B passage is illustrative prose about the kind of trade-off the explanation should narrate, not a binding requirement; the Decision Log narrates the real computed numbers.

Lesson: a pin derived from a two-way comparison is not a pin about the world; expectations must be derived against the full enumeration space they will be tested in.
