// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatTurn } from "@/lib/chat/turns";
import { PlanResult, TraceEvent } from "@/lib/planning/schemas";
import { AssistantTurn } from "./AssistantTurn";

// This project's vitest config does not set `test.globals: true`, so
// @testing-library/react's auto-cleanup (which checks for a global
// `afterEach`) never registers. Without this, DOM nodes from earlier
// renders in this file leak into later tests' document-scoped queries.
afterEach(cleanup);

function turn(events: TraceEvent[], over: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: 1,
    userText: "test",
    envelopes: events.map((event, seq) => ({ v: 1, requestId: "r1", seq, event })),
    streamText: "",
    status: "done",
    ...over,
  };
}

const feasibleResult: PlanResult = {
  feasible: true,
  violations: [],
  adjustments: [],
  candidateStats: { evaluated: 10, feasible: 4 },
};

describe("AssistantTurn", () => {
  it("renders the adjustment sentence and the plan-ready confirmation", () => {
    const t = turn([
      { type: "constraint_adjusted", field: "arrival", requested: "6:18", resolved: "18:15 (Lakeshore West)", reason: "No scheduled arrival at 18:18; nearest real GO arrival, GTFS snapshot 2026-07-07" },
      { type: "plan_result", result: feasibleResult },
      { type: "done" },
    ], { streamText: "A narrative sentence." });
    const { container } = render(<AssistantTurn turn={t} isLive={false} />);
    expect(container.textContent).toContain("You said 6:18");
    expect(container.textContent).toContain("Resolved to 18:15 (Lakeshore West)");
    expect(container.textContent).toContain("A narrative sentence.");
    expect(container.textContent).toContain("Tonight's plan is ready.");
  });

  it("renders a live clarification with interactive steppers, frozen without", () => {
    const t = turn([
      { type: "request_parsed", constraints: [], clarificationsNeeded: [{ field: "party", question: "How many adults and how many children are going?" }] },
      { type: "done" },
    ]);
    const live = render(<AssistantTurn turn={t} isLive onAnswer={() => {}} />);
    expect(live.container.textContent).toContain("How many adults");
    expect(live.queryByRole("button", { name: "Use this" })).not.toBeNull();
    live.unmount();

    const frozen = render(<AssistantTurn turn={t} isLive={false} onAnswer={() => {}} />);
    expect(frozen.container.textContent).toContain("How many adults");
    expect(frozen.queryByRole("button", { name: "Use this" })).toBeNull();
  });

  it("renders assumption lines with the assumed provenance chip", () => {
    const t = turn([
      { type: "assumption_made", field: "arrival", assumed: "you can take any scheduled train, so GameLoop picked Lakeshore West arriving 18:15", reason: "No arrival time was given. Tell us in a follow-up if you are arriving differently." },
      { type: "plan_result", result: feasibleResult },
      { type: "done" },
    ]);
    const { container } = render(<AssistantTurn turn={t} isLive={false} />);
    expect(container.textContent).toContain("assumed");
    expect(container.textContent).toContain("Lakeshore West arriving 18:15");
  });

  it("renders the terminal decision as the body when no plan landed", () => {
    const t = turn([
      { type: "decision", summary: "Reading your request." },
      { type: "decision", summary: "Demo mode runs without model calls, so free-text changes are disabled here. Use the quick chips, or run live to type a change." },
      { type: "done" },
    ]);
    const { container } = render(<AssistantTurn turn={t} isLive={false} />);
    expect(container.textContent).toContain("Demo mode runs without model calls");
  });
});
