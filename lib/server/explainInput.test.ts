import { describe, expect, it } from "vitest";
import { loadTransit, loadVenue } from "../data/load";
import { evaluate } from "../planning/evaluate";
import { PlannerInput } from "../planning/disruptions";
import { demoConstraints } from "../planning/schemas.test";
import { ExplainInputSchema, PlanRequest, PlanResult } from "../planning/schemas";
import { buildExplainInput } from "./explainInput";

const familyRequest: PlanRequest = { constraints: [...demoConstraints], clarificationsNeeded: [], offTopic: false };

function baselineInput(): PlannerInput {
  return {
    venue: loadVenue(),
    transitOptions: loadTransit(),
    request: familyRequest,
    game: { gameId: "2025030413", doorsOpenAt: "17:45", warmupStartAt: "18:40", puckDropAt: "19:30" },
    transitDelayMinutes: 0,
  };
}

describe("buildExplainInput", () => {
  it("maps a feasible PlanResult to a strict, schema-conformant ExplainInput", () => {
    const result = evaluate(baselineInput());
    expect(result.feasible).toBe(true);
    const explainInput = buildExplainInput(result);
    expect(() => ExplainInputSchema.parse(explainInput)).not.toThrow();
    expect(explainInput.selected.gateName).toBe("Gate 1 (Main)"); // pinned: winner uses gate-1 (evaluate.test.ts)
    expect(explainInput.selected.standNames).toContain("Harbour Fresh Market"); // pinned: winner includes stand-harbour-fresh
    expect(explainInput.selected.seatSection).toBe(result.plan!.seatSection);
    expect(explainInput.selected.walkingMinutes).toBe(result.plan!.walkingMinutes);
    expect(explainInput.adjustments).toEqual(result.adjustments);
  });

  it("computes runnerUpDeltas as full sentences carrying the real numeric deltas", () => {
    const result = evaluate(baselineInput());
    expect(result.runnerUp).toBeDefined();
    const explainInput = buildExplainInput(result);
    expect(explainInput.runnerUp).toBeDefined();

    const walkDelta = result.runnerUp!.walkingMinutes - result.plan!.walkingMinutes;
    const waitDelta = result.runnerUp!.waitMinutes - result.plan!.waitMinutes;
    const costDelta = result.runnerUp!.estimatedCostCad - result.plan!.estimatedCostCad;

    expect(explainInput.runnerUpDeltas).toHaveLength(3);
    for (const sentence of explainInput.runnerUpDeltas) {
      expect(typeof sentence).toBe("string");
      expect(sentence.length).toBeGreaterThan(0);
    }
    // The real numbers appear verbatim in the sentences (not paraphrased away).
    expect(explainInput.runnerUpDeltas[0]).toContain(String(Math.abs(walkDelta)));
    expect(explainInput.runnerUpDeltas[1]).toContain(String(Math.abs(waitDelta)));
    expect(explainInput.runnerUpDeltas[2]).toContain(String(Math.abs(costDelta)));
  });

  it("omits runnerUp and runnerUpDeltas is empty when there is no runner-up", () => {
    const result = evaluate(baselineInput());
    const solo: PlanResult = { ...result, runnerUp: undefined };
    const explainInput = buildExplainInput(solo);
    expect(explainInput.runnerUp).toBeUndefined();
    expect(explainInput.runnerUpDeltas).toEqual([]);
  });

  it("throws for an infeasible PlanResult (no selected plan to explain)", () => {
    const infeasible: PlanResult = {
      feasible: false,
      violations: ["dietary: required need(s) not covered"],
      adjustments: [],
      candidateStats: { evaluated: 0, feasible: 0 },
    };
    expect(() => buildExplainInput(infeasible)).toThrow();
  });

  it("never leaks game/boxScore data: ExplainInputSchema is strict and rejects unknown keys", () => {
    const result = evaluate(baselineInput());
    const explainInput = buildExplainInput(result);
    const polluted = { ...explainInput, playByPlay: [{ eventId: 1 }] };
    expect(ExplainInputSchema.safeParse(polluted).success).toBe(false);
  });
});
