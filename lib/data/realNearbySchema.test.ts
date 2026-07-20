import { describe, expect, it } from "vitest";
import {
  filterRealNearby,
  RealNearbyEntry,
  RealNearbyEntrySchema,
  UNVERIFIABLE_NEEDS,
} from "./realNearbySchema";

function entry(over: Partial<RealNearbyEntry> & { id: string }): RealNearbyEntry {
  return RealNearbyEntrySchema.parse({
    name: over.id,
    rating: { value: 4.0, source: "Tripadvisor", reviewNote: "test note" },
    walkMinutes: 5,
    priceLevel: "$$",
    openWeekendEvenings: true,
    iconic: false,
    evidence: [],
    sourceUrl: "https://example.com/",
    accessedAt: "2026-07-20",
    source: "research-notes",
    ...over,
  });
}

describe("RealNearbyEntrySchema", () => {
  it("accepts a complete entry and an entry with no rating", () => {
    expect(() => entry({ id: "a" })).not.toThrow();
    expect(() => entry({ id: "b", rating: undefined })).not.toThrow();
  });

  it("rejects an unknown evidence tier and a bad accessed date", () => {
    expect(() =>
      entry({
        id: "c",
        evidence: [{ need: "halal", tier: "verified" as never, line: "x" }],
      }),
    ).toThrow();
    expect(() => entry({ id: "d", accessedAt: "July 20" })).toThrow();
  });
});

describe("filterRealNearby", () => {
  const wvrst = entry({
    id: "wvrst",
    name: "WVRST",
    walkMinutes: 5,
    evidence: [{ need: "gluten-free", tier: "friendly", line: "dedicated fryer" }],
  });
  const paramount = entry({
    id: "paramount",
    name: "Paramount",
    walkMinutes: 5,
    evidence: [{ need: "halal", tier: "certified", line: "HMA directory" }],
  });
  const union = entry({
    id: "union-chicken",
    name: "Union Chicken",
    walkMinutes: 5,
    evidence: [{ need: "halal", tier: "self-described", line: "own claim" }],
  });
  const fresh = entry({
    id: "fresh",
    name: "Fresh Kitchen",
    walkMinutes: 13,
    evidence: [
      { need: "vegetarian", tier: "self-described", line: "fully vegan" },
      { need: "vegan", tier: "self-described", line: "fully vegan" },
    ],
  });
  const realSports = entry({ id: "real-sports", name: "Real Sports", walkMinutes: 2, iconic: true });
  const steam = entry({ id: "steam", name: "Steam Whistle", walkMinutes: 8, iconic: true });
  const blondies = entry({ id: "blondies", name: "Blondies", walkMinutes: 6, iconic: true });
  const closedSat = entry({ id: "closed", name: "Closed Sat", openWeekendEvenings: false, iconic: true, walkMinutes: 1 });
  const all = [wvrst, paramount, union, fresh, realSports, steam, blondies, closedSat];

  it("nut-free and dairy-free render the honest absence, never options", () => {
    expect(UNVERIFIABLE_NEEDS).toEqual(["nut-free", "dairy-free"]);
    expect(filterRealNearby(all, ["nut-free"])).toEqual({ kind: "absence", need: "nut-free" });
    expect(filterRealNearby(all, ["gluten-free", "nut-free"])).toEqual({ kind: "absence", need: "nut-free" });
    expect(filterRealNearby(all, ["dairy-free"])).toEqual({ kind: "absence", need: "dairy-free" });
  });

  it("no dietary needs: the iconic picks, nearest first, never weekend-closed entries", () => {
    const sel = filterRealNearby(all, []);
    expect(sel.kind).toBe("options");
    if (sel.kind === "options") {
      expect(sel.picks.map((p) => p.id)).toEqual(["real-sports", "blondies", "steam"]);
    }
  });

  it("gluten-free picks entries with gluten-free evidence", () => {
    const sel = filterRealNearby(all, ["gluten-free"]);
    if (sel.kind === "options") expect(sel.picks.map((p) => p.id)).toEqual(["wvrst"]);
  });

  it("halal picks both tiers, nearest first then name", () => {
    const sel = filterRealNearby(all, ["halal"]);
    if (sel.kind === "options") expect(sel.picks.map((p) => p.id)).toEqual(["paramount", "union-chicken"]);
  });

  it("vegetarian includes the borderline-walk fully vegan option", () => {
    const sel = filterRealNearby(all, ["vegetarian"]);
    if (sel.kind === "options") expect(sel.picks.map((p) => p.id)).toEqual(["fresh"]);
  });

  it("a need with no matching entries degrades to the absence statement", () => {
    const sel = filterRealNearby([realSports], ["halal"]);
    expect(sel).toEqual({ kind: "absence", need: "halal" });
  });
});
