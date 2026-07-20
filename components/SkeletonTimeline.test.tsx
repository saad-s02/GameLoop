// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonTimeline } from "./SkeletonTimeline";
import { COPY } from "@/lib/copy";

describe("SkeletonTimeline", () => {
  it("renders the building heading as real, announced content", () => {
    const { container } = render(<SkeletonTimeline />);
    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe(COPY.planBuildingHeading);
  });

  it("renders exactly 3 decorative placeholder rows hidden from assistive tech", () => {
    const { container } = render(<SkeletonTimeline />);
    const list = container.querySelector("ol.itinerary-list");
    expect(list).not.toBeNull();
    expect(list!.getAttribute("aria-hidden")).toBe("true");
    expect(list!.querySelectorAll("li").length).toBe(3);
  });

  it("shares the ice-sheet geometry class so the swap to the real hero doesn't jump", () => {
    const { container } = render(<SkeletonTimeline />);
    expect(container.querySelector(".ice-sheet-surfaced")).not.toBeNull();
  });
});
