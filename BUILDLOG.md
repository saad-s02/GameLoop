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
