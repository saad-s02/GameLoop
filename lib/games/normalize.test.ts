import { describe, expect, it } from "vitest";
import { NormalizedPlaySchema } from "../planning/schemas";
import { decodeStrength, normalizePlayByPlay } from "./normalize";
import slice from "./__fixtures__/pbp-slice.json";

describe("decodeStrength (situationCode decode table, research/01 F5)", () => {
  it.each([
    ["1551", true, "EV", false], // 5v5
    ["1551", false, "EV", false],
    ["1451", true, "PP", false], // home scores 5v4
    ["1451", false, "SH", false], // away scores 4v5
    ["1541", false, "PP", false], // away 5v4 power play
    ["0641", false, "PP", true], // the tying goal: away goalie pulled, 6v4, PP with extra attacker
    ["0551", true, "EN", false], // home scores into an empty away net
    ["1550", false, "EN", false], // away scores into an empty home net
    ["0651", true, "EN", false], // opponent-goalie-out dominates: home scoring vs 6 skaters and an empty away net is EN
  ])("%s scorerIsHome=%s -> %s extraAttacker=%s", (code, isHome, strength, ea) => {
    const d = decodeStrength(code, isHome as boolean);
    expect(d.strength).toBe(strength);
    expect(d.extraAttacker).toBe(ea);
  });
});

describe("normalizePlayByPlay on the reduced slice", () => {
  const plays = normalizePlayByPlay(slice);
  it("keeps only the mapped types, drops stoppages and challenges entirely", () => {
    expect(plays.map((p) => p.type)).toEqual([
      "goal",
      "period-start",
      "shot",
      "penalty",
      "goal",
      "period-end",
      "period-start",
      "goal",
    ]);
  });
  // NOTE: a leading P2 goal (eventId 800, sortOrder 650) was added to the slice ahead of
  // eventId 221 so the score-propagation test below has a prior score to inherit (see the
  // authoring note for Step 1). It sorts first, so the "221 trap" now shows up at goals[1]/[2]
  // rather than goals[0]/[1]; the trap itself (eventId 221 sorts after 900/901/902 despite a
  // lower eventId, because its sortOrder 892 is higher) still holds.
  it("orders by sortOrder, not eventId (the eventId 221 trap)", () => {
    const goals = plays.filter((p) => p.type === "goal");
    expect(goals[0]!.eventId).toBe(800);
    expect(goals[1]!.eventId).toBe(221);
    expect(goals[2]!.eventId).toBe(1785);
  });
  it("computes elapsedGameSeconds and 2OT label", () => {
    const tying = plays.find((p) => p.eventId === 221)!;
    expect(tying.elapsedGameSeconds).toBe(3498); // 2*1200 + 18*60+18
    expect(tying.periodLabel).toBe("3rd");
    const winner = plays.find((p) => p.eventId === 1785)!;
    expect(winner.elapsedGameSeconds).toBe(5138); // 4*1200 + 5*60+38
    expect(winner.periodLabel).toBe("2OT");
  });
  it("propagates the running score across non-goal plays", () => {
    const shot = plays.find((p) => p.eventId === 900)!;
    expect(shot.homeScore).toBe(4); // carried from the P2 preamble goal (eventId 800)
    expect(shot.awayScore).toBe(3);
  });
  it("joins scorer names from rosterSpots and derives strength", () => {
    const tying = plays.find((p) => p.eventId === 221)!;
    expect(tying.scorerName).toBe("Andrei Svechnikov");
    expect(tying.strength).toBe("PP");
    expect(tying.extraAttacker).toBe(true);
  });
  it("strips nhle.com asset URLs and validates against the schema", () => {
    expect(JSON.stringify(plays)).not.toContain("nhle.com");
    for (const p of plays) NormalizedPlaySchema.parse(p);
  });
});
