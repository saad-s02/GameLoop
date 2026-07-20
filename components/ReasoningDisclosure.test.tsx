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
  it("opens while streaming and auto-folds to the signals summary when done", () => {
    const { container, rerender } = render(
      <ReasoningDisclosure envelopes={envelopes} status="streaming" />,
    );
    expect(details(container).open).toBe(true);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
    expect(container.textContent).toContain(COPY.decisionLogSummary(1));
  });

  it("a manual toggle wins over the auto-fold until the next fresh stream", () => {
    const { container, rerender } = render(
      <ReasoningDisclosure envelopes={envelopes} status="streaming" />,
    );
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    fireEvent.click(container.querySelector("summary")!);
    expect(details(container).open).toBe(true);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(true);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="streaming" />);
    expect(details(container).open).toBe(true);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
  });

  it("mounts collapsed for an already-completed turn", () => {
    const { container } = render(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
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
