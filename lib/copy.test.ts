import { describe, expect, it } from "vitest";
import { COPY } from "./copy";

describe("COPY.decisionLogSummary", () => {
  it("names the collapsed decision log's summary chip, singular signal count", () => {
    expect(COPY.decisionLogSummary(1)).toBe("Plan built from 1 signal · View reasoning");
  });

  it("names the collapsed decision log's summary chip, plural signal count", () => {
    expect(COPY.decisionLogSummary(12)).toBe("Plan built from 12 signals · View reasoning");
  });

  it("handles a zero count without breaking the sentence", () => {
    expect(COPY.decisionLogSummary(0)).toBe("Plan built from 0 signals · View reasoning");
  });
});
