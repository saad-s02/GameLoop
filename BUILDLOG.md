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

## 2026-07-15 Overnight styling session (branch style/overnight-pass, prod stays frozen)

Full visual overhaul on the branch per the overnight mission: dark-only arena-at-night design language (The Lit Sheet, see DESIGN.md), applied in passes with all three gates green at every commit. Production untouched; the freeze from 2026-07-14 stands.

Notable findings logged as they happened:

TraceEnvelope carries no timestamp, so the planned per-row elapsed clock in the decision log gutter would read 00:00.0 for every row in demo mode (frames arrive in one burst). The gutter stamps the scorer event number instead; total elapsed shows in the header only when it measures at least 100 ms, so live runs show real latency and rehearsals never show a dead clock.

An empirical contrast probe (canvas-resolved computed styles, all pages walked) plus a five-agent audit panel caught a cluster of AA failures in reduced-opacity frost text (ledger gutter, raw-event summaries, provenance strings, parentheticals, placeholders, char counter), all fixed by promoting to full-strength frost; the rule is now written into DESIGN.md. The probe initially missed these because Tailwind 4 emits color-mix() for opacity modifiers, which the first regex parser skipped silently.

Restyle-introduced regression caught and fixed: the new sticky header could cover programmatic focus targets (plan results, infeasible section, memory card); scroll-mt-20 added to all four. Also fixed: an unguarded hover transform on the home cards (reduced-motion guardrail), and the experimental relive form reusing the dashed border DESIGN.md reserves exclusively for SIMULATED provenance.

Pre-existing issues found by the keyboard audit, NOT fixed overnight (interaction behavior, not styling; for Saad to decide): (1) buttons that disable themselves on the interaction that activates them (plan submit, disruption buttons, relive buttons, enter submit) drop keyboard focus to body during streaming; predates the restyle. (2) SourceBadge supplementary context on the memory card is tooltip-only (title attribute), also pre-existing.

## 2026-07-15 Styled build deployed, freeze replaced

Saad approved lifting the freeze (merge and deploy instruction, 01:30). Protocol followed: style/overnight-pass fast-forwarded into master (6 commits, tip 35027df), conscious re-verify on master (155/155 vitest, clean build, local smoke 1/1), production deploy gameloop-ocv8skoss (dpl_54gtxThG6Uhc7yrBEKXDu3WeycYP) behind the frozen alias gameloop-gilt.vercel.app. Deployed smoke with the real access code passed in 14.6 s. Warmup re-triggered with an authenticated cookie: extraction grammar 1,852 ms, recap grammar 6,502 ms, consistent with the 2026-07-14 profile; grammar cache is roughly 24 h, so the Thursday venue-network warmup 15 minutes before the demo stays in the runbook.

DEPLOY FREEZE re-declared as of this entry on the styled build. Any further overnight work happens on a new branch with no pushes to master and no deploys without Saad.

## 2026-07-16 Overnight conversational session (branch feature/conversational-plan, prod stays frozen)

Mission: answerable clarifications, conversational refinement, assume-don't-interrogate, honest domain edges. All four goals shipped on the branch with gates green at every commit (final state: vitest 206/206, clean build, playwright 3/3 including the untouched scripted demo smoke). Prod untouched; the freeze stands.

Surprises logged as they happened:

The plan's pinned redirect copy said "Vegas Golden Knights at Carolina Hurricanes", which is backwards against the fixture (home is VGK) and quietly names a real host inside a fiction where Harbourview owns the venue. The Task 8 implementer's TDD run caught the contradiction between the plan's own code and its pinned test string and reported it instead of shipping either; the fix is neutral copy ("versus", home side first to mirror the code-built scoreLine order).

Two real product gaps surfaced by the new eval cases, both fixed deterministically with TDD rather than by weakening the eval expectations. First, an uncoverable hard dietary need (nut-free: no venue stand carries it) generated zero candidates, so the UI would have said "no feasible candidates generated" without naming the need and with no alternative; candidate generation now gates on coverable needs only, so the honest outcome is an infeasible result with the violation "dietary: no stand tonight offers nut-free", a bestAlternative, and a violated chip. Second, "actually we arrive at 6" extracts mode other (the model correctly refuses to invent train), which wiped the prior train mode on merge and made every candidate infeasible; the merge now preserves the prior travel mode on bare time changes, with a stated mode still replacing.

Temperature 0 on extraction (the baseline eval report's own recorded follow-up) converted two coin-flip cases into stable outcomes: abbreviated-asks now consistently asks the party clarification (the intended D1 behavior), while both paraphrase cases now consistently drop the implicit food_preference in "warmups matter more than food variety" phrasing. Baseline block holds at 11 of 13, the same count as the recorded baseline, same residual class; the candidate one-line prompt fix is documented in evals/report-conversational.md and deliberately not applied the night before the demo.

The Claude Code process restarted mid fix-wave; the interrupted subagent was resumed from its saved transcript and completed with no work lost. Worth knowing: session-only crons survive a context reset but not a process exit, so the heartbeat should be checked after any restart.

Live end-to-end check (real key, local production build): the verbatim basketball-halal prompt redirects honestly and still plans (halal via Anchor Smokehouse with the cross-contact disclaimer), and a free-text "actually we arrive at 6" follow-up merges as an added arrival. Because that new arrival has no prior mode, the planner falls back to a doors-open walk-in and honestly marks the arrival chip traded rather than dead-ending; offering the nearest train explicitly for mode-less new arrivals is a recorded polish candidate, not a defect.

## 2026-07-16 Conversational branch merged to master, deploy still pending

On Saad's instruction after his morning review: feature/conversational-plan fast-forwarded into master (21 commits, tip 9dcc1e7), conscious re-verify on master green (206/206 vitest, clean build, playwright 3/3 including the untouched scripted demo smoke). Local branches feature/conversational-plan and style/overnight-pass deleted; nothing pushed to origin. Production remains the frozen styled build at gameloop-gilt.vercel.app; the DEPLOY FREEZE from 2026-07-15 still stands until Saad runs the remaining protocol steps (deploy, deployed smoke with the real access code, one rehearsal of the two new demo beats, venue warmup 15 minutes before).

## 2026-07-16 Conversational build deployed, freeze replaced

Saad approved push and deploy. master pushed to origin (0f56de8..6941c88, plus a BUILDLOG record commit); the GitHub default branch was found still pointing at style/overnight-pass, which blocked deleting that stale remote branch, so the default was corrected to master and the branch removed. Production deploy gameloop-i45x6cety behind the frozen alias gameloop-gilt.vercel.app, Ready in 45 seconds. Deployed smoke with the real access code: 3 of 3 in 18.5 seconds, covering the original scripted sequence (17.3 s, within its historical range) plus both conversational flows, which doubles as proof the alias serves the new build. Warmup re-triggered with an authenticated cookie: extraction grammar 8,920 ms (a fresh compile, expected because PlanRequestSchema gained eventMismatch), recap grammar 6,677 ms (consistent with prior profiles). Grammar cache is roughly 24 hours, so the venue-network warmup 15 minutes before the demo stays in the runbook.

DEPLOY FREEZE re-declared as of this entry on the conversational build. Remaining demo-day runbook: one rehearsal of the two new beats (Short on details answered inline; Arriving at 6:00 instead), the venue warmup, the Reset click, and the NHL endpoint curl for the live-game closer.
