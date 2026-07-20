import { describe, expect, it } from "vitest";
import { loadShowcaseGame } from "../data/showcaseGame";
import { buildMomentPackage } from "../games/moments";
import { GameMemorySchema, MomentPackageSchema, SessionContext } from "../planning/schemas";
import { buildDeterministicRecap, buildWarmupMomentPackage, resolveSessionContext } from "./recap";

const GAME_A_ID = "2025030413";

function validSession(overrides: Partial<SessionContext> = {}): SessionContext {
  const now = Date.now();
  return {
    schemaVersion: 1,
    plannedGameId: GAME_A_ID,
    venueId: "harbourview-arena",
    party: { adults: 2, children: 2 },
    dietaryRequirements: [{ value: "gluten-free", source: "explicit-user-input" }],
    seatSection: "section-101",
    viewZone: "centre-ice",
    selectedPlanId: "plan-abc123",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe("resolveSessionContext", () => {
  it("returns null/not-dropped when no sessionContext was sent", () => {
    expect(resolveSessionContext(undefined, GAME_A_ID)).toEqual({ session: null, dropped: false });
    expect(resolveSessionContext(null, GAME_A_ID)).toEqual({ session: null, dropped: false });
  });

  it("accepts a valid, unexpired session for the matching gameId", () => {
    const session = validSession();
    const result = resolveSessionContext(session, GAME_A_ID);
    expect(result.dropped).toBe(false);
    expect(result.session).toEqual(session);
  });

  it("drops a session that fails schema validation", () => {
    const result = resolveSessionContext({ schemaVersion: 2, junk: true }, GAME_A_ID);
    expect(result).toEqual({ session: null, dropped: true });
  });

  it("drops a session whose plannedGameId does not match the requested game", () => {
    const session = validSession({ plannedGameId: "some-other-game" });
    const result = resolveSessionContext(session, GAME_A_ID);
    expect(result).toEqual({ session: null, dropped: true });
  });

  it("drops an expired session", () => {
    const session = validSession({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const result = resolveSessionContext(session, GAME_A_ID);
    expect(result).toEqual({ session: null, dropped: true });
  });
});

describe("buildDeterministicRecap", () => {
  const pkg = buildMomentPackage(loadShowcaseGame(GAME_A_ID));

  it("builds a GameMemory whose scoreLine matches the package verbatim", () => {
    const memory = buildDeterministicRecap(pkg, null);
    expect(() => GameMemorySchema.parse(memory)).not.toThrow();
    expect(memory.scoreLine).toBe(pkg.scoreLine);
    expect(memory.momentBlurbs.length).toBeGreaterThanOrEqual(1);
    expect(memory.momentBlurbs.length).toBeLessThanOrEqual(3);
    expect(memory.yourNight).toBeUndefined();
  });

  it("only includes yourNight when a session is supplied", () => {
    const memory = buildDeterministicRecap(pkg, validSession());
    expect(memory.yourNight).toBeDefined();
    expect(memory.yourNight!.length).toBeLessThanOrEqual(400);
  });

  it("every momentBlurb references a real moment id from the package", () => {
    const memory = buildDeterministicRecap(pkg, null);
    const ids = new Set(pkg.moments.map((m) => m.id));
    for (const blurb of memory.momentBlurbs) expect(ids.has(blurb.momentId)).toBe(true);
  });

  it("the reflection caveat matches lib/planning/summarize.ts's fallback caveat verbatim, never implying a failed attempt", () => {
    const memory = buildDeterministicRecap(pkg, null);
    expect(memory.reflection).toContain("(Plain summary, written without the live narrator.)");
    expect(memory.reflection).not.toContain("unavailable");
  });

  it("the yourNight caveat matches the same wording when a session is supplied", () => {
    const memory = buildDeterministicRecap(pkg, validSession());
    expect(memory.yourNight).toContain("(Plain summary, written without the live narrator.)");
    expect(memory.yourNight).not.toContain("unavailable");
  });
});

describe("buildWarmupMomentPackage", () => {
  it("returns a minimal one-moment package built from showcase game B's pinned OT winner", () => {
    const pkg = buildWarmupMomentPackage();
    expect(() => MomentPackageSchema.parse(pkg)).not.toThrow();
    expect(pkg.gameId).toBe("2025030313");
    expect(pkg.moments).toHaveLength(1);
    expect(pkg.moments[0]!.type).toBe("ot-winner");
    expect(pkg.moments[0]!.rank).toBe(1);
  });
});
