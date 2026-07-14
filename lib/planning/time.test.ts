import { describe, expect, it } from "vitest";
import { clockToMinutesOfDay, mmssToSeconds, normalizedMinutesToClock, toNormalizedMinutes } from "./time";

describe("normalized minutes, puck drop = 0", () => {
  it("pins the authored evening", () => {
    expect(toNormalizedMinutes("19:30")).toBe(0); // puck drop
    expect(toNormalizedMinutes("18:40")).toBe(-50); // warmups
    expect(toNormalizedMinutes("17:45")).toBe(-105); // doors
    expect(toNormalizedMinutes("18:15")).toBe(-75); // LW arrival
    expect(toNormalizedMinutes("18:33")).toBe(-57); // +18 disruption
  });
  it("round-trips clocks without Date (TZ independent by construction)", () => {
    expect(normalizedMinutesToClock(-60)).toBe("18:30");
    expect(normalizedMinutesToClock(-42)).toBe("18:48");
    // formatting never passes through Date, so server TZ cannot shift it:
    expect(normalizedMinutesToClock(toNormalizedMinutes("18:15"))).toBe("18:15");
  });
  it("rejects times that need normalization by the model, like 6:18", () => {
    expect(() => clockToMinutesOfDay("6:18")).toThrow();
  });
  it("parses game clocks", () => {
    expect(mmssToSeconds("07:42") - mmssToSeconds("07:03")).toBe(39);
    expect(mmssToSeconds("18:18")).toBe(1098);
  });
});
