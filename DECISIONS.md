# DECISIONS.md: architecture decision records

## ADR-001: Bounded orchestration over an open ReAct loop

Decision: the model gets two jobs only, translate natural language into a validated constraint contract, and translate verified planner output into natural language. Code decides feasibility, arithmetic, ranking, and memory writes.

Cost stated explicitly: requests outside the eight constraint types or five disruptions get a scoped refusal, not a dynamic response. Acceptable for a closed-world venue domain, wrong for an open-ended product.

Why not template the explanation instead: the violation and trade-off space is combinatorial across eight constraint types and four priority tiers, one flexible prompt beats a template forest.

Status: accepted (PRD v1.0, spec section 14). Date: 2026-07-14.

## ADR-003: Test and script tooling dev dependencies

Decision: add tsx 4.20.3 (TS script runner for scripts/ and evals/), @testing-library/react 16.3.0 and jsdom 26.1.0 (the two component tests required by the PRD test plan). No other new dependencies without a new ADR.

Status: accepted. Date: 2026-07-14.

## ADR-004: Moments engine scoring, grouping, and ranking

Decision: implement `lib/games/moments.ts` exactly against the PRD formulas pinned in the Task 8 brief, developed TDD against synthetic fixtures only. The pinned Fixture A and Fixture B exact-output tests are deferred to a later pass once the showcase JSONs are committed; this ADR records the rules and the implementation choices made to resolve ambiguity the brief leaves open, so that later pass can audit them without re-deriving intent.

Per-goal score (`scoreGoal`): sum of OT (+10), game-winning (+7), creates-lead-in-final-ten-of-third (+7), creates-tie-in-final-ten-of-third (+6), completes-a-multi-goal-comeback (+6), second-goal-by-the-same-team-within-3-minutes (+4), SH (+2), EN (-3), garbage time (-3). Creates-lead and creates-tie are naturally mutually exclusive: because every goal changes its own team's differential by exactly one relative to the immediately preceding goal, a goal that lands the scoring team's differential at zero is a tie, and one that lands it at plus one is a lead; both can never be true of the same goal. Creates-lead and creates-tie can and do stack with completes-a-multi-goal-comeback on the same goal, since a comeback-completing goal that happens to fall in the final ten minutes of the third is legitimately both.

Game-winning goal: computed as the last point in the valid-goal sequence at which the eventual winner was not strictly ahead (tied or trailing), then the first goal by the winner after that point. This is the standard definition and is stable even when the winner led wire-to-wire (in which case their own first goal is the GWG). Undefined when the final score is tied, a synthetic-only case.

Completes-a-multi-goal-comeback: a goal earns this bonus exactly when it is the completing (tying-or-go-ahead) goal of some arc returned by `detectComebackArcs`. That function tracks each team's running score differential across the full valid-goal sequence; whenever the running minimum reaches -2 or worse and later recovers to zero or better, that span is an arc, and the episode resets at the recovery point so a later independent deficit can produce a second arc for the same team. The arc's member plays are that team's own goals from the first goal after the (earliest) point of maximum deficit through the completing goal.

Group scores: runs score `4 * count + (limit - spanSeconds) / 30`, limit 180 for a 2-goal run and 300 for 3-or-more (the rapid-run rarity bonus). This is why a 3-goal run in 39 seconds scores 20.7, materially higher than the sum of its members' individual `scoreGoal` values, which are typically near zero: the run's rarity is a property of the cluster, not of any one goal in it, so it must carry its own score rather than being priced through its members. Comeback arcs score `6 + max(member scoreGoal)`. OT-winner moments score `scoreGoal(winner) + 5`. Goalie-performance moments score `10 + (saves - 35) * 0.5`, only fired when a boxscore goalie line shows 35 or more saves, and carry no member plays since they are derived from the boxscore, not from play-by-play events; their moment id is `goalie-performance:${name with spaces replaced by dashes}` rather than the `${type}:${firstMemberEventId}` scheme every other moment type uses, precisely because there is no member play to key off of.

Membership and nesting: assignment claims plays in the order OT winner, then comeback arcs (highest group score first), then remaining scoring runs, then leftover standalone goals. A run whose entire member set falls inside an arc's span for the same team is attached to that arc's `childRuns` instead of standing alone; this happens for free once the arc claims its members, since a run left with fewer than 2 unclaimed members is dropped. Remaining runs are claimed greedily by group score: each iteration recomputes every still-live candidate's free (unclaimed) members and score, takes the highest scorer, claims its members, and repeats; a candidate that loses a member to an earlier moment is shrunk and recomputed, and dropped once its free member count falls below 2. `detectRuns` itself returns all maximal candidates (candidates that are not a strict subset of another candidate for the same team streak) even when two candidates overlap without either containing the other; resolving that overlap is this greedy claiming step's job, not `detectRuns`'s.

Ranking and the swing proxy: the final top-3 ordering is group score descending, then the win-probability swing proxy of the representative member play descending, then that play's `elapsedGameSeconds` descending, then moment id lexicographic ascending. The representative play is the member with the highest `scoreGoal`, ties broken toward the later play. The swing proxy is `3 - min(2, abs(homeScore - awayScore))` on the representative play's post-goal score, a coarse stand-in for win-probability swing: closer games swing more. Goalie-performance moments have no representative play, so they carry swing proxy 0 and `elapsedGameSeconds` of negative infinity for tie-break purposes only; this never distorts real ranking because they win or lose on score alone in every fixture seen so far.

Open implementation choices left for the Task 6/Step 5 re-gate to audit against the real fixtures, since none of them are pinned by a synthetic test in this pass: the exact ordering used to process multiple comeback arcs when more than one exists (currently by arc group score descending); the tie-break used when two run candidates score identically during greedy claiming; the `scoreAfter` field ordering on member plays (implemented as home-then-away, unpinned); and the two-pass trim (drop `assistNames`, then drop `scorerName` from all non-representative member plays) implemented per rule 8 but not exercised by any fixture under 11000 characters in this pass.

Status: accepted for the synthetic-fixture phase (Task 8 brief steps 1 through 4). The pinned Fixture A and B exact-output tests (brief step 5) are explicitly out of scope for this pass and will either confirm or revise the open choices above. Date: 2026-07-14.
