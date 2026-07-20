import { describe, expect, it } from "vitest";
import { PlanResult, TraceEnvelope, TraceEvent } from "../planning/schemas";
import { composeAssistantTurn } from "./turns";

function envelopes(events: TraceEvent[]): TraceEnvelope[] {
  return events.map((event, seq) => ({ v: 1, requestId: "req-1", seq, event }));
}

const feasibleResult: PlanResult = {
  feasible: true,
  violations: [],
  adjustments: [],
  candidateStats: { evaluated: 10, feasible: 4 },
};

describe("composeAssistantTurn", () => {
  it("plan stream: adjustments and assumptions surface, log excludes chunks, no body", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "request_parsed", constraints: [], clarificationsNeeded: [] },
        { type: "constraint_adjusted", field: "arrival", requested: "6:18", resolved: "18:15 (Lakeshore West)", reason: "No scheduled arrival at 18:18; nearest real GO arrival, GTFS snapshot 2026-07-07" },
        { type: "candidates_summary", evaluated: 10, feasible: 4 },
        { type: "assumption_made", field: "food_timing", assumed: "food gets picked up on the way to your seats", reason: "No food timing preference was given. Tell us if you want it the other way." },
        { type: "decision", summary: "Selected Gate 3, arriving 18:15, food pickup en route." },
        { type: "plan_result", result: feasibleResult },
        { type: "response_chunk", text: "Here is the plan. " },
        { type: "response_chunk", text: "It works." },
        { type: "done" },
      ]),
    );
    expect(seg.planResult).toEqual(feasibleResult);
    expect(seg.adjustments).toHaveLength(1);
    expect(seg.adjustments[0]!.requested).toBe("6:18");
    expect(seg.assumptions).toHaveLength(1);
    expect(seg.body).toBeUndefined();
    expect(seg.clarification).toBeUndefined();
    expect(seg.redirect).toBeUndefined();
    expect(seg.logEnvelopes).toHaveLength(8);
    expect(seg.logEnvelopes.every((e) => e.event.type !== "response_chunk")).toBe(true);
  });

  it("clarification stream: the question surfaces as a bubble, not as body text", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "request_parsed", constraints: [], clarificationsNeeded: [{ field: "party", question: "How many adults and how many children are going?" }] },
        { type: "decision", summary: "Need one answer before planning: How many adults and how many children are going?" },
        { type: "done" },
      ]),
    );
    expect(seg.clarification).toEqual({ field: "party", question: "How many adults and how many children are going?" });
    expect(seg.body).toBeUndefined();
    expect(seg.planResult).toBeUndefined();
  });

  it("redirect stream: the honest redirect line is separated from the decisions", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "request_parsed", constraints: [], clarificationsNeeded: [] },
        { type: "decision", summary: "You asked about the Raptors. Tonight Harbourview Arena hosts hockey: Vegas Golden Knights versus Carolina Hurricanes, puck drop 19:30. Planning your night around it." },
        { type: "plan_result", result: feasibleResult },
        { type: "done" },
      ]),
    );
    expect(seg.redirect).toContain("You asked about the Raptors.");
    expect(seg.body).toBeUndefined();
  });

  it("terminal decision stream: the demo refusal becomes the turn body", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "decision", summary: "Demo mode runs without model calls, so free-text changes are disabled here. Use the quick chips, or run live to type a change." },
        { type: "done" },
      ]),
    );
    expect(seg.body).toContain("Demo mode runs without model calls");
    expect(seg.planResult).toBeUndefined();
  });

  it("error stream: the message surfaces and suppresses the body", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "error", message: "Could not read that request. Try rephrasing in a sentence or two." },
      ]),
    );
    expect(seg.errorMessage).toContain("Could not read that request");
    expect(seg.body).toBeUndefined();
  });

  it("refinement stream: follow-up adjustments ride along", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "request_parsed", constraints: [], clarificationsNeeded: [] },
        { type: "constraint_adjusted", field: "party", requested: "not set", resolved: "1 adult, 2 children", reason: "Added in your follow-up." },
        { type: "plan_result", result: feasibleResult },
        { type: "done" },
      ]),
    );
    expect(seg.adjustments[0]!.reason).toBe("Added in your follow-up.");
    expect(seg.clarification).toBeUndefined();
  });
});
