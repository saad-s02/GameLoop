import { describe, expect, it } from "vitest";
import {
  ConstraintSchema,
  ExplainInputSchema,
  PlanApiInputSchema,
  PlanRequestSchema,
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
