// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { COPY } from "@/lib/copy";
import { RealNearbyEntry } from "@/lib/data/realNearbySchema";
import { NearbyRealOptions } from "./NearbyRealOptions";

const wvrst: RealNearbyEntry = {
  id: "wvrst",
  name: "WVRST (Union Station)",
  rating: { value: 4.3, source: "Restaurant Guru", reviewNote: "1,606 reviews" },
  walkMinutes: 5,
  priceLevel: "$$",
  openWeekendEvenings: true,
  iconic: false,
  evidence: [{ need: "gluten-free", tier: "friendly", line: "Dedicated fryer for the fries; not a dedicated gluten-free kitchen." }],
  sourceUrl: "https://torontounion.ca/locations/wvrst/",
  accessedAt: "2026-07-20",
  source: "research-notes",
};

describe("NearbyRealOptions", () => {
  it("renders the research-notes label, SNAPSHOT badge, evidence line, tier word, and accessed date", () => {
    const { container } = render(<NearbyRealOptions entries={[wvrst]} needs={["gluten-free"]} />);
    expect(container.textContent).toContain(COPY.realNearbyHeading);
    expect(container.textContent).toContain(COPY.realNearbyLead);
    expect(container.textContent).toContain("SNAPSHOT");
    expect(container.textContent).toContain("WVRST (Union Station)");
    expect(container.textContent).toContain("Dedicated fryer");
    expect(container.textContent).toContain("FRIENDLY");
    expect(container.textContent).toContain("2026-07-20");
    expect(container.textContent).toContain("5 min walk");
  });

  it("nut-free renders the honest absence statement and no restaurant names", () => {
    const { container } = render(<NearbyRealOptions entries={[wvrst]} needs={["nut-free"]} />);
    expect(container.textContent).toContain(COPY.realNearbyAbsence("nut-free"));
    expect(container.textContent).not.toContain("WVRST");
  });

  it("an entry without a captured rating says so instead of inventing one", () => {
    const noRating: RealNearbyEntry = { ...wvrst, id: "x", name: "Fresh Kitchen", rating: undefined };
    const { container } = render(<NearbyRealOptions entries={[noRating]} needs={["gluten-free"]} />);
    expect(container.textContent).toContain("Rating not captured in this research pass.");
  });

  it("uses no dashed borders (dashed is exclusive to SIMULATED)", () => {
    const { container } = render(<NearbyRealOptions entries={[wvrst]} needs={[]} />);
    const dashed = container.querySelectorAll('[class*="border-dashed"]');
    // The SNAPSHOT SourceBadge is solid; only a SIMULATED badge would be dashed.
    expect(dashed.length).toBe(0);
  });
});
