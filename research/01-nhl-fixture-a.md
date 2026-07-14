# Phase 0 Verification: NHL api-web endpoint and Fixture A

Agent 1 of the adversarial verification swarm. Domain: `api-web.nhle.com` and Fixture A (2026 Stanley Cup Final Game 3).
Verified by execution on 2026-07-13 (all endpoints fetched live with curl, payloads interrogated with node).
Raw payloads: `research/raw/` only (never to be committed per PRD section 17).

## Verdict table

| # | Claim (PRD source) | Verdict | Evidence pointer |
|---|---|---|---|
| 1 | `/v1/score/{date}` reachable without auth or special headers (PRD 9) | CONFIRMED | E1 |
| 2 | Fixture A gameId resolvable from `/v1/score/2026-06-06` (PRD 10) | CONFIRMED, gameId **2025030413** | E1 |
| 3 | `/v1/gamecenter/{id}/boxscore` and `/play-by-play` reachable without auth (PRD 9) | CONFIRMED | E2 |
| 4 | Carolina trailed 4-0 entering the third (PRD 10) | CONFIRMED | E3 |
| 5 | Three Carolina goals inside roughly 39 seconds (PRD 10, 6.2) | CONFIRMED, exactly 39 seconds (07:03 to 07:42 of P3) | E4 |
| 6 | Tying goal at 18:18 of the third, goalie pulled, on a power play (PRD 10) | CONFIRMED (Svechnikov, situationCode 0641, 6-on-4) | E5 |
| 7 | Vegas winner at 5:38 of double overtime by Shea Theodore (PRD 10) | CONFIRMED (period 5, periodType OT, otPeriods 2, 05:38) | E6 |
| 8 | Final score 5-4 Vegas (PRD 10) | CONFIRMED (home VGK 5, away CAR 4) | E3, E6 |
| 9 | Event type key is `typeDescKey` (PRD 6.2 implied) | CONFIRMED, values differ from PRD enum (mapping needed, see F1) | E7 |
| 10 | `strength` (EV/PP/SH/EN) available per play (PRD 6.2) | CORRECTED: no strength field exists; must be derived from `situationCode` plus `eventOwnerTeamId` (decode in F5) | E5, F5 |
| 11 | Overturned or voided plays identifiable and excludable (PRD 6.2 `valid` flag, test "overturned plays are excluded") | CORRECTED: the final feed already removes overturned goals entirely; no goal-level marker exists to detect them. **ADJUSTMENT flag, see A1** | E8 |
| 12 | periodDescriptor distinguishes OT from 2OT (needed by PRD 6.2 tests) | CONFIRMED with caveat: both are `periodType:"OT"`; 2OT is `number:5`; `otPeriods` field is absent on OT1 and present (=2) only from OT2 onward. Use `number - regPeriods`, not `otPeriods` presence | E9 |
| 13 | Scores on goal events are post-goal running totals | CONFIRMED (first goal shows homeScore 1) | E4 |
| 14 | Player names require a roster join (not inline on plays) | CONFIRMED: plays carry playerIds only; names live in top-level `rosterSpots` | E7 |
| 15 | Boxscore supports goalie-performance moments (save counts, PRD 6.2) | CONFIRMED: `playerByGameStats.{away,home}Team.goalies[]` with `saves`, `shotsAgainst`, `goalsAgainst`, `toi`, `starter` | E10 |
| 16 | Payload sizes: pbp "hundreds of KB" assumption | CORRECTED (favorably): pbp 209,296 bytes, boxscore 13,491 bytes, score 12,868 bytes | E2 |

No BLOCKER findings. One ADJUSTMENT (A1) and three reducer-design notes that change implementation details but not architecture.

## Flags

**A1 (ADJUSTMENT, PRD 6.2 deterministic test list).** The test "Overturned plays are excluded" cannot be exercised against the real Fixture A payload. Two Vegas goals in period 2 were challenged by Carolina (offside at 00:34, goalie interference at ~04:00) and overturned; the final feed contains no goal events for them, no `valid:false` marker, and no revised-event flag. The only residue is stoppage events with challenge reasons (`chlg-vis-off-side`, secondaryReason `chlg-vis-goal-interference`) plus gaps in `sortOrder`. Consequences: (1) the normalizer's `valid` flag will be true for every play in real snapshots, (2) the overturned-play test must use a synthetic fixture with an injected voided play, or be reframed as "challenge stoppages are never classified as goals," and (3) the recap can truthfully mention "Vegas had two more goals overturned on Carolina challenges," which is verifiable from the stoppage events and is great demo color.

## Evidence

Commands were run from `D:\Projects\GameLoop` with Git Bash. Full raw files in `research/raw/`.

**E1: score endpoint, no auth.**
```
curl -sL -w "\nHTTP_STATUS:%{http_code}\n" -o research/raw/score-2026-06-06.json \
  "https://api-web.nhle.com/v1/score/2026-06-06"
HTTP_STATUS:200            # plain curl, no headers, no key, no cookie
```
Payload contains exactly one game:
```
{"id":2025030413,"season":20252026,"gameType":3,"gameDate":"2026-06-06",
 "away":"CAR 4","home":"VGK 5","gameState":"OFF",
 "periodDescriptor":{"number":5,"periodType":"OT","otPeriods":2,"maxRegulationPeriods":3},
 "seriesStatus":{"round":4,"seriesAbbrev":"SCF","seriesTitle":"Stanley Cup Final",
   "topSeedTeamAbbrev":"CAR","topSeedWins":1,"bottomSeedTeamAbbrev":"VGK","bottomSeedWins":2,
   "gameNumberOfSeries":3}}
```
gameId = **2025030413** (2025-2026 season, gameType 3 = playoffs). Vegas is the HOME team.

**E2: gamecenter fetches and byte sizes.**
```
curl -sL -o research/raw/fixture-a-boxscore.json ".../v1/gamecenter/2025030413/boxscore"    # HTTP 200
curl -sL -o research/raw/fixture-a-pbp.json ".../v1/gamecenter/2025030413/play-by-play"     # HTTP 200
wc -c:  13491 fixture-a-boxscore.json   209296 fixture-a-pbp.json
```
528 plays, 40 rosterSpots. Record these measured sizes in `sourceMeta` per PRD section 8.

**E3: 4-0 after two periods.** All four Vegas goals are in period 2; no goal events in period 3 before Carolina's first. Vegas goals (post-goal scores away-home): Hertl 10:26 (0-1, situationCode 1451, power play from a CAR too-many-men bench minor at 10:16), Marner 10:42 (0-2), Marner 14:32 (0-3), Marner 16:52 (0-4). Score entering P3: CAR 0, VGK 4. (Mitch Marner hat trick for Vegas is bonus recap color.)

**E4: the 39-second run.** Carolina goals in period 3, all 5v5 (1551), scores post-goal:
```
{"period":3,"timeInPeriod":"07:03","scorer":"Jordan Martinook","awayScore":1,"homeScore":4}
{"period":3,"timeInPeriod":"07:29","scorer":"Taylor Hall",     "awayScore":2,"homeScore":4}
{"period":3,"timeInPeriod":"07:42","scorer":"Jordan Staal",    "awayScore":3,"homeScore":4}
```
07:42 minus 07:03 = 39 seconds exactly. This satisfies both PRD run detectors (3 inside 5 minutes; consecutive pairs inside 3 minutes).

**E5: tying goal, 18:18 P3, 6-on-4.**
```
{"eventId":221,"sortOrder":892,"period":3,"timeInPeriod":"18:18","timeRemaining":"01:42",
 "situationCode":"0641","eventOwnerTeamId":12,"scorer":"Andrei Svechnikov (CAR #37)",
 "awayScore":4,"homeScore":4}
```
Preceding context: VGK penalty (Theodore, delaying-game-puck-over-glass) at 17:05 puts CAR on the power play (1541); Carolina then pulls the goalie for 6-on-4 (0641). Decoded: away goalie pulled (0), 6 away skaters, 4 home skaters, home goalie in (1). Goalie pulled AND power play, exactly as the PRD states. Strength for the reducer: PP with extra attacker (not EN; the Vegas net was occupied, `goalieInNetId` present).

**E6: 2OT winner.**
```
{"eventId":1785,"sortOrder":1291,"period":5,"periodType":"OT","otPeriods":2,
 "timeInPeriod":"05:38","timeRemaining":"14:22","situationCode":"1551",
 "scorer":"Shea Theodore (VGK #27)","scoringPlayerId":8477447,"awayScore":4,"homeScore":5,
 "shotType":"slap","assist1":"Brayden McNabb","assist2":"Brett Howden"}
```
Playoff OT periods are full 20 minutes (timeRemaining 14:22 = 20:00 minus 5:38). Final: VGK 5, CAR 4.

**E7: event type histogram and identifiers.** `typeDescKey` values present in this game: `period-start(5) faceoff(91) hit(108) blocked-shot(48) stoppage(79) shot-on-goal(59) missed-shot(47) takeaway(14) giveaway(55) period-end(5) penalty(5) goal(9) delayed-penalty(2) game-end(1)`. Numeric `typeCode` map: faceoff 502, hit 503, giveaway 504, goal 505, shot-on-goal 506, missed-shot 507, blocked-shot 508, penalty 509, stoppage 516, period-start 520, period-end 521, game-end 524, takeaway 525, delayed-penalty 535. Plays carry player IDs only (`scoringPlayerId`, `assist1PlayerId`, ...); names come from `rosterSpots[]` entries: `{teamId, playerId, firstName:{default}, lastName:{default}, sweaterNumber, positionCode, headshot}`.

**E8: overturned goals leave no goal events.** `grep -c -i "challenge"` = 0. Challenge markers found only as stoppage reasons:
```
sortOrder 321, P2 00:34: stoppage {"reason":"chlg-vis-off-side"} then stoppage {"reason":"offside"} then faceoff
sortOrder 374, P2 04:00: stoppage {"reason":"referee-or-linesman","secondaryReason":"chlg-vis-goal-interference"}
                          then faceoff (neutral zone, zoneCode "N")
```
No goal event exists near either challenge; the first surviving goal event of P2 is 10:26. A goalie-interference challenge only happens after a scored goal, and the neutral-zone faceoff matches the disallowed-goal restart rule, so the overturned goals were expunged from the feed (the shot survives as an ordinary `shot-on-goal` at 03:57). `sortOrder` gaps (314 to 321, 374 to 378) are consistent with removed events. See flag A1.

**E9: period boundary events.**
```
period-start P1..P3: {"number":n,"periodType":"REG","maxRegulationPeriods":3}
period-start P4:     {"number":4,"periodType":"OT","maxRegulationPeriods":3}          <- no otPeriods field
period-start P5:     {"number":5,"periodType":"OT","otPeriods":2,"maxRegulationPeriods":3}
period-end   P5 at 05:38; game-end P5 at 05:38 (situationCode 0660 at game-end, ignore)
```
Top-level: `regPeriods:3, otInUse:true, shootoutInUse:false` (no SO in playoffs), `gameOutcome:{"lastPeriodType":"OT","otPeriods":2}`.

**E10: boxscore goalie stats (values, not just keys).**
```
CAR F. Andersen  starter, 12/16 saves, 4 GA, toi 40:00    <- pulled after two periods
CAR B. Bussi     relief,  18/19 saves, 1 GA, toi 45:26
VGK C. Hart      starter, 29/33 saves, 4 GA, toi 85:38
VGK A. Hill      0/0, toi 00:00
```
Also note: Andersen being pulled mid-game means the Svechnikov "goalie pulled" claim refers to the extra-attacker pull, and Bussi (not Andersen) was in net for the 2OT winner (`goalieInNetId: 8483548` = Bussi). Boxscore has no play-by-play or scoring summary; skater lines are under `playerByGameStats.{awayTeam,homeTeam}.{forwards,defense,goalies}`.

## Field mapping: raw payload to NormalizedPlay (PRD 6.2)

Raw play shape (every one of the 528 plays has all of these):
`{eventId, periodDescriptor:{number, periodType, maxRegulationPeriods, otPeriods?}, timeInPeriod, timeRemaining, situationCode, homeTeamDefendingSide, typeCode, typeDescKey, sortOrder, details?}`

| NormalizedPlay field | Raw source | Notes |
|---|---|---|
| `eventId` | `play.eventId` | NOT monotonic (tying goal is eventId 221 between 1085 and 1785). Unique ID only. **Order by `sortOrder`**, which is strictly increasing across the feed (verified over all 528 plays) |
| `type` | `play.typeDescKey` | Mapping (F1): `goal` -> goal; `shot-on-goal` -> shot (PRD says "shot"); `penalty` -> penalty; `period-start`/`period-end` -> same; shootout attempts do not exist in playoff feeds (F4). Ignore: faceoff, hit, blocked-shot, missed-shot, stoppage, takeaway, giveaway, delayed-penalty, game-end |
| `period` | `play.periodDescriptor.number` | 1-3 REG, 4 = OT1, 5 = OT2 |
| `periodType` | `play.periodDescriptor.periodType` | Values seen: "REG", "OT". "SO" exists only in regular-season games. 2OT detection: `number - regPeriods` (top-level `regPeriods` = 3); do NOT rely on `otPeriods`, absent for OT1 (E9) |
| `elapsedGameSeconds` | derive: `(number - 1) * 1200 + parse(timeInPeriod)` | `timeInPeriod` is always "MM:SS" counting up (regex-verified on all plays). Playoff OT periods are 20:00, so the constant 1200 holds for this fixture. Example: tying goal = 2*1200 + 1098 = 3498; winner = 4*1200 + 338 = 5138 |
| `remainingPeriodSeconds` | `parse(play.timeRemaining)` | Always "MM:SS" counting down; 20:00 minus timeInPeriod |
| `teamId` | `play.details.eventOwnerTeamId` | Numeric (VGK 54, CAR 12). Team meta from top-level `homeTeam`/`awayTeam` (`id`, `abbrev`) |
| `scorerId` | `play.details.scoringPlayerId` | Numeric playerId; name via `rosterSpots` join (F3). Assists: `assist1PlayerId`, `assist2PlayerId`; on-goal totals: `scoringPlayerTotal` etc. |
| `homeScore` / `awayScore` | `play.details.homeScore` / `.awayScore` | POST-goal running totals, present ONLY on goal events (verified: zero non-goal events carry them). Reducer must carry the running score forward for non-goal plays |
| `strength` | derive from `play.situationCode` + `eventOwnerTeamId` | No strength field exists anywhere in the payload. Decode in F5 |
| `valid` | no source | Feed pre-excludes overturned plays (A1). Set true; keep the field for synthetic test fixtures |

Penalty details (for PP windows): `{typeCode: "MIN"|"BEN"|"PS"|"MAJ"..., descKey, duration (minutes; 0 for penalty shots), committedByPlayerId?, drawnByPlayerId?, servedByPlayerId?, eventOwnerTeamId}`. `eventOwnerTeamId` on a penalty is the penalized team. Note this game contains a penalty-shot event (`typeCode:"PS"`, `ps-slash-on-breakaway`, Aho on Marner, P3 04:04, not converted): a rare shape worth keeping in the reduced fixture as a normalizer edge case.

### F5: situationCode decode (verified against this game)

Four-character string: `[awayGoalieInNet][awaySkaters][homeSkaters][homeGoalieInNet]`.

Verified examples: `1551` = 5v5 both goalies in. `1451` on Hertl's goal = away has 4 skaters (CAR bench minor 10 seconds earlier), home 5: home-team PP goal. `1541` after Theodore's 17:05 penalty = CAR 5v4 PP. `0641` on the tying goal = away goalie pulled, 6 away skaters versus 4 home skaters. `0660` on game-end (celebration noise, ignore non-play events).

Derivation for a goal by team T:
- `mySkaters` and `oppSkaters` = digits 2 and 3 oriented by whether T is home or away (compare `eventOwnerTeamId` with top-level `homeTeam.id`).
- EN: opponent's goalie digit is 0 (scored into an empty net). Cross-check: `details.goalieInNetId` is absent on true EN goals.
- PP: `mySkaters > oppSkaters` and not EN (covers 5v4, 6v4 with goalie pulled, 5v3).
- SH: `mySkaters < oppSkaters` and not EN.
- EV: equal skater counts. Note a 6v5 goal by a team with its own goalie pulled and no penalty (own-goalie digit 0, 6v5) decodes as PP under the simple rule; if exactness matters, label extra-attacker separately, but PRD scoring treats the 6-on-4 case as PP, which the simple rule gets right for this fixture.

## Notes that affect the reducer design

1. **Order by `sortOrder`, key by `eventId`.** eventId is assignment order at the arena, not game order (edited or reviewed events get new IDs; the tying goal is eventId 221). sortOrder is strictly increasing but has gaps; never treat it as an index.
2. **Running score must be propagated.** Only goal events carry scores. `isGarbageTime`, `createsTie`, `createsLead` can read the goal's own post-goal `homeScore`/`awayScore` directly (post-goal semantics make `createsTie` a simple equality check).
3. **OT naming for the UI:** label from `number - regPeriods` ("OT", "2OT"). `gameOutcome.otPeriods` at top level gives the final answer for headlines.
4. **No shootout branch is exercisable in playoff fixtures** (`shootoutInUse:false`). If the PRD wants the `shootout-attempt` type and "SO" periodType tested, Fixture B or a synthetic case must come from a regular-season SO game.
5. **Roster join is mandatory** for scorer names: `rosterSpots` maps playerId to `firstName.default`/`lastName.default`, sweaterNumber, positionCode, teamId. Boxscore names are abbreviated ("J. Eichel"), so prefer rosterSpots for prose.
6. **Overturned goals vanish** (A1). The two Carolina challenge stoppages are themselves ranked-recap gold: keep them in the reduced fixture as evidence events if the recap mentions overturned goals.
7. **Goal details include highlight clip URLs and coordinates** (`xCoord`, `yCoord`, `zoneCode`, `shotType`, `highlightClipSharingUrl`). Strip clips and headshot URLs in the reducer: they are nhle.com assets and the PRD branding posture (section 9) avoids league imagery.
8. **Payloads are smaller than feared**: 209 KB pbp reduces easily under the 4,000-token budget once non-goal noise is dropped (9 goals, 5 penalties, 12 period-boundary events, 2 challenge stoppages is roughly 30 events).
9. **Boxscore is team/player stat lines only** (13 KB, no event list); it cleanly supports the goalie-performance detector (saves, shotsAgainst, toi, starter flag). The Andersen-pulled-for-Bussi storyline is in the goalie splits.
10. **Fixture color verified in passing:** Marner had a Vegas hat trick (10:26, 10:42, 14:32... third at 16:52 was his 3rd: goals 2, 3, 4), Hart made 29 saves over 85:38, and the winner beat relief goalie Bussi. All derivable from committed data, safe for the recap generator.

## Endpoint facts for sourceMeta

- `https://api-web.nhle.com/v1/score/2026-06-06` : HTTP 200, 12,868 bytes, no auth, no special headers (default curl UA).
- `https://api-web.nhle.com/v1/gamecenter/2025030413/boxscore` : HTTP 200, 13,491 bytes, no auth.
- `https://api-web.nhle.com/v1/gamecenter/2025030413/play-by-play` : HTTP 200, 209,296 bytes, no auth.
- fetchedAt: 2026-07-13 (America/Toronto), gameState "OFF" (final), so the snapshot is stable.
