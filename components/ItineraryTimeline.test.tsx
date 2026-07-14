// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItineraryTimeline } from "./ItineraryTimeline";
import { ItineraryPlan, ItineraryStep, Venue } from "@/lib/planning/schemas";

// minimal schema-conformant fixtures: three steps (snapshot transit, simulated
// food at a gluten-free-flagged stand, simulated seat)
const fixtureVenue: Venue = {
  venueId: "harbourview-arena",
  name: "Harbourview Arena",
  source: "simulated",
  gates: [
    {
      id: "gate-1",
      name: "Gate 1 (Main)",
      accessible: false,
      crowdLevel: "high",
      waitProfile: [{ fromClock: "17:30", toClock: "18:00", waitMinutes: 4 }],
      source: "simulated",
    },
  ],
  stands: [
    {
      id: "stand-harbour-fresh",
      name: "Harbour Fresh Market",
      accessible: true,
      menu: [{ name: "Gluten-free chicken bowl", priceCad: 16, dietaryFlags: ["gluten-free"] }],
      waitProfile: [{ fromClock: "17:30", toClock: "18:00", waitMinutes: 4 }],
      source: "simulated",
    },
  ],
  sections: [
    {
      id: "section-101",
      name: "101",
      viewZone: "centre-ice",
      accessible: false,
      nearestGateId: "gate-1",
      source: "simulated",
    },
  ],
  walkingGraph: [{ from: "gate-1", to: "section-101", minutes: 1 }],
};

const fixturePlan: ItineraryPlan = {
  planId: "plan-test1",
  candidateId: "gate-1|stand-harbour-fresh|18:15|pickup-after-seating",
  gateId: "gate-1",
  standIds: ["stand-harbour-fresh"],
  transitRouteId: "lakeshore-west",
  transitArrival: "18:15:00",
  arrivalStrategy: "pickup-after-seating",
  seatSection: "section-101",
  viewZone: "centre-ice",
  seatedAtMinutes: -60,
  walkingMinutes: 9,
  waitMinutes: 10,
  estimatedCostCad: 16,
  score: 1000,
  steps: [
    {
      stepId: "transit:lakeshore-west:18:15",
      kind: "transit",
      startMinutes: -75,
      clock: "18:15",
      title: "GO Lakeshore West arrives",
      detail: "Union Station",
      source: "snapshot",
    },
    {
      stepId: "food:stand-harbour-fresh",
      kind: "food",
      startMinutes: -50,
      clock: "18:40",
      title: "Harbour Fresh Market",
      detail: "Grab a bite before puck drop",
      source: "simulated",
    },
    {
      stepId: "seat:section-101",
      kind: "seat",
      startMinutes: -60,
      clock: "18:30",
      title: "Seated, Section 101",
      detail: "Centre-ice view",
      source: "simulated",
    },
  ],
  constraintOutcomes: [
    {
      constraint: {
        type: "dietary",
        value: { need: "gluten-free", severity: "intolerance" },
        priority: "hard",
        sourceText: "One child needs gluten-free food.",
      },
      status: "satisfied",
    },
  ],
};

describe("ItineraryTimeline", () => {
  it("renders a semantic ordered list with per-step provenance badges and verbatim clocks", () => {
    const { container } = render(<ItineraryTimeline plan={fixturePlan} venue={fixtureVenue} />);
    const ol = container.querySelector("ol")!;
    expect(ol).not.toBeNull();
    expect(ol.querySelectorAll("li").length).toBe(3);
    expect(container.textContent).toContain("18:15");
    expect(container.textContent).toContain("SNAPSHOT");
    expect(container.textContent).toContain("SIMULATED");
  });

  it("renders the dietary cross-contact disclaimer under a food step whose stand covers a dietary need", () => {
    const { container } = render(<ItineraryTimeline plan={fixturePlan} venue={fixtureVenue} />);
    expect(container.textContent).toContain("Cross-contact information is unavailable");
  });

  it("renders an invalidated step's old title struck through, not the raw stepId", () => {
    const priorSteps: ItineraryStep[] = [
      {
        stepId: "gate:gate-1",
        kind: "gate",
        startMinutes: -90,
        clock: "17:45",
        title: "Enter through Gate 1",
        detail: "Main gate",
        source: "simulated",
      },
    ];
    const { container } = render(
      <ItineraryTimeline
        plan={fixturePlan}
        venue={fixtureVenue}
        priorSteps={priorSteps}
        diff={{
          preservedStepIds: [],
          invalidatedStepIds: ["gate:gate-1"],
          replacedSteps: [],
        }}
      />,
    );
    expect(container.textContent).toContain("Enter through Gate 1");
    expect(container.textContent).not.toContain("gate:gate-1");
    const struck = container.querySelector(".line-through");
    expect(struck).not.toBeNull();
    expect(struck!.textContent).toBe("Enter through Gate 1");
  });
});
