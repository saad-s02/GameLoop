import { describe, expect, it } from "vitest";
import { loadTransit, loadVenue } from "../data/load";
import { evaluate } from "./evaluate";
import { PlannerInput } from "./disruptions";
import { demoConstraints } from "./schemas.test";
import { Constraint, DisruptionId, PlanRequest, Venue } from "./schemas";
import { VenueSchema } from "./schemas";

const familyRequest: PlanRequest = {
  constraints: [...demoConstraints],
  clarificationsNeeded: [],
  offTopic: false,
};

const venue = loadVenue();
const transitOptions = loadTransit();

function baselineInput(): PlannerInput {
  return {
    venue,
    transitOptions,
    request: familyRequest,
    game: { gameId: "2025030413", doorsOpenAt: "17:45", warmupStartAt: "18:40", puckDropAt: "19:30" },
    transitDelayMinutes: 0,
  };
}

const ALL_DISRUPTIONS: DisruptionId[] = [
  "train-plus-18",
  "gate1-wait-22",
  "gf-stand-closed",
  "milestone-puck-drop",
  "add-accessibility",
];

describe("evaluate: pinned demo-path expectations", () => {
  it("winner uses gate-1, pickup-after-seating, includes stand-harbour-fresh, section-101 centre-ice, seatedAt -60", () => {
    const result = evaluate(baselineInput());
    expect(result.feasible).toBe(true);
    const p = result.plan!;
    expect(p.gateId).toBe("gate-1");
    expect(p.arrivalStrategy).toBe("pickup-after-seating");
    expect(p.standIds).toContain("stand-harbour-fresh");
    expect(p.seatSection).toBe("section-101");
    expect(p.viewZone).toBe("centre-ice");
    expect(p.seatedAtMinutes).toBe(-60);
  });

  it("records the 6:18 -> 18:15 (Lakeshore West) snap adjustment", () => {
    const result = evaluate(baselineInput());
    const snap = result.adjustments.find((a) => a.field === "arrival");
    expect(snap).toBeDefined();
    expect(snap!.requested).toBe("6:18");
    expect(snap!.resolved).toBe("18:15 (Lakeshore West)");
    expect(snap!.reason).toContain("No scheduled arrival at 18:18");
  });
});

describe("evaluate: idempotency", () => {
  it("byte-identical output across repeated calls", () => {
    const a = JSON.stringify(evaluate(baselineInput()));
    const b = JSON.stringify(evaluate(baselineInput()));
    expect(a).toBe(b);
  });
});

describe("evaluate: tie-break totality", () => {
  it("resolves an equal-score tie by walking minutes, then candidate id", () => {
    const tinyVenue: Venue = VenueSchema.parse({
      venueId: "harbourview-arena",
      name: "Harbourview Arena",
      source: "simulated",
      gates: [
        {
          id: "gate-a",
          name: "Gate A",
          accessible: true,
          crowdLevel: "low",
          waitProfile: [{ fromClock: "00:00", toClock: "23:59", waitMinutes: 5 }],
          source: "simulated",
        },
        {
          id: "gate-b",
          name: "Gate B",
          accessible: true,
          crowdLevel: "low",
          waitProfile: [{ fromClock: "00:00", toClock: "23:59", waitMinutes: 4 }],
          source: "simulated",
        },
        {
          id: "gate-c",
          name: "Gate C",
          accessible: true,
          crowdLevel: "low",
          waitProfile: [{ fromClock: "00:00", toClock: "23:59", waitMinutes: 5 }],
          source: "simulated",
        },
      ],
      stands: [
        {
          id: "stand-x",
          name: "Unreachable Stand",
          accessible: true,
          menu: [{ name: "Snack", priceCad: 5, dietaryFlags: [] }],
          waitProfile: [{ fromClock: "00:00", toClock: "23:59", waitMinutes: 2 }],
          source: "simulated",
        },
      ],
      sections: [
        { id: "section-a", name: "A", viewZone: "centre-ice", accessible: true, nearestGateId: "gate-a", source: "simulated" },
        { id: "section-b", name: "B", viewZone: "centre-ice", accessible: true, nearestGateId: "gate-b", source: "simulated" },
        { id: "section-c", name: "C", viewZone: "centre-ice", accessible: true, nearestGateId: "gate-c", source: "simulated" },
      ],
      walkingGraph: [
        { from: "union", to: "gate-a", minutes: 5 },
        { from: "union", to: "gate-b", minutes: 7 },
        { from: "union", to: "gate-c", minutes: 5 },
        { from: "gate-a", to: "section-a", minutes: 1 },
        { from: "gate-b", to: "section-b", minutes: 1 },
        { from: "gate-c", to: "section-c", minutes: 1 },
      ],
    });

    const tinyTransit = [
      {
        routeId: "TEST-ROUTE",
        origin: "Test Origin",
        scheduledDeparture: "17:30:00",
        scheduledArrival: "18:00:00",
        walkingMinutes: 0,
        reliability: "scheduled-only" as const,
        source: "gtfs-snapshot" as const,
      },
    ];

    const tinyRequest: PlanRequest = {
      constraints: [
        { type: "arrival", value: { statedClock: "18:00", normalizedClock: "18:00", mode: "train" }, priority: "hard", sourceText: "test" },
      ],
      clarificationsNeeded: [],
      offTopic: false,
    };

    const input: PlannerInput = {
      venue: tinyVenue,
      transitOptions: tinyTransit,
      request: tinyRequest,
      game: { gameId: "test-game", doorsOpenAt: "17:45", warmupStartAt: "18:40", puckDropAt: "19:30" },
      transitDelayMinutes: 0,
    };

    const result = evaluate(input);
    expect(result.feasible).toBe(true);
    // gate-a and gate-c are physically identical (score AND walking tie); gate-a wins on candidateId.
    expect(result.plan!.gateId).toBe("gate-a");
    expect(result.plan!.walkingMinutes).toBe(6);
    expect(result.runnerUp).toBeDefined();
    expect(result.runnerUp!.gateId).toBe("gate-c");
    expect(result.plan!.score).toBe(result.runnerUp!.score);
    expect(result.plan!.walkingMinutes).toBe(result.runnerUp!.walkingMinutes);
  });
});

describe("evaluate: steps strictly increasing", () => {
  it("winner and runner-up both have strictly increasing step startMinutes", () => {
    const result = evaluate(baselineInput());
    for (const plan of [result.plan!, result.runnerUp!]) {
      const times = plan.steps.map((s) => s.startMinutes);
      for (let i = 1; i < times.length; i++) {
        expect(times[i]!).toBeGreaterThan(times[i - 1]!);
      }
    }
  });
});

describe("evaluate: disruption matrix", () => {
  it("every disruption keeps the plan feasible with a planId different from baseline, dietary preserved", () => {
    const baseline = evaluate(baselineInput());
    expect(baseline.feasible).toBe(true);
    for (const d of ALL_DISRUPTIONS) {
      const result = evaluate(baselineInput(), { disruptions: [d] });
      expect(result.feasible, `${d} should remain feasible`).toBe(true);
      expect(result.plan!.planId, `${d} planId should differ from baseline`).not.toBe(baseline.plan!.planId);
      const dietaryOutcome = result.plan!.constraintOutcomes.find((o) => o.constraint.type === "dietary")!;
      expect(dietaryOutcome.status, `${d} dietary should stay satisfied`).toBe("satisfied");
    }
  });

  it("train-plus-18: seatedAtMinutes -42, warmups traded, dietary satisfied", () => {
    const result = evaluate(baselineInput(), { disruptions: ["train-plus-18"] });
    expect(result.feasible).toBe(true);
    const p = result.plan!;
    expect(p.seatedAtMinutes).toBe(-42);
    const warmups = p.constraintOutcomes.find((o) => o.constraint.type === "seated_by")!;
    expect(warmups.status).toBe("traded");
    const dietary = p.constraintOutcomes.find((o) => o.constraint.type === "dietary")!;
    expect(dietary.status).toBe("satisfied");
  });

  it("gate1-wait-22: selects gate-3 (gate-5b has no gluten-free stand to cover the hard dietary constraint)", () => {
    const result = evaluate(baselineInput(), { disruptions: ["gate1-wait-22"] });
    expect(result.feasible).toBe(true);
    expect(result.plan!.gateId).toBe("gate-3");
    const dietary = result.plan!.constraintOutcomes.find((o) => o.constraint.type === "dietary")!;
    expect(dietary.status).toBe("satisfied");
    const warmups = result.plan!.constraintOutcomes.find((o) => o.constraint.type === "seated_by")!;
    expect(warmups.status).toBe("satisfied");
  });

  it("gf-stand-closed: winning stand set excludes stand-harbour-fresh but still covers gluten-free", () => {
    const result = evaluate(baselineInput(), { disruptions: ["gf-stand-closed"] });
    expect(result.feasible).toBe(true);
    expect(result.plan!.standIds).not.toContain("stand-harbour-fresh");
    const dietary = result.plan!.constraintOutcomes.find((o) => o.constraint.type === "dietary")!;
    expect(dietary.status).toBe("satisfied");
  });

  it("milestone-puck-drop: planId differs from baseline and seated_by is satisfied", () => {
    const baseline = evaluate(baselineInput());
    const result = evaluate(baselineInput(), { disruptions: ["milestone-puck-drop"] });
    expect(result.feasible).toBe(true);
    expect(result.plan!.planId).not.toBe(baseline.plan!.planId);
    const seatedBy = result.plan!.constraintOutcomes.find((o) => o.constraint.type === "seated_by")!;
    expect(seatedBy.status).toBe("satisfied");
  });

  it("add-accessibility: selects gate-3 and section-102, dietary satisfied, seatedAt <= -50", () => {
    const result = evaluate(baselineInput(), { disruptions: ["add-accessibility"] });
    expect(result.feasible).toBe(true);
    expect(result.plan!.gateId).toBe("gate-3");
    expect(result.plan!.seatSection).toBe("section-102");
    const dietary = result.plan!.constraintOutcomes.find((o) => o.constraint.type === "dietary")!;
    expect(dietary.status).toBe("satisfied");
    expect(result.plan!.seatedAtMinutes).toBeLessThanOrEqual(-50);
  });
});

describe("evaluate: impossibility", () => {
  it("hard seated_by + a too-late arrival yields infeasible with violations and a bestAlternative", () => {
    const mutated: Constraint[] = familyRequest.constraints.map((c) => {
      if (c.type === "seated_by") return { ...c, priority: "hard" };
      if (c.type === "arrival") return { ...c, value: { ...c.value, normalizedClock: "19:45" } };
      return c;
    });
    const input: PlannerInput = { ...baselineInput(), request: { ...familyRequest, constraints: mutated } };
    const result = evaluate(input);
    expect(result.feasible).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.bestAlternative).toBeDefined();
  });
});

describe("evaluate: diff", () => {
  it("train-plus-18 with priorPlanId yields non-empty preserved and non-empty replaced-or-invalidated", () => {
    const baseline = evaluate(baselineInput());
    const result = evaluate(baselineInput(), {
      disruptions: ["train-plus-18"],
      priorPlanId: baseline.plan!.planId,
    });
    expect(result.diff).toBeDefined();
    expect(result.diff!.preservedStepIds.length).toBeGreaterThan(0);
    expect(result.diff!.invalidatedStepIds.length + result.diff!.replacedSteps.length).toBeGreaterThan(0);
  });
});

describe("evaluate: non-hard dietary coverage (rule 5, 'dietary satisfied when covered')", () => {
  it("medium vegetarian constraint reports satisfied when the winning stand set covers it", () => {
    const vegetarianConstraint: Constraint = {
      type: "dietary",
      value: { need: "vegetarian", severity: "preference" },
      priority: "medium",
      sourceText: "one kid prefers vegetarian",
    };
    const request: PlanRequest = {
      constraints: [...familyRequest.constraints, vegetarianConstraint],
      clarificationsNeeded: [],
      offTopic: false,
    };
    const result = evaluate({ ...baselineInput(), request });
    expect(result.feasible).toBe(true);
    const p = result.plan!;
    // The authored venue: stand-blueline and stand-harbour-fresh both carry a vegetarian
    // item, and the family winner's set is exactly {stand-blueline, stand-harbour-fresh}.
    expect(p.standIds).toEqual(expect.arrayContaining(["stand-blueline", "stand-harbour-fresh"]));
    const vegetarian = p.constraintOutcomes.find(
      (o) => o.constraint.type === "dietary" && o.constraint.value.need === "vegetarian",
    )!;
    expect(vegetarian.status).toBe("satisfied");
  });

  it("medium halal constraint reports traded when the winning stand set does not cover it", () => {
    const halalConstraint: Constraint = {
      type: "dietary",
      value: { need: "halal", severity: "preference" },
      priority: "medium",
      sourceText: "one adult prefers halal",
    };
    const request: PlanRequest = {
      constraints: [...familyRequest.constraints, halalConstraint],
      clarificationsNeeded: [],
      offTopic: false,
    };
    const result = evaluate({ ...baselineInput(), request });
    expect(result.feasible).toBe(true);
    const p = result.plan!;
    // Only stand-anchor-smoke (reachable from gate-5b) carries a halal item; the family
    // winner's set is drawn from gate-1's reachable stands and cannot include it.
    expect(p.standIds).not.toContain("stand-anchor-smoke");
    const halal = p.constraintOutcomes.find(
      (o) => o.constraint.type === "dietary" && o.constraint.value.need === "halal",
    )!;
    expect(halal.status).toBe("traded");
  });
});

describe("evaluate: Wave 1 demo-prompt trade-off gate (step 6)", () => {
  it("winner satisfies warmups and food_preference traded-or-satisfied; runner-up differs in gate or stand-set", () => {
    const result = evaluate(baselineInput());
    const p = result.plan!;
    const warmups = p.constraintOutcomes.find((o) => o.constraint.type === "seated_by")!;
    expect(warmups.status).toBe("satisfied");
    const food = p.constraintOutcomes.find((o) => o.constraint.type === "food_preference")!;
    expect(["traded", "satisfied"]).toContain(food.status);

    const runnerUp = result.runnerUp!;
    const differs = runnerUp.gateId !== p.gateId || JSON.stringify(runnerUp.standIds) !== JSON.stringify(p.standIds);
    expect(differs).toBe(true);
  });
});
