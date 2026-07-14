import { describe, expect, it } from "vitest";
import { ShowcaseGameSchema } from "../planning/schemas";
import { buildMomentPackage } from "./moments";
import gameA from "../data/showcase-game-a.json";
import gameB from "../data/showcase-game-b.json";

describe("pinned Fixture A top-3 (exact output)", () => {
  const pkg = buildMomentPackage(ShowcaseGameSchema.parse(gameA));
  it("ranks 2OT winner, fell-short comeback arc, VGK second-period run", () => {
    expect(pkg.moments.map((m) => m.type)).toEqual(["ot-winner", "comeback-arc", "scoring-run"]);
    expect(pkg.moments[0]!.memberPlays[0]!.eventId).toBe(1785);
    expect(pkg.moments[0]!.score).toBe(22);
    const arc = pkg.moments[1]!;
    expect(arc.outcome).toBe("fell-short");
    expect(arc.memberPlays).toHaveLength(4);
    expect(arc.memberPlays.some((p) => p.eventId === 221)).toBe(true);
    expect(arc.childRuns![0]!.memberEventIds).toHaveLength(3);
    expect(arc.childRuns![0]!.spanSeconds).toBe(39);
    expect(arc.score).toBe(18);
    const run = pkg.moments[2]!;
    expect(run.memberPlays).toHaveLength(3);
    expect(run.score).toBeCloseTo(13.8, 5);
  });
  it("scoreLine is exact and the tying goal is never game-winning", () => {
    expect(pkg.scoreLine).toBe("VGK 5, CAR 4 (2OT)");
  });
  it("package fits the staging budget", () => {
    expect(JSON.stringify(pkg).length).toBeLessThan(11000);
  });
});

describe("pinned Fixture B top-3 (exact output)", () => {
  const pkg = buildMomentPackage(ShowcaseGameSchema.parse(gameB));
  it("OT winner, then the Dobes goalie performance, then Hutson", () => {
    expect(pkg.moments.map((m) => m.type)).toEqual(["ot-winner", "goalie-performance", "goal"]);
    expect(pkg.moments[1]!.headline).toContain("36");
    expect(pkg.moments[1]!.score).toBeCloseTo(10.5, 5);
    expect(pkg.moments[2]!.memberPlays[0]!.scorerName).toContain("Hutson");
    expect(pkg.scoreLine).toBe("CAR 3, MTL 2 (OT)");
  });
});

describe("committed fixture drift pins", () => {
  it("game A shape and byte counts have not silently regenerated", () => {
    const a = ShowcaseGameSchema.parse(gameA);
    expect(a.plays).toHaveLength(83);
    expect(a.plays.filter((p) => p.type === "goal")).toHaveLength(9);
    expect(a.finalScore).toEqual({ home: 5, away: 4 });
    expect(a.gameOutcome.otPeriods).toBe(2);
    expect(a.sourceMeta.rawBytes).toEqual({ playByPlay: 209296, boxscore: 13491 });
    const p221 = a.plays.find((p) => p.eventId === 221);
    const p1785 = a.plays.find((p) => p.eventId === 1785);
    expect(p221?.elapsedGameSeconds).toBe(3498);
    expect(p1785?.elapsedGameSeconds).toBe(5138);
  });

  it("game B shape and byte counts have not silently regenerated", () => {
    const b = ShowcaseGameSchema.parse(gameB);
    expect(b.plays).toHaveLength(67);
    expect(b.plays.filter((p) => p.type === "goal")).toHaveLength(5);
    expect(b.finalScore).toEqual({ home: 2, away: 3 });
    expect(b.gameOutcome.otPeriods).toBe(1);
    expect(b.sourceMeta.rawBytes).toEqual({ playByPlay: 161233, boxscore: 13522 });
    expect(b.goalies.some((g) => g.saves === 36 && g.shotsAgainst === 39)).toBe(true);
  });
});
