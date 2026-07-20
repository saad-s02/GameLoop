import { describe, expect, it } from "vitest";
import { applyDisruptions, PlannerInput } from "./disruptions";
import { evaluate } from "./evaluate";
import { loadTransit, loadVenue } from "../data/load";
import { loadShowcaseGame } from "../data/showcaseGame";
import { PlanRequest } from "./schemas";

const game = loadShowcaseGame("2025030413");

function baseInput(request: PlanRequest): PlannerInput {
  return {
    venue: loadVenue(),
    transitOptions: loadTransit(),
    request,
    game: {
      gameId: game.gameId,
      doorsOpenAt: game.doorsOpenAt,
      warmupStartAt: game.warmupStartAt,
      puckDropAt: game.puckDropAt,
    },
    transitDelayMinutes: 0,
  };
}

const trainAt618: PlanRequest = {
  constraints: [
    {
      type: "arrival",
      value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" },
      priority: "hard",
      sourceText: "train at 6:18",
    },
    {
      type: "party",
      value: { adults: 1, children: 2 },
      priority: "hard",
      sourceText: "me and two kids",
    },
  ],
  clarificationsNeeded: [],
  offTopic: false,
};

describe("july25-weekend-service", () => {
  it("removes non-West-Harbour Lakeshore West trips, keeps all Lakeshore East trips, and never mutates its input", () => {
    const input = baseInput(trainAt618);
    const next = applyDisruptions(input, ["july25-weekend-service"]);

    const lw = next.transitOptions.filter((o) => o.routeId.endsWith("-LW"));
    expect(lw.map((o) => o.scheduledArrival)).toEqual(["17:45:00", "18:45:00"]);
    expect(lw.every((o) => o.origin.includes("West Harbour"))).toBe(true);

    const le = next.transitOptions.filter((o) => o.routeId.endsWith("-LE"));
    expect(le.length).toBe(5);

    expect(input.transitOptions.length).toBe(10);
    expect(next.venue).toEqual(input.venue);
    expect(next.request).toEqual(input.request);
  });

  it("re-snaps an 18:18 train arrival from the 18:15 Lakeshore West to the 18:12 Lakeshore East", () => {
    const base = evaluate(baseInput(trainAt618));
    expect(base.feasible).toBe(true);
    expect(base.plan?.transitArrival).toBe("18:15");
    expect(base.plan?.transitRouteId).toBe("06260926-LW");

    const disrupted = evaluate(baseInput(trainAt618), { disruptions: ["july25-weekend-service"] });
    expect(disrupted.feasible).toBe(true);
    expect(disrupted.plan?.transitArrival).toBe("18:12");
    expect(disrupted.plan?.transitRouteId).toBe("06260926-LE");
  });

  it("reports the transit step as replaced when replanning from the undisrupted prior plan", () => {
    const base = evaluate(baseInput(trainAt618));
    const disrupted = evaluate(baseInput(trainAt618), {
      disruptions: ["july25-weekend-service"],
      priorPlanId: base.plan!.planId,
    });
    expect(
      disrupted.diff?.replacedSteps.some(
        (r) => r.oldStepId.startsWith("transit:") && r.newStepId.startsWith("transit:"),
      ),
    ).toBe(true);
  });

  it("stacks with train-plus-18: the 18:12 Lakeshore East arrival lands at 18:30", () => {
    const both = evaluate(baseInput(trainAt618), {
      disruptions: ["july25-weekend-service", "train-plus-18"],
    });
    expect(both.feasible).toBe(true);
    const transitStep = both.plan?.steps.find((s) => s.kind === "transit");
    expect(transitStep?.clock).toBe("18:30");
  });
});
