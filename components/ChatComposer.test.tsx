// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY } from "@/lib/copy";
import { ChatComposer, QUICK_CHIPS, SUGGESTED_PROMPTS } from "./ChatComposer";

const noop = () => {};

// This project's vitest config does not set `test.globals: true`, so
// @testing-library/react's auto-cleanup (which checks for a global
// `afterEach`) never registers. Without this, DOM nodes from earlier
// renders in this file leak into later tests' document-scoped queries.
afterEach(cleanup);

describe("ChatComposer", () => {
  it("before a plan: renders the four suggested prompts and submits one immediately", () => {
    const onPrompt = vi.fn();
    const { getByRole } = render(
      <ChatComposer demo disabled={false} hasPlanContext={false} onSuggestedPrompt={onPrompt} onQuickChip={noop} onSubmitText={noop} />,
    );
    expect(SUGGESTED_PROMPTS).toHaveLength(4);
    fireEvent.click(getByRole("button", { name: "Family + gluten-free" }));
    expect(onPrompt).toHaveBeenCalledWith(SUGGESTED_PROMPTS[0]);
  });

  it("demo mode: textarea disabled with the honest copy, no send button", () => {
    const { container, queryByRole } = render(
      <ChatComposer demo disabled={false} hasPlanContext={false} onSuggestedPrompt={noop} onQuickChip={noop} onSubmitText={noop} />,
    );
    const textarea = container.querySelector("textarea")!;
    expect(textarea.disabled).toBe(true);
    expect(container.textContent).toContain(COPY.followUpDemoNote);
    expect(queryByRole("button", { name: "Plan my night" })).toBeNull();
  });

  it("after a plan: quick chips replace the prompts and fire onQuickChip", () => {
    const onChip = vi.fn();
    const { getByRole, queryByRole } = render(
      <ChatComposer demo disabled={false} hasPlanContext onSuggestedPrompt={noop} onQuickChip={onChip} onSubmitText={noop} />,
    );
    expect(queryByRole("button", { name: "Family + gluten-free" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Arriving at 6:00 instead" }));
    expect(onChip).toHaveBeenCalledWith(QUICK_CHIPS[0]);
  });

  it("live mode: typed text submits via Enter and clears the draft", () => {
    const onText = vi.fn();
    const { container } = render(
      <ChatComposer demo={false} disabled={false} hasPlanContext={false} onSuggestedPrompt={noop} onQuickChip={noop} onSubmitText={onText} />,
    );
    const textarea = container.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "two of us, budget night" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onText).toHaveBeenCalledWith("two of us, budget night");
    expect(textarea.value).toBe("");
  });

  it("disabled while streaming: prompts and chips are inert", () => {
    const onPrompt = vi.fn();
    const { getByRole } = render(
      <ChatComposer demo disabled hasPlanContext={false} onSuggestedPrompt={onPrompt} onQuickChip={noop} onSubmitText={noop} />,
    );
    fireEvent.click(getByRole("button", { name: "Family + gluten-free" }));
    expect(onPrompt).not.toHaveBeenCalled();
  });
});
