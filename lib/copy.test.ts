import { describe, expect, it } from "vitest";
import { COPY } from "./copy";
import { ItineraryPlan } from "./planning/schemas";

describe("COPY.decisionLogSummary", () => {
  it("names the collapsed decision log's summary chip, singular signal count", () => {
    expect(COPY.decisionLogSummary(1)).toBe("Plan built from 1 signal · View reasoning");
  });

  it("names the collapsed decision log's summary chip, plural signal count", () => {
    expect(COPY.decisionLogSummary(12)).toBe("Plan built from 12 signals · View reasoning");
  });

  it("handles a zero count without breaking the sentence", () => {
    expect(COPY.decisionLogSummary(0)).toBe("Plan built from 0 signals · View reasoning");
  });
});

describe("COPY.fallbackUsed", () => {
  it("states a plain summary was written, never that the narrator failed or was unavailable", () => {
    const s = COPY.fallbackUsed("explanation failed; deterministic summary shown");
    expect(s).toBe("Wrote a plain summary without the live narrator: explanation failed; deterministic summary shown");
    expect(s).not.toContain("unavailable");
  });
});

describe("COPY.severityLabel", () => {
  it("keeps the mono-caps word for every tier", () => {
    expect(COPY.severityLabel("hard")).toBe("HARD");
    expect(COPY.severityLabel("high")).toBe("HIGH");
    expect(COPY.severityLabel("medium")).toBe("MEDIUM");
    expect(COPY.severityLabel("low")).toBe("LOW");
  });
});

describe("COPY.heroSentence", () => {
  const basePlan: ItineraryPlan = {
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
        stepId: "seat:section-101",
        kind: "seat",
        startMinutes: -60,
        clock: "18:30",
        title: "Seated, Section 101",
        source: "simulated",
      },
    ],
    constraintOutcomes: [
      {
        constraint: {
          type: "seated_by",
          value: { milestone: "warmups" },
          priority: "high",
          sourceText: "seated before warmups",
        },
        status: "satisfied",
      },
    ],
  };

  it("states the seated clock and the satisfied headline constraint, both verbatim from plan data", () => {
    expect(COPY.heroSentence(basePlan)).toBe("In by 18:30, seated before warmups.");
  });

  it("degrades to a shorter honest sentence when there is no satisfied seated_by constraint", () => {
    const plan: ItineraryPlan = { ...basePlan, constraintOutcomes: [] };
    expect(COPY.heroSentence(plan)).toBe("In by 18:30.");
  });

  it("also degrades when the seated_by constraint exists but was traded away, not satisfied", () => {
    const plan: ItineraryPlan = {
      ...basePlan,
      constraintOutcomes: [{ ...basePlan.constraintOutcomes[0]!, status: "traded" }],
    };
    expect(COPY.heroSentence(plan)).toBe("In by 18:30.");
  });

  it("returns nothing for an infeasible plan, which never has an ItineraryPlan to build from", () => {
    expect(COPY.heroSentence(undefined)).toBeUndefined();
  });
});
