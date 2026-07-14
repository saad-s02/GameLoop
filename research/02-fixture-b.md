# Phase 0 Verification: Fixture B (contrast NHL playoff game)

Agent 2 of the adversarial verification swarm. Domain: locate and validate Fixture B per PRD section 10.
Method: live curl of NHL api-web endpoints on 2026-07-13, raw payloads saved under `research/raw/` (gitignored), interrogated with node scripts. Nothing below is quoted from memory; every number came out of a saved payload.

---

## 1. Verdict on the PRD candidate

**PRD claim (section 10, Fixture B):** "the Carolina at Montreal overtime game from the 2026 playoffs (Svechnikov OT winner, series tied 1-1 entering the night)", presumed Game 3 of a series in Montreal.

**Overall verdict: CONFIRMED.** Every element of the description matches a real game: **gameId 2025030313**, Eastern Conference Final (round 3) Game 3, CAR 3 at MTL 2 (OT), 2026-05-25 at Centre Bell.

Claim-by-claim:

| # | PRD claim | Verdict | Evidence |
|---|---|---|---|
| 1 | A Carolina at Montreal OT game exists in the 2026 playoffs | CONFIRMED | Club schedule row: `2025030313 \| 2026-05-25 \| CAR 3 @ MTL 2 \| OT \| rd3 G3` |
| 2 | Svechnikov scored the OT winner | CONFIRMED | Play-by-play goal record: `OT \| P4 \| 14:06 \| Andrei Svechnikov \| score 3-2 \| situation 1551` (even strength) |
| 3 | Series tied 1-1 entering the night | CONFIRMED | Same schedule: rd3 G1 `MTL 6 @ CAR 2` (MTL win), rd3 G2 `MTL 2 @ CAR 3 OT` (CAR win), so 1-1 before G3 |
| 4 | Game 3, played in Montreal | CONFIRMED | `seriesStatus.gameNumberOfSeries = 3`, venue `Centre Bell`, MTL is homeTeam |
| 5 | Tight, low-event, single OT winner (the contrast profile) | CONFIRMED | 5 goals total, 0 goals in P3, single OT period (`gameOutcome: {"lastPeriodType":"OT","otPeriods":1}`), no shootout |

Commands used:

```
curl -sS -o research/raw/mtl-schedule-20252026.json \
  "https://api-web.nhle.com/v1/club-schedule-season/MTL/20252026"
curl -sS -o research/raw/pbp-2025030313.json \
  "https://api-web.nhle.com/v1/gamecenter/2025030313/play-by-play"
```

---

## 2. Shape check: game 2025030313 play-by-play

Source: `https://api-web.nhle.com/v1/gamecenter/2025030313/play-by-play`, fetched 2026-07-13.

| Property | Value |
|---|---|
| Raw payload size | **161,233 bytes** (record in sourceMeta) |
| Total plays | **403** |
| Periods | 1 REG, 2 REG, 3 REG, 4 OT (max period number 4, no SO) |
| Total goals | **5** |
| Final | CAR 3, MTL 2 (OT) |
| OT winner | Andrei Svechnikov, 14:06 of OT, even strength (situationCode 1551) |
| Penalties | 7 |
| Shots on goal | 47 total, 6 in OT |
| OT events | 79 |

Goal sequence (from `plays[]` where `typeDescKey === "goal"`):

| Period | Time | Scorer | Score after (away-home) | Situation |
|---|---|---|---|---|
| P1 REG | 08:24 | Shayne Gostisbehere (CAR) | 1-0 | 1551 EV |
| P1 REG | 15:28 | Mike Matheson (MTL) | 1-1 | 1551 EV |
| P1 REG | 16:22 | Taylor Hall (CAR) | 2-1 | 1551 EV |
| P2 REG | 04:43 | Lane Hutson (MTL) | 2-2 | 1451 PP (home) |
| P4 OT | 14:06 | Andrei Svechnikov (CAR) | 3-2 | 1551 EV |

Event type distribution: `{"period-start":4,"faceoff":67,"hit":68,"giveaway":39,"shot-on-goal":47,"missed-shot":33,"stoppage":55,"blocked-shot":53,"delayed-penalty":4,"penalty":7,"takeaway":16,"goal":5,"period-end":4,"game-end":1}`

Algorithm-relevant observations:
- No team ever led by two, so `completesMultiGoalComeback` never fires. No comeback arc.
- The two goals 54 seconds apart in P1 (Matheson 15:28, Hall 16:22) were by **different teams**, so the rapid-run detector (2+ goals by one team inside 3 minutes) must not group them. This is a useful built-in negative test for run grouping and for a team-scoped `isSecondGoalWithinThreeMinutes`.
- One power-play goal (Hutson, 1451) lightly exercises strength handling; no SH, no EN goals.
- Scoreless third period plus a long OT means the OT winner (+10 OT, +7 GWG = 17) towers over four low-scoring regulation goals, so tie-break logic (later game time) decides ranks 2 through 4.

---

## 3. Candidates table (all verified one-goal-margin 2026 playoff OT games considered)

Sources: `club-schedule-season` for MTL, CAR, VGK (gameType 3 filter); play-by-play fetched for the three starred rows.

| gameId | Date | Teams (away @ home) | Score | OT | Round/Game | Event count | Raw bytes | OT winner |
|---|---|---|---|---|---|---|---|---|
| **2025030313** * | 2026-05-25 | CAR @ MTL | 3-2 | OT | R3 G3 | 403 | 161,233 | Andrei Svechnikov, 14:06 OT, EV |
| **2025030217** * | 2026-05-18 | MTL @ BUF | 3-2 | OT | R2 G7 | 390 | 156,648 | Alex Newhook, 11:22 OT, EV |
| **2025030126** * | 2026-05-01 | TBL @ MTL | 1-0 | OT | R1 G6 | 394 | 158,616 | Gage Goncalves, 09:03 OT, EV (only goal of the game) |
| 2025030123 | 2026-04-24 | TBL @ MTL | 2-3 | OT | R1 G3 | not fetched | n/a | not fetched |
| 2025030312 | 2026-05-23 | MTL @ CAR | 2-3 | OT | R3 G2 | not fetched | n/a | not fetched |
| 2025030222 | 2026-05-04 | PHI @ CAR | 2-3 | OT | R2 G2 | not fetched | n/a | not fetched |
| 2025030224 | 2026-05-09 | CAR @ PHI | 3-2 | OT | R2 G4 | not fetched | n/a | not fetched |
| 2025030245 | 2026-05-12 | ANA @ VGK | 2-3 | OT | R2 G5 | not fetched | n/a | not fetched |
| 2025030412 | 2026-06-04 | VGK @ CAR | 3-4 | OT | SCF G2 | not fetched | n/a | not fetched |

\* Play-by-play fetched and verified by execution. Unfetched rows come from schedule data only (score, OT flag, date verified; scorer unknown).

### Alternate 1: 2025030217, MTL 3 @ BUF 2 (OT), 2026-05-18, Round 2 Game 7

Goals: Danault (MTL) 04:30 P1, Bolduc (MTL, PP 1541) 14:29 P1, Greenway (BUF) 13:19 P2, Dahlin (BUF) 06:27 P3, **Newhook (MTL) 11:22 OT**. 390 plays, 156,648 bytes, single OT.
Caveat: Buffalo erased a 2-0 deficit to tie, so this game contains a two-goal comeback arc that fell short. Dramatically great (a Game 7), but it partially overlaps Fixture A's comeback territory, which weakens it as the contrast fixture.

### Alternate 2: 2025030126, TBL 1 @ MTL 0 (OT), 2026-05-01, Round 1 Game 6

One goal in the entire game: **Goncalves (TBL) 09:03 OT**. 394 plays, 158,616 bytes, single OT.
Caveat: the ultimate sparse case, but too sparse for the product surface: the Personal Game Memory renders three ranked moments, and this game has exactly one rankable goal. It would also tempt fabricating a goalie-shutout moment, which the PRD explicitly forbids without supporting save events. Keep it as a unit-test fixture idea (moment engine under a one-goal game), not as showcase Fixture B.

---

## 4. Recommendation

**Recommend game 2025030313 (CAR 3 @ MTL 2, OT, 2026-05-25, ECF Game 3) as Fixture B, exactly as the PRD proposed.** It is the cleanest available contrast to Fixture A: five goals, none within a two-goal deficit, so the comeback detector, the extra-attacker branch, and the garbage-time branch all stay silent, and ranking is decided purely by the OT/GWG bonuses and the tie-break chain (win-probability proxy, then later game time) across four near-identical regulation goals. It also carries two quiet negative tests for free: a pair of goals 54 seconds apart by opposite teams that the rapid-run detector must not group, and a scoreless third period that the "final ten minutes" branches must ignore. The single clean OT period (otPeriods 1, winner at 14:06) contrasts with Fixture A's double OT, the 403-event payload is small (161 KB raw, well inside the reducer budget), and the Svechnikov winner gives the recap a real, verifiable headline. Alternates 2025030217 and 2025030126 are validated fallbacks if anything changes, with the caveats noted above.

---

## 5. Cross-agent notes (not my domain, flagged for Agent 1 / orchestrator)

- ADJUSTMENT (minor, informational): the CAR/VGK schedules confirm Fixture A's game is **gameId 2025030413** (CAR 4 @ VGK 5, 2026-06-06, SCF Game 3). The schedule row's `gameOutcome` shows only `lastPeriodType: "OT"` with no `otPeriods` field, while the play-by-play payload's `gameOutcome` does carry `otPeriods` (verified on 2025030313, which reports `otPeriods: 1`). Agent 1 should confirm 2OT from the play-by-play payload, not the schedule row.
- No BLOCKER findings. The PRD's Fixture B description survives adversarial verification unchanged.

Raw payloads saved (gitignored, per PRD "never commit raw payloads"):
`research/raw/mtl-schedule-20252026.json`, `research/raw/car-schedule-20252026.json`, `research/raw/vgk-schedule-20252026.json`, `research/raw/pbp-2025030313.json`, `research/raw/pbp-2025030217.json`, `research/raw/pbp-2025030126.json`
