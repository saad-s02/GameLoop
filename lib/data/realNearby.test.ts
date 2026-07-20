import { describe, expect, it } from "vitest";
import { loadRealNearby } from "./realNearby";
import { UNVERIFIABLE_NEEDS } from "./realNearbySchema";

describe("real-nearby fixture", () => {
  const entries = loadRealNearby();

  it("parses through the schema with nine weekend-evening-open entries", () => {
    expect(entries.length).toBe(9);
    expect(entries.every((e) => e.openWeekendEvenings)).toBe(true);
  });

  it("never claims evidence for a need the research could not verify anywhere", () => {
    for (const e of entries) {
      for (const ev of e.evidence) {
        expect(UNVERIFIABLE_NEEDS).not.toContain(ev.need);
      }
    }
  });

  it("dates every entry to the research access date with a source url", () => {
    for (const e of entries) {
      expect(e.accessedAt).toBe("2026-07-20");
      expect(e.sourceUrl.startsWith("https://")).toBe(true);
      expect(e.source).toBe("research-notes");
    }
  });

  it("covers gluten-free, halal, and vegetarian with at least two evidence-bearing entries each", () => {
    const withNeed = (need: string) =>
      entries.filter((e) => e.evidence.some((ev) => ev.need === need)).length;
    expect(withNeed("gluten-free")).toBeGreaterThanOrEqual(2);
    expect(withNeed("halal")).toBeGreaterThanOrEqual(2);
    expect(withNeed("vegetarian")).toBeGreaterThanOrEqual(2);
  });

  it("only certified tier entries name a certifier in their line", () => {
    const certified = entries.flatMap((e) => e.evidence.filter((ev) => ev.tier === "certified"));
    expect(certified.length).toBeGreaterThanOrEqual(1);
    for (const ev of certified) {
      expect(ev.line).toMatch(/Halal Monitoring Authority|HMA/);
    }
  });

  it("has exactly three iconic quick picks", () => {
    expect(entries.filter((e) => e.iconic).map((e) => e.id).sort()).toEqual([
      "blondies-pizza",
      "real-sports",
      "steam-whistle",
    ]);
  });

  it("never names the real city or venue in any renderable text field", () => {
    // The card renders name, reviewNote, and evidence lines. Station names
    // inside restaurant names are permitted by the spec's hybrid stance;
    // the city and the real arena are not. sourceUrl is excluded: it is an
    // href attribute, never visible text.
    for (const e of entries) {
      const visible = [e.name, e.rating?.reviewNote ?? "", ...e.evidence.map((ev) => ev.line)].join(" ");
      expect(visible).not.toMatch(/Toronto|Scotiabank/i);
    }
  });
});
