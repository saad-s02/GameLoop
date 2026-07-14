import { describe, expect, it } from "vitest";
import { waitAt } from "./venueGraph";
const profile = [
  { fromClock: "18:00", toClock: "18:30", waitMinutes: 6 },
  { fromClock: "18:30", toClock: "19:00", waitMinutes: 10 },
];
describe("waitAt band lookup", () => {
  it("selects by normalized minutes, inclusive start, exclusive end", () => {
    expect(waitAt(profile, -67)).toBe(6);    // 18:23
    expect(waitAt(profile, -60)).toBe(10);   // 18:30 boundary belongs to the later band
  });
  it("clamps outside the profile", () => {
    expect(waitAt(profile, -120)).toBe(6);
    expect(waitAt(profile, 30)).toBe(10);
  });
});
