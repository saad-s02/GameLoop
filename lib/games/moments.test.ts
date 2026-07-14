import { describe, expect, it } from "vitest";
import { NormalizedPlay, ShowcaseGame } from "../planning/schemas";
import { buildContext, buildMomentPackage, detectComebackArcs, detectRuns, scoreGoal } from "./moments";

let seq = 0;
function makeGoal(
  o: Partial<NormalizedPlay> & { elapsedGameSeconds: number; homeScore: number; awayScore: number; teamId: number },
): NormalizedPlay {
  seq += 1;
  const period = Math.min(Math.floor(o.elapsedGameSeconds / 1200) + 1, 5);
  return {
    eventId: o.eventId ?? 1000 + seq,
    sortOrder: seq * 10,
    type: "goal",
    period,
    periodType: period <= 3 ? "REG" : "OT",
    periodLabel: period <= 3 ? ["1st", "2nd", "3rd"][period - 1]! : period === 4 ? "OT" : "2OT",
    clock: "00:00",
    elapsedGameSeconds: o.elapsedGameSeconds,
    remainingPeriodSeconds: 1200 - (o.elapsedGameSeconds % 1200),
    homeScore: o.homeScore,
    awayScore: o.awayScore,
    teamId: o.teamId,
    scorerName: o.scorerName ?? `Scorer ${seq}`,
    strength: o.strength ?? "EV",
    extraAttacker: o.extraAttacker ?? false,
    valid: o.valid ?? true,
  };
}

function makeGame(
  goals: NormalizedPlay[],
  final: { home: number; away: number },
  ot?: number,
  goalies: ShowcaseGame["goalies"] = [],
): ShowcaseGame {
  return {
    gameId: "synthetic",
    source: "snapshot",
    sourceMeta: { endpoint: "test", fetchedAt: "2026-07-14", rawBytes: { playByPlay: 0, boxscore: 0 } },
    eventDate: "2026-07-14",
    homeTeam: { id: 1, abbrev: "HME", placeName: "Home", commonName: "Homers" },
    awayTeam: { id: 2, abbrev: "AWY", placeName: "Away", commonName: "Aways" },
    finalScore: { home: final.home, away: final.away },
    gameOutcome: { lastPeriodType: ot ? "OT" : "REG", otPeriods: ot },
    regPeriods: 3,
    venueId: "harbourview-arena",
    doorsOpenAt: "17:45",
    warmupStartAt: "18:40",
    puckDropAt: "19:30",
    eventOpsSource: "simulated",
    plays: goals,
    goalies,
  };
}

describe("scoreGoal + buildMomentPackage on synthetic fixtures", () => {
  it("1. OT winner ranks first", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const g2 = makeGoal({ elapsedGameSeconds: 1500, homeScore: 1, awayScore: 1, teamId: 2 });
    const g3 = makeGoal({ elapsedGameSeconds: 3700, homeScore: 2, awayScore: 1, teamId: 1 });
    const game = makeGame([g1, g2, g3], { home: 2, away: 1 }, 1);
    const pkg = buildMomentPackage(game);
    expect(pkg.moments[0]!.type).toBe("ot-winner");
    expect(pkg.moments[0]!.memberPlays[0]!.eventId).toBe(g3.eventId);
  });

  it("2. an empty-net goal never outranks a third-period tying goal", () => {
    // Two independently constructed contexts: a single goal cannot jump the game margin from a
    // fresh tie to 2 (margin only ever moves by exactly 1 per goal), so the EN-goal-at-margin-2
    // and the P3-tying-goal scenarios are built as separate minimal games and compared by score,
    // which is the primary ranking key.
    const tying = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const tyingGoal = makeGoal({ elapsedGameSeconds: 3500, homeScore: 1, awayScore: 1, teamId: 2 });
    const tyingCtx = buildContext(makeGame([tying, tyingGoal], { home: 1, away: 1 }));
    expect(scoreGoal(tyingGoal, tyingCtx)).toBe(6);

    const lead = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const enGoal = makeGoal({ elapsedGameSeconds: 3550, homeScore: 2, awayScore: 0, teamId: 1, strength: "EN" });
    const enCtx = buildContext(makeGame([lead, enGoal], { home: 2, away: 0 }));
    expect(scoreGoal(enGoal, enCtx)).toBe(-3);

    expect(scoreGoal(tyingGoal, tyingCtx)).toBeGreaterThan(scoreGoal(enGoal, enCtx));
  });

  it("3. voided plays are excluded from every moment", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const g2 = makeGoal({ elapsedGameSeconds: 1500, homeScore: 1, awayScore: 1, teamId: 2 });
    const wouldBeOtWinner = makeGoal({ elapsedGameSeconds: 3700, homeScore: 2, awayScore: 1, teamId: 1, valid: false });
    const realOtWinner = makeGoal({ elapsedGameSeconds: 3750, homeScore: 1, awayScore: 2, teamId: 2 });
    const game = makeGame([g1, g2, wouldBeOtWinner, realOtWinner], { home: 1, away: 2 }, 1);
    const pkg = buildMomentPackage(game);
    for (const m of pkg.moments) {
      expect(m.memberPlays.some((p) => p.eventId === wouldBeOtWinner.eventId)).toBe(false);
    }
  });

  it("4. a multi-goal comeback groups into one arc, fell-short, tying goal carries comeback +6", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const g2 = makeGoal({ elapsedGameSeconds: 400, homeScore: 2, awayScore: 0, teamId: 1 });
    const g3 = makeGoal({ elapsedGameSeconds: 1300, homeScore: 3, awayScore: 0, teamId: 1 });
    const g4 = makeGoal({ elapsedGameSeconds: 1600, homeScore: 3, awayScore: 1, teamId: 2 });
    const g5 = makeGoal({ elapsedGameSeconds: 1900, homeScore: 3, awayScore: 2, teamId: 2 });
    const tyingGoal = makeGoal({ elapsedGameSeconds: 2300, homeScore: 3, awayScore: 3, teamId: 2 });
    const otWinner = makeGoal({ elapsedGameSeconds: 3900, homeScore: 4, awayScore: 3, teamId: 1 });
    const game = makeGame([g1, g2, g3, g4, g5, tyingGoal, otWinner], { home: 4, away: 3 }, 1);

    const ctx = buildContext(game);
    expect(scoreGoal(tyingGoal, ctx)).toBe(6);

    const arcs = detectComebackArcs(ctx.goals, ctx);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.outcome).toBe("fell-short");
    expect(arcs[0]!.members.map((m) => m.eventId)).toEqual([g4.eventId, g5.eventId, tyingGoal.eventId]);

    const pkg = buildMomentPackage(game);
    const arc = pkg.moments.find((m) => m.type === "comeback-arc");
    expect(arc).toBeDefined();
    expect(arc!.outcome).toBe("fell-short");
    expect(arc!.memberPlays).toHaveLength(3);
    expect(arc!.memberPlays.some((p) => p.eventId === tyingGoal.eventId)).toBe(true);
  });

  it("5. a rapid run groups as one run with the rarity bonus", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 1000, homeScore: 1, awayScore: 0, teamId: 1 });
    const g2 = makeGoal({ elapsedGameSeconds: 1020, homeScore: 2, awayScore: 0, teamId: 1 });
    const g3 = makeGoal({ elapsedGameSeconds: 1039, homeScore: 3, awayScore: 0, teamId: 1 });
    const runs = detectRuns([g1, g2, g3]);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.members).toHaveLength(3);
    expect(runs[0]!.spanSeconds).toBe(39);
    expect(runs[0]!.score).toBeCloseTo(20.7, 5);
  });

  it("6. an extra-attacker tying goal in the final two minutes outranks any first-period goal", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 50, homeScore: 1, awayScore: 0, teamId: 1 });
    const tyingGoal = makeGoal({
      elapsedGameSeconds: 3500,
      homeScore: 1,
      awayScore: 1,
      teamId: 2,
      extraAttacker: true,
    });
    const otWinner = makeGoal({ elapsedGameSeconds: 3700, homeScore: 2, awayScore: 1, teamId: 1 });
    const game = makeGame([g1, tyingGoal, otWinner], { home: 2, away: 1 }, 1);
    const pkg = buildMomentPackage(game);

    const idxOf = (eventId: number) => pkg.moments.findIndex((m) => m.memberPlays.some((p) => p.eventId === eventId));
    const tyingIdx = idxOf(tyingGoal.eventId);
    const g1Idx = idxOf(g1.eventId);
    expect(tyingIdx).toBeGreaterThanOrEqual(0);
    expect(g1Idx).toBeGreaterThanOrEqual(0);
    expect(tyingIdx).toBeLessThan(g1Idx);
  });

  it("7. early goals by the eventual leader are not garbage-tagged when a comeback follows", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const g2 = makeGoal({ elapsedGameSeconds: 800, homeScore: 2, awayScore: 0, teamId: 1 });
    const g3 = makeGoal({ elapsedGameSeconds: 1600, homeScore: 3, awayScore: 0, teamId: 1 });
    const g4 = makeGoal({ elapsedGameSeconds: 2000, homeScore: 4, awayScore: 0, teamId: 1 });
    const g5 = makeGoal({ elapsedGameSeconds: 2500, homeScore: 4, awayScore: 1, teamId: 2 });
    const g6 = makeGoal({ elapsedGameSeconds: 2900, homeScore: 4, awayScore: 2, teamId: 2 });
    const g7 = makeGoal({ elapsedGameSeconds: 3200, homeScore: 4, awayScore: 3, teamId: 2 });
    const g8 = makeGoal({ elapsedGameSeconds: 3400, homeScore: 5, awayScore: 3, teamId: 1 });
    const g9 = makeGoal({ elapsedGameSeconds: 3550, homeScore: 5, awayScore: 4, teamId: 2 });
    const game = makeGame([g1, g2, g3, g4, g5, g6, g7, g8, g9], { home: 5, away: 4 });
    const ctx = buildContext(game);

    // g3 (3-0) and g4 (4-0) would be wrongly garbage-tagged under a naive in-game-margin-only
    // rule; the final margin is 1, so isGarbageTime must be false for every goal in the game.
    expect(scoreGoal(g3, ctx)).toBe(0);
    expect(scoreGoal(g4, ctx)).toBe(0);
    for (const g of [g1, g2, g3, g4, g5, g6, g7, g8, g9]) {
      // no goal's score reflects the -3 garbage deduction (spot-checked via the two goals above
      // and confirmed here for the whole game: none carry a negative score).
      expect(scoreGoal(g, ctx)).toBeGreaterThanOrEqual(0);
    }
  });

  it("8. opposite-team goals 54 seconds apart never group as a run", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 1000, homeScore: 1, awayScore: 0, teamId: 1 });
    const g2 = makeGoal({ elapsedGameSeconds: 1054, homeScore: 1, awayScore: 1, teamId: 2 });
    expect(detectRuns([g1, g2])).toHaveLength(0);
  });

  it("9. shootout-attempt events are never ranked", () => {
    const realGoal = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const shootoutAttempt: NormalizedPlay = {
      ...makeGoal({ elapsedGameSeconds: 200, homeScore: 1, awayScore: 0, teamId: 2 }),
      type: "shootout-attempt",
    };
    const game = makeGame([realGoal, shootoutAttempt], { home: 1, away: 0 });
    const pkg = buildMomentPackage(game);
    for (const m of pkg.moments) {
      expect(m.memberPlays.some((p) => p.eventId === shootoutAttempt.eventId)).toBe(false);
    }
  });

  it("goalie-performance: 36 saves on 39 shots yields one moment, score 10.5, headline has '36'", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const game = makeGame(
      [g1],
      { home: 1, away: 0 },
      undefined,
      [{ name: "Sample Goalie", teamAbbrev: "AWY", saves: 36, shotsAgainst: 39, goalsAgainst: 0, toi: "60:00", starter: true }],
    );
    const pkg = buildMomentPackage(game);
    const goalieMoment = pkg.moments.find((m) => m.type === "goalie-performance");
    expect(goalieMoment).toBeDefined();
    expect(goalieMoment!.score).toBeCloseTo(10.5, 5);
    expect(goalieMoment!.headline).toContain("36");
    expect(goalieMoment!.memberPlays).toEqual([]);
  });

  it("goalie-performance: 29 saves yields no moment", () => {
    const g1 = makeGoal({ elapsedGameSeconds: 100, homeScore: 1, awayScore: 0, teamId: 1 });
    const game = makeGame(
      [g1],
      { home: 1, away: 0 },
      undefined,
      [{ name: "Backup Goalie", teamAbbrev: "AWY", saves: 29, shotsAgainst: 32, goalsAgainst: 3, toi: "60:00", starter: false }],
    );
    const pkg = buildMomentPackage(game);
    expect(pkg.moments.every((m) => m.type !== "goalie-performance")).toBe(true);
  });
});
