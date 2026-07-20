// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceEnvelope } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";
import { ReasoningDisclosure } from "./ReasoningDisclosure";

const envelopes: TraceEnvelope[] = [
  { v: 1, requestId: "r1", seq: 0, event: { type: "decision", summary: "Reading your request." } },
];

function details(container: HTMLElement): HTMLDetailsElement {
  return container.querySelector("details.log-details") as HTMLDetailsElement;
}

describe("ReasoningDisclosure collapse contract", () => {
  it("stays folded while streaming so the narrative stays in view, then flags an invite when the trace completes", () => {
    const { container, rerender } = render(
      <ReasoningDisclosure envelopes={envelopes} status="streaming" />,
    );
    // Folded during the stream: the log must not shove the streaming
    // narrative off screen, and it carries no invite while still building.
    expect(details(container).open).toBe(false);
    expect(details(container).classList.contains("log-invite")).toBe(false);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    // Still folded, but now flagged so the reader knows the finished
    // reasoning is there to open.
    expect(details(container).open).toBe(false);
    expect(details(container).classList.contains("log-invite")).toBe(true);
    expect(container.textContent).toContain(COPY.decisionLogSummary(1));
  });

  it("a manual toggle opens the folded log, clears the invite, and wins until the next fresh stream", () => {
    const { container, rerender } = render(
      <ReasoningDisclosure envelopes={envelopes} status="streaming" />,
    );
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
    expect(details(container).classList.contains("log-invite")).toBe(true);
    fireEvent.click(container.querySelector("summary")!);
    expect(details(container).open).toBe(true);
    // Opening it answers the invite, so the flag clears.
    expect(details(container).classList.contains("log-invite")).toBe(false);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(true);
    // A fresh stream resets the cycle: folded again, invite cleared.
    rerender(<ReasoningDisclosure envelopes={envelopes} status="streaming" />);
    expect(details(container).open).toBe(false);
    expect(details(container).classList.contains("log-invite")).toBe(false);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
    expect(details(container).classList.contains("log-invite")).toBe(true);
  });

  it("mounts folded with no invite for an already-completed turn", () => {
    const { container } = render(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
    // Mounted already done (a frozen past turn), not a live completion, so
    // it must not flag an invite.
    expect(details(container).classList.contains("log-invite")).toBe(false);
  });

  it("shows Retry only for stalled or error states", () => {
    const { queryByRole, rerender } = render(
      <ReasoningDisclosure envelopes={envelopes} status="streaming" onRetry={() => {}} />,
    );
    expect(queryByRole("button", { name: "Retry" })).toBeNull();
    rerender(<ReasoningDisclosure envelopes={envelopes} status="stalled" onRetry={() => {}} />);
    expect(queryByRole("button", { name: "Retry" })).not.toBeNull();
    rerender(<ReasoningDisclosure envelopes={envelopes} status="error" onRetry={() => {}} />);
    expect(queryByRole("button", { name: "Retry" })).not.toBeNull();
  });
});
