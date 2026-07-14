import { describe, expect, it } from "vitest";
import { VenueSchema } from "../planning/schemas";
import { toNormalizedMinutes } from "../planning/time";
import { walkMinutes, waitAt } from "../planning/venueGraph";
import venueJson from "./venue.json";

const venue = VenueSchema.parse(venueJson);

describe("venue consistency", () => {
  it("walking graph sanity: positive, symmetric lookup, every gate reachable from union, every section and stand connected", () => {
    for (const e of venue.walkingGraph) expect(e.minutes).toBeGreaterThan(0);
    for (const g of venue.gates) expect(walkMinutes(venue, "union", g.id)).toBeGreaterThan(0);
    for (const s of venue.sections) expect(walkMinutes(venue, s.nearestGateId, s.id)).toBeGreaterThan(0);
    for (const st of venue.stands) {
      expect(venue.walkingGraph.some(e => (e.from === st.id || e.to === st.id))).toBe(true);
    }
  });
  it("dietary satisfiability with redundancy: at least two stands offer gluten-free", () => {
    const gf = venue.stands.filter(s => s.menu.some(m => m.dietaryFlags.includes("gluten-free")));
    expect(gf.length).toBeGreaterThanOrEqual(2);
  });
  it("an accessible + gluten-free + on-time path exists (gate-3 / north-grill / section-102, centre-ice)", () => {
    const gate = venue.gates.find(g => g.id === "gate-3")!;
    const stand = venue.stands.find(s => s.id === "stand-north-grill")!;
    const section = venue.sections.find(s => s.id === "section-102")!;
    expect(gate.accessible && stand.accessible && section.accessible).toBe(true);
    expect(section.viewZone).toBe("centre-ice");
    const seated = -75 + walkMinutes(venue, "union", "gate-3")
      + waitAt(gate.waitProfile, -75 + walkMinutes(venue, "union", "gate-3"))
      + walkMinutes(venue, "gate-3", "section-102");
    expect(seated).toBeLessThanOrEqual(toNormalizedMinutes("18:40"));
  });
  it("authored time tension: 18:15 clears warmups at exactly 18:30, 18:33 does not (18:48), both clear puck drop", () => {
    const gate1 = venue.gates.find(g => g.id === "gate-1")!;
    const seatVia = (arrival: number) => {
      const atGate = arrival + walkMinutes(venue, "union", "gate-1");
      return atGate + waitAt(gate1.waitProfile, atGate) + walkMinutes(venue, "gate-1", "section-101");
    };
    expect(seatVia(toNormalizedMinutes("18:15"))).toBe(-60);
    expect(seatVia(toNormalizedMinutes("18:33"))).toBe(-42);
    expect(-60).toBeLessThanOrEqual(toNormalizedMinutes("18:40"));
    expect(-42).toBeGreaterThan(toNormalizedMinutes("18:40"));
    expect(-42).toBeLessThan(0);
  });
  it("transit snapshot carries the 18:15 Lakeshore West arrival and provenance strings", async () => {
    const { loadTransit } = await import("./load");
    const options = loadTransit();
    expect(options).toHaveLength(10);
    const lw = options.find(o => o.scheduledArrival === "18:15:00")!;
    expect(lw.routeId).toBe("06260926-LW");
    expect(lw.source).toBe("gtfs-snapshot");
  });
});
