// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConstraintsStrip } from "./ConstraintsStrip";
import { ConstraintOutcome } from "@/lib/planning/schemas";

const outcomes: ConstraintOutcome[] = [
  {
    constraint: {
      type: "dietary",
      value: { need: "gluten-free", severity: "intolerance" },
      priority: "hard",
      sourceText: "One child needs gluten-free food.",
    },
    status: "satisfied",
  },
  {
    constraint: {
      type: "seated_by",
      value: { milestone: "warmups" },
      priority: "high",
      sourceText: "seeing warmups matters",
    },
    status: "traded",
  },
  {
    constraint: {
      type: "budget",
      value: { maxTotalCad: 80 },
      priority: "medium",
      sourceText: "keep the whole night under $80",
    },
    status: "violated",
  },
];

describe("ConstraintsStrip", () => {
  it("renders one chip per constraint outcome with type, value summary, and status as visible text (not color alone)", () => {
    const { container } = render(<ConstraintsStrip outcomes={outcomes} />);
    const chips = container.querySelectorAll("li");
    expect(chips.length).toBe(3);

    expect(container.textContent).toContain("Dietary:");
    expect(container.textContent).toContain("gluten-free");
    expect(container.textContent).toContain("satisfied");

    expect(container.textContent).toContain("Seated by:");
    expect(container.textContent).toContain("traded");

    expect(container.textContent).toContain("Budget:");
    expect(container.textContent).toContain("violated");
  });

  it("strikes through the value summary for a violated constraint", () => {
    const { container } = render(<ConstraintsStrip outcomes={outcomes} />);
    const struck = container.querySelector(".line-through");
    expect(struck).not.toBeNull();
    expect(struck!.textContent).toContain("80");
  });

  it("renders nothing when there are no constraint outcomes", () => {
    const { container } = render(<ConstraintsStrip outcomes={[]} />);
    expect(container.querySelector("section")).toBeNull();
  });
});
