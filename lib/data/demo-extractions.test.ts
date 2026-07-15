import { describe, expect, it } from "vitest";
import { PlanRequestSchema } from "../planning/schemas";
import { demoConstraints } from "../planning/schemas.test";
import demoExtractions from "./demo-extractions.json";

const CHIP_IDS = ["family", "budget", "access"] as const;

describe("demo-extractions.json", () => {
  it.each(CHIP_IDS)("%s entry validates as a full pinned PlanRequest", (chipId) => {
    const entry = (demoExtractions as Record<string, unknown>)[chipId];
    const parsed = PlanRequestSchema.parse(entry);
    expect(parsed.clarificationsNeeded).toEqual([]);
    expect(parsed.offTopic).toBe(false);
    expect(parsed.constraints.length).toBeGreaterThan(0);
  });

  it("family entry byte-matches the locked demo contract from schemas.test.ts", () => {
    const parsed = PlanRequestSchema.parse((demoExtractions as Record<string, unknown>).family);
    expect(parsed.constraints).toEqual(demoConstraints);
    expect(JSON.stringify(parsed.constraints)).toBe(JSON.stringify(demoConstraints));
  });

  it("budget entry carries the exact chip wording", () => {
    const parsed = PlanRequestSchema.parse((demoExtractions as Record<string, unknown>).budget);
    expect(parsed.constraints).toHaveLength(3);
    const party = parsed.constraints.find((c) => c.type === "party");
    const budget = parsed.constraints.find((c) => c.type === "budget");
    const noise = parsed.constraints.find((c) => c.type === "noise");
    expect(party).toMatchObject({ priority: "hard", value: { adults: 2, children: 0 }, sourceText: "There are two of us" });
    expect(budget).toMatchObject({
      priority: "high",
      value: { maxTotalCad: 80 },
      sourceText: "keep the whole night under $80 including food",
    });
    expect(noise).toMatchObject({
      priority: "medium",
      value: { preference: "quieter-preferred" },
      sourceText: "we'd rather skip the loudest crowds at the main gate",
    });
  });

  it("access entry carries the exact chip wording", () => {
    const parsed = PlanRequestSchema.parse((demoExtractions as Record<string, unknown>).access);
    expect(parsed.constraints).toHaveLength(4);
    const accessibility = parsed.constraints.find((c) => c.type === "accessibility");
    const dietary = parsed.constraints.find((c) => c.type === "dietary");
    const seatedBy = parsed.constraints.find((c) => c.type === "seated_by");
    const party = parsed.constraints.find((c) => c.type === "party");
    expect(accessibility).toMatchObject({ priority: "hard", value: { need: "step-free" } });
    expect(dietary).toMatchObject({ priority: "hard", value: { need: "vegetarian", severity: "preference" } });
    expect(seatedBy).toMatchObject({ priority: "hard", value: { milestone: "puck_drop" } });
    expect(party).toMatchObject({ priority: "hard", value: { adults: 2, children: 0 } });
  });

  it("vague entry pins the clarification demo: three constraints plus a party question", () => {
    const parsed = PlanRequestSchema.parse((demoExtractions as Record<string, unknown>).vague);
    expect(parsed.clarificationsNeeded).toEqual([{ field: "party", question: "How many adults and how many children are going?" }]);
    expect(parsed.offTopic).toBe(false);
    expect(parsed.constraints).toHaveLength(3);
    expect(parsed.constraints.map((c) => c.type).sort()).toEqual(["arrival", "dietary", "seated_by"]);
    const arrival = parsed.constraints.find((c) => c.type === "arrival");
    expect(arrival).toMatchObject({ priority: "hard", value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" } });
  });
});
