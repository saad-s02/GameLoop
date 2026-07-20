import { describe, expect, it } from "vitest";
import { loadShowcaseGame } from "../data/load";
import { decisionSummary, fallbackNarrative, redirectSummary } from "./summarize";
import { PlanResult } from "./schemas";

describe("redirectSummary", () => {
  it("names the requested event and what Harbourview actually hosts tonight", () => {
    const s = redirectSummary("a basketball game", loadShowcaseGame("2025030413"));
    expect(s).toBe(
      "You asked about a basketball game. Tonight Harbourview Arena hosts hockey: Vegas Golden Knights versus Carolina Hurricanes, puck drop 19:30. Planning your night around it.",
    );
  });
});

describe("fallbackNarrative", () => {
  // fallbackNarrative's text is shown verbatim on every path that skips the live
  // narrator: demo mode and infeasible plans skip it by design (never attempted),
  // and a genuine explanation-call failure also lands here. The caveat wording
  // must read as true on all three, so it must never imply a failed attempt.
  const feasibleResult: PlanResult = {
    feasible: true,
    plan: {
      planId: "plan-test1",
      candidateId: "gate-1|stand-harbour-fresh|18:15|pickup-after-seating",
      gateId: "gate-1",
      standIds: ["stand-harbour-fresh"],
      transitRouteId: "lakeshore-west",
      transitArrival: "18:15",
      arrivalStrategy: "pickup-after-seating",
      seatSection: "section-101",
      viewZone: "centre-ice",
      seatedAtMinutes: -60,
      walkingMinutes: 9,
      waitMinutes: 10,
      estimatedCostCad: 16,
      score: 1000,
      steps: [
        {
          stepId: "gate:gate-1",
          kind: "gate",
          startMinutes: -70,
          clock: "18:20",
          title: "Gate 1 (Main)",
          source: "simulated",
        },
        {
          stepId: "food:stand-harbour-fresh",
          kind: "food",
          startMinutes: -65,
          clock: "18:25",
          title: "Pick up food at Harbour Fresh Market",
          source: "simulated",
        },
        {
          stepId: "seat:section-101",
          kind: "seat",
          startMinutes: -60,
          clock: "18:30",
          title: "Seated, Section 101",
          source: "simulated",
        },
      ],
      constraintOutcomes: [],
    },
    violations: [],
    adjustments: [],
    candidateStats: { evaluated: 3, feasible: 2 },
  };

  const infeasibleResult: PlanResult = {
    feasible: false,
    violations: ["budget exceeded"],
    adjustments: [],
    candidateStats: { evaluated: 3, feasible: 0 },
  };

  describe("decisionSummary", () => {
    it("names the gate, stand, arrival clock, and pickup timing in prose, never the raw candidateId or score", () => {
      const s = decisionSummary(feasibleResult);
      expect(s).toBe(
        "Selected Gate 1 (Main), Harbour Fresh Market, arriving 18:15, food pickup after seating: seated before warmups, 9 min walking, 10 min waiting.",
      );
      expect(s).not.toContain(feasibleResult.plan!.candidateId);
      expect(s).not.toContain("score");
    });

    it("still reports the infeasible violations verbatim, unaffected by the human-label change", () => {
      expect(decisionSummary(infeasibleResult)).toBe("No feasible plan: budget exceeded.");
    });
  });

  it("does not imply a failed attempt on the feasible path", () => {
    const s = fallbackNarrative(feasibleResult);
    expect(s).toContain("(Plain summary, written without the live narrator.)");
    expect(s).not.toContain("unavailable");
  });

  it("does not imply a failed attempt on the infeasible path", () => {
    const s = fallbackNarrative(infeasibleResult);
    expect(s).toContain("(Plain summary, written without the live narrator.)");
    expect(s).not.toContain("unavailable");
  });
});
