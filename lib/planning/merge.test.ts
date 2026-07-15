import { describe, expect, it } from "vitest";
import { Constraint } from "./schemas";
import { mergeConstraints, summarizeConstraintValue } from "./merge";

const arrival618: Constraint = { type: "arrival", value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" }, priority: "hard", sourceText: "Our train arrives at 6:18" };
const arrival600: Constraint = { type: "arrival", value: { statedClock: "6:00", normalizedClock: "18:00", mode: "train" }, priority: "hard", sourceText: "actually we arrive at 6" };
const gf: Constraint = { type: "dietary", value: { need: "gluten-free", severity: "intolerance" }, priority: "hard", sourceText: "One child needs gluten-free food" };
const halal: Constraint = { type: "dietary", value: { need: "halal", severity: "preference" }, priority: "hard", sourceText: "we eat halal" };
const party: Constraint = { type: "party", value: { adults: 1, children: 2 }, priority: "hard", sourceText: "Answered inline: 1 adult, 2 children" };
const access: Constraint = { type: "accessibility", value: { need: "step-free" }, priority: "hard", sourceText: "add wheelchair access" };

describe("mergeConstraints", () => {
  it("replaces a singleton type in place, preserving order", () => {
    const { merged, changes, dropped } = mergeConstraints([arrival618, gf], [arrival600]);
    expect(merged).toEqual([arrival600, gf]);
    expect(changes).toEqual([{ op: "replaced", type: "arrival", before: arrival618, after: arrival600 }]);
    expect(dropped).toEqual([]);
  });

  it("appends a new type and a new dietary need, replaces the same dietary need", () => {
    const r1 = mergeConstraints([gf], [halal, party]);
    expect(r1.merged).toEqual([gf, halal, party]);
    expect(r1.changes.map((c) => c.op)).toEqual(["added", "added"]);
    const gfPref: Constraint = { ...gf, value: { need: "gluten-free", severity: "preference" }, sourceText: "gf is just a preference" };
    const r2 = mergeConstraints([gf, halal], [gfPref]);
    expect(r2.merged).toEqual([gfPref, halal]);
    expect(r2.changes[0]).toMatchObject({ op: "replaced", type: "dietary" });
  });

  it("accessibility is keyed by need", () => {
    const elevator: Constraint = { type: "accessibility", value: { need: "elevator" }, priority: "hard", sourceText: "elevator please" };
    const { merged } = mergeConstraints([access], [elevator]);
    expect(merged).toEqual([access, elevator]);
  });

  it("empty deltas is a no-op", () => {
    const { merged, changes } = mergeConstraints([arrival618, gf], []);
    expect(merged).toEqual([arrival618, gf]);
    expect(changes).toEqual([]);
  });

  it("caps at 12 by dropping the lowest tier non-hard from the end", () => {
    const lows: Constraint[] = ["many-choices", "specific-item", "quick-service"].map((p, i) => ({
      type: "food_preference", value: { preference: p as "many-choices" }, priority: "low", sourceText: `low ${i}`,
    }));
    // food_preference is a singleton, so build the overflow from dietary needs instead:
    const needs = ["gluten-free", "vegetarian", "vegan", "nut-free", "dairy-free", "halal"] as const;
    const base: Constraint[] = [
      arrival618, party, access,
      { type: "seated_by", value: { milestone: "warmups" }, priority: "high", sourceText: "warmups" },
      { type: "budget", value: { maxTotalCad: 80 }, priority: "high", sourceText: "under 80" },
      { type: "noise", value: { preference: "quieter-preferred" }, priority: "low", sourceText: "quiet" },
      lows[0]!,
      ...needs.slice(0, 5).map((n): Constraint => ({ type: "dietary", value: { need: n, severity: "preference" }, priority: "hard", sourceText: n })),
    ]; // 12 constraints
    const { merged, dropped } = mergeConstraints(base, [
      { type: "dietary", value: { need: "halal", severity: "preference" }, priority: "hard", sourceText: "halal" },
    ]);
    expect(merged).toHaveLength(12);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.priority).toBe("low");
    expect(merged.some((c) => c.type === "dietary" && c.value.need === "halal")).toBe(true);
  });
});

describe("summarizeConstraintValue", () => {
  it("matches the ConstraintsStrip wording", () => {
    expect(summarizeConstraintValue(arrival618)).toBe("18:18");
    expect(summarizeConstraintValue(party)).toBe("1 adult, 2 children");
    expect(summarizeConstraintValue(halal)).toBe("halal");
    expect(summarizeConstraintValue(access)).toBe("step free");
  });
});
