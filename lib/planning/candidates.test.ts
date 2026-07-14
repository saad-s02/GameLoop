import { describe, expect, it } from "vitest";
import { loadTransit, loadVenue } from "../data/load";
import { generateCandidates } from "./candidates";
import { demoConstraints } from "./schemas.test";
import { PlanRequest } from "./schemas";

const familyRequest: PlanRequest = {
  constraints: [...demoConstraints],
  clarificationsNeeded: [],
  offTopic: false,
};

const venue = loadVenue();
const transitOptions = loadTransit();

function demoInput() {
  return {
    venue,
    transitOptions,
    request: familyRequest,
    puckDropClock: "19:30",
    doorsOpenClock: "17:45",
  };
}

describe("generateCandidates", () => {
  it("bounds the demo-prompt candidate count between 8 (exclusive) and 200 (inclusive)", () => {
    const candidates = generateCandidates(demoInput());
    expect(candidates.length).toBeGreaterThan(8);
    expect(candidates.length).toBeLessThanOrEqual(200);
  });

  it("every candidate id is unique", () => {
    const candidates = generateCandidates(demoInput());
    const ids = new Set(candidates.map((c) => c.candidateId));
    expect(ids.size).toBe(candidates.length);
  });

  it("every stand-set covers gluten-free (the demo's hard dietary need)", () => {
    const candidates = generateCandidates(demoInput());
    for (const c of candidates) {
      const coveringStands = c.standIds.map((id) => venue.stands.find((s) => s.id === id)!);
      const covers = coveringStands.some((s) => s.menu.some((m) => m.dietaryFlags.includes("gluten-free")));
      expect(covers).toBe(true);
    }
  });

  it("cardinality never exceeds 2", () => {
    const candidates = generateCandidates(demoInput());
    for (const c of candidates) expect(c.standIds.length).toBeLessThanOrEqual(2);
  });

  it("pickup-en-route is excluded for empty stand-sets", () => {
    const candidates = generateCandidates(demoInput());
    const emptySetCandidates = candidates.filter((c) => c.standIds.length === 0);
    // hard dietary constraint means empty sets shouldn't even appear, but assert the
    // strategy-exclusion rule regardless of whether any slipped through.
    for (const c of emptySetCandidates) expect(c.arrivalStrategy).toBe("pickup-after-seating");
  });

  it("excludes empty stand-sets entirely when a hard dietary constraint exists", () => {
    const candidates = generateCandidates(demoInput());
    expect(candidates.some((c) => c.standIds.length === 0)).toBe(false);
  });
});
