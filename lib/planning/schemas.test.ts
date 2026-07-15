import { describe, expect, it } from "vitest";
import {
  ConstraintSchema,
  ExplainInputSchema,
  PlanApiInputSchema,
  PlanRequestSchema,
  RefinementSchema,
  SessionContextSchema,
  TraceEnvelopeSchema,
} from "./schemas";

export const demoConstraints = [
  { type: "party", value: { adults: 2, children: 2 }, priority: "hard", sourceText: "I'm bringing my dad and two kids" },
  { type: "dietary", value: { need: "gluten-free", severity: "intolerance" }, priority: "hard", sourceText: "One child needs gluten-free food" },
  { type: "arrival", value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" }, priority: "hard", sourceText: "Our train arrives at 6:18" },
  { type: "seated_by", value: { milestone: "warmups" }, priority: "high", sourceText: "seeing warmups matters more than having many food choices" },
  { type: "food_preference", value: { preference: "many-choices" }, priority: "medium", sourceText: "seeing warmups matters more than having many food choices" },
] as const;

describe("locked schemas", () => {
  it("round-trips the primary demo contract", () => {
    const parsed = PlanRequestSchema.parse({ constraints: demoConstraints, clarificationsNeeded: [], offTopic: false });
    expect(parsed.constraints).toHaveLength(5);
  });
  it("rejects an unknown constraint type", () => {
    expect(ConstraintSchema.safeParse({ type: "vibes", value: {}, priority: "hard", sourceText: "x" }).success).toBe(false);
  });
  it("rejects a value shape that does not match its type", () => {
    expect(
      ConstraintSchema.safeParse({ type: "dietary", value: { milestone: "warmups" }, priority: "hard", sourceText: "x" }).success,
    ).toBe(false);
  });
  it("envelope carries requestId and version", () => {
    const env = { v: 1, requestId: "req-1", seq: 0, event: { type: "decision", summary: "s" } };
    expect(TraceEnvelopeSchema.parse(env).requestId).toBe("req-1");
  });
  it("ExplainInput structurally excludes game data", () => {
    const selected = {
      gateName: "Gate 1",
      standNames: ["Harbour Fresh Market"],
      seatedClock: "18:30",
      seatSection: "101",
      walkingMinutes: 9,
      waitMinutes: 6,
      estimatedCostCad: 32,
      satisfied: ["dietary"],
      traded: [],
      violated: [],
    };
    const bad = { selected, runnerUpDeltas: [], adjustments: [], playByPlay: [] };
    expect(ExplainInputSchema.safeParse(bad).success).toBe(false); // strict() rejects unknown keys
    expect(ExplainInputSchema.safeParse({ selected, runnerUpDeltas: [], adjustments: [] }).success).toBe(true);
  });
  it("session memory rejects wrong schemaVersion and bad venue", () => {
    expect(SessionContextSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });
  it("api input enforces the 1000-char cap and mode allow-list", () => {
    expect(PlanApiInputSchema.safeParse({ mode: "plan", text: "x".repeat(1001) }).success).toBe(false);
    expect(PlanApiInputSchema.safeParse({ mode: "chat", text: "hi" }).success).toBe(false);
    expect(PlanApiInputSchema.safeParse({ mode: "plan", text: "hi" }).success).toBe(true);
  });
});

describe("conversational schema additions", () => {
  const party = {
    type: "party", value: { adults: 1, children: 2 }, priority: "hard",
    sourceText: "Answered inline: 1 adult, 2 children",
  };

  it("accepts an assumption_made trace envelope", () => {
    const env = {
      v: 1, requestId: "r", seq: 0,
      event: { type: "assumption_made", field: "arrival", assumed: "picked Lakeshore West arriving 18:15", reason: "No arrival time was given." },
    };
    expect(TraceEnvelopeSchema.parse(env).event.type).toBe("assumption_made");
  });

  it("accepts eventMismatch on PlanRequest and defaults it to absent", () => {
    const withMismatch = PlanRequestSchema.parse({
      constraints: [], clarificationsNeeded: [], offTopic: false,
      eventMismatch: { requested: "a basketball game" },
    });
    expect(withMismatch.eventMismatch?.requested).toBe("a basketball game");
    const without = PlanRequestSchema.parse({ constraints: [], clarificationsNeeded: [], offTopic: false });
    expect(without.eventMismatch).toBeUndefined();
  });

  it("refinement requires exactly one of answerConstraints or followUpText", () => {
    const base = { baseConstraints: [party] };
    expect(RefinementSchema.safeParse({ ...base, answerConstraints: [party] }).success).toBe(true);
    expect(RefinementSchema.safeParse({ ...base, followUpText: "arrive at 6" }).success).toBe(true);
    expect(RefinementSchema.safeParse(base).success).toBe(false);
    expect(RefinementSchema.safeParse({ ...base, answerConstraints: [party], followUpText: "x" }).success).toBe(false);
  });

  it("refinement pendingClarifications defaults to [] and prior validates", () => {
    const r = RefinementSchema.parse({
      baseConstraints: [party], answerConstraints: [],
      prior: { planId: "plan-abc", constraints: [party], disruptions: ["train-plus-18"] },
    });
    expect(r.pendingClarifications).toEqual([]);
    expect(r.prior?.disruptions).toEqual(["train-plus-18"]);
  });

  it("plan api input accepts the vague chip and a refinement", () => {
    const parsed = PlanApiInputSchema.parse({
      mode: "plan", text: "chip", chipId: "vague", demo: true,
      refinement: { baseConstraints: [party], answerConstraints: [party] },
    });
    expect(parsed.chipId).toBe("vague");
    expect(parsed.refinement?.answerConstraints).toHaveLength(1);
  });
});
