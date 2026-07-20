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

describe("COPY.planBuildingHeading", () => {
  it("is a short plain-prose heading, no ellipsis character or em dash", () => {
    expect(COPY.planBuildingHeading).toBe("Building tonight's plan");
    expect(COPY.planBuildingHeading).not.toContain("…");
    expect(COPY.planBuildingHeading).not.toContain("—");
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

describe("COPY.puckDropEyebrow", () => {
  it("shows a countdown inside the sane pre-game window", () => {
    expect(COPY.puckDropEyebrow("15:49", "19:30")).toEqual({
      mode: "countdown",
      prefix: "Puck drop in",
      value: "3h 41m",
    });
  });

  it("drops the hour figure once inside the final hour", () => {
    expect(COPY.puckDropEyebrow("19:00", "19:30")).toEqual({
      mode: "countdown",
      prefix: "Puck drop in",
      value: "30m",
    });
  });

  it("includes the exact 12-hour boundary", () => {
    expect(COPY.puckDropEyebrow("07:30", "19:30")).toEqual({
      mode: "countdown",
      prefix: "Puck drop in",
      value: "12h 0m",
    });
  });

  it("degrades to the static clock just past the 12-hour boundary", () => {
    expect(COPY.puckDropEyebrow("07:29", "19:30")).toEqual({
      mode: "static",
      prefix: "Puck drop",
      value: "19:30",
    });
  });

  it("degrades to the static clock long before puck drop", () => {
    expect(COPY.puckDropEyebrow("06:00", "19:30")).toEqual({
      mode: "static",
      prefix: "Puck drop",
      value: "19:30",
    });
  });

  it("degrades to the static clock once puck drop has passed", () => {
    expect(COPY.puckDropEyebrow("20:00", "19:30")).toEqual({
      mode: "static",
      prefix: "Puck drop",
      value: "19:30",
    });
  });

  it("excludes the exact instant of puck drop rather than showing a zero countdown", () => {
    expect(COPY.puckDropEyebrow("19:30", "19:30")).toEqual({
      mode: "static",
      prefix: "Puck drop",
      value: "19:30",
    });
  });

  it("defaults puckDropClock to the fixture's own PUCK_DROP_CLOCK constant", () => {
    expect(COPY.puckDropEyebrow("15:49")).toEqual({
      mode: "countdown",
      prefix: "Puck drop in",
      value: "3h 41m",
    });
  });
});

describe("COPY memory empty-state preview", () => {
  it("keeps the literal 'Nothing saved yet.' phrase the demo smoke spec asserts on", () => {
    expect(COPY.memoryEmptyLead).toContain("Nothing saved yet.");
  });

  it("previews exactly the three field groups the panel will populate", () => {
    expect(COPY.memoryEmptyPreviewItems).toEqual(["Party", "Dietary needs", "Seat section and arrival"]);
  });
});

describe("COPY.showcaseGameTag", () => {
  it("restates the 2OT thriller fixture's own label parenthetical, upper-cased", () => {
    expect(COPY.showcaseGameTag("Stanley Cup Final Game 3 (2OT thriller)")).toBe("2OT THRILLER");
  });

  it("restates the OT winner fixture's own label parenthetical, upper-cased", () => {
    expect(COPY.showcaseGameTag("Eastern Conference Final Game 3 (OT winner)")).toBe("OT WINNER");
  });

  it("returns undefined rather than inventing a tag when the label carries no parenthetical", () => {
    expect(COPY.showcaseGameTag("Game 7")).toBeUndefined();
  });
});

describe("COPY.showcaseGameAccent", () => {
  it("is loud for the multi-overtime fixture", () => {
    expect(COPY.showcaseGameAccent("Stanley Cup Final Game 3 (2OT thriller)")).toBe("loud");
  });

  it("is quiet for the single-overtime fixture", () => {
    expect(COPY.showcaseGameAccent("Eastern Conference Final Game 3 (OT winner)")).toBe("quiet");
  });

  it("defaults to quiet when there is no parenthetical to read a finish from", () => {
    expect(COPY.showcaseGameAccent("Game 7")).toBe("quiet");
  });
});

describe("COPY.provenancePlainExplain", () => {
  it("gives one plain sentence per provenance badge, matching the app's own definitions", () => {
    expect(COPY.provenancePlainExplain("live")).toBe("Checked right now.");
    expect(COPY.provenancePlainExplain("snapshot")).toBe("From a saved copy of the real schedule.");
    expect(COPY.provenancePlainExplain("simulated")).toBe("Invented for this demo.");
  });
});

describe("COPY.provenanceLead", () => {
  it("is plain prose with no em dash", () => {
    expect(COPY.provenanceLead.length).toBeGreaterThan(0);
    expect(COPY.provenanceLead).not.toContain("—");
  });
});
