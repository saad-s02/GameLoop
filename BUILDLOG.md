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

## 2026-07-14 A stale environment variable shadowed every key fix

What happened: the API key kept returning 401 through three separate key rotations, and every diagnostic pointed at the .env.local file. The real cause: an old ANTHROPIC_API_KEY set as a Windows user environment variable. Node's --env-file and Next's env loading never override an already-set process variable, so every run silently used the dead key while the file held a perfectly good one. The user's edits had been landing correctly for some time.

How it was caught: the user pushed back that the key was definitely correct, which forced a re-examination of the assumption that process.env reflected the file; reading the file's raw bytes and the shell environment separately showed two different keys.

Correction: local scripts run with env -u ANTHROPIC_API_KEY until the Windows variable is removed; ADR-002 completed immediately afterward. During diagnosis the dead key's value was echoed into the session log; it is invalid, and the recommendation to revoke it in the console was passed to the user.

Lesson: when a fix that obviously should work repeatedly does not, stop debugging the fix and re-verify the assumption underneath it, and listen when the human says the fix is correct. Precedence between environment variables and env files is exactly the kind of invisible layer that produces this failure.

## 2026-07-14 Wave 3A integration measurements (local production server)

Not an incident, a record. First full live journey against the built app, one venue machine, intro-tier API:

Demo chip (zero model calls): full event sequence correct, contract card event strictly first, snap and flood control present. Live family prompt, cold: 14.8 s including the one-time extraction-schema grammar compile. Live family prompt, warm: 7.7 s against the 12 s budget. Extraction reproduced all five pinned constraints and the 6:18 to 18:15 snap verbatim. Replan with train-plus-18: 8.7 s against the 8 s budget, seated 18:48 exactly, warmups traded, dietary preserved, diff 6 kept 1 dropped 1 replaced. Tuning item for the eval pass: replans re-stream a full explanation; a shorter replan-specific explanation or smaller max tokens should close the 0.7 s. Live recap with session bridge, cold: 13.0 s against the 15 s budget including the recap schema grammar compile; scoreLine echoed exactly, fell-short framing honest, centre-ice bridge factual, no banned market strings.

One spec gap found by review and closed during integration: demo mode without a chip could fall through to a live extraction call; it now refuses with a scoped decision event, keeping the zero-LLM guarantee unconditional (covered by a route test).

## 2026-07-14 Production verification record

Deployed URL (present from this one): https://gameloop-gilt.vercel.app. Deployment Protection stays on Standard (previews and raw deployment URLs behind SSO, production alias public behind the app's own access code plus noindex); the earlier SSO 302s were probes against the team-scoped deployment URL, which is protected by design. Deployed Playwright smoke (full scripted demo sequence with the real access code): passed in 16.1 s. Production warmup after the final deploy: extraction grammar 1,667 ms, recap grammar 5,973 ms; compiled grammars cache roughly 24 hours, so this repeats from the venue network 15 minutes before the Thursday demo. Environment variables live in Vercel Production: ANTHROPIC_API_KEY and ACCESS_COOKIE_SECRET Sensitive, ACCESS_CODE harbourview2026. Remaining dashboard item: the single WAF rate rule (path starts with /api, 30 requests per 60 seconds per IP, action 429), to be published and then verified with one scripted demo sequence confirming zero 429s. After that verification: deploy freeze.

## 2026-07-14 WAF verification and deploy freeze

The published rule (api-rate-limit, path starts with /api, fixed window 30 per 60 seconds per IP, 429) was verified two ways from one machine: the full scripted demo sequence ran clean with zero 429s (13.0 s), and an immediate 40-request burst drew 429s from request 27 onward, consistent with the smoke sharing the window. The rule both admits the demo and cuts off abuse.

DEPLOY FREEZE as of this entry. The frozen production build is gameloop-gilt.vercel.app. Remaining Thursday runbook: warmup from the venue network 15 minutes before, one full script run, Reset click, NHL endpoint curl to decide the live-game closer, access-code entry rehearsed. Backup capture is recorded by Saad from the frozen URL.
