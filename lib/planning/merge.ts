import { Constraint, PriorityTier } from "./schemas";

export type MergeOp = "added" | "replaced";
export interface MergeChange {
  op: MergeOp;
  type: Constraint["type"];
  before?: Constraint;
  after: Constraint;
}
export interface MergeResult {
  merged: Constraint[];
  changes: MergeChange[];
  /** Constraints removed to respect the schema's 12-constraint cap, lowest tier first. */
  dropped: Constraint[];
}

/** Merge identity: singleton per type, except dietary and accessibility which key by need. */
function keyOf(c: Constraint): string {
  if (c.type === "dietary") return `dietary:${c.value.need}`;
  if (c.type === "accessibility") return `accessibility:${c.value.need}`;
  return c.type;
}

const TIER_RANK: Record<PriorityTier, number> = { hard: 0, high: 1, medium: 2, low: 3 };

export function mergeConstraints(base: Constraint[], deltas: Constraint[]): MergeResult {
  const merged = [...base];
  const changes: MergeChange[] = [];
  for (const delta of deltas) {
    const idx = merged.findIndex((c) => keyOf(c) === keyOf(delta));
    if (idx >= 0) {
      const before = merged[idx]!;
      merged[idx] = delta;
      changes.push({ op: "replaced", type: delta.type, before, after: delta });
    } else {
      merged.push(delta);
      changes.push({ op: "added", type: delta.type, after: delta });
    }
  }
  const dropped: Constraint[] = [];
  while (merged.length > 12) {
    let dropIdx = -1;
    let worst = 0;
    for (let i = merged.length - 1; i >= 0; i--) {
      const rank = TIER_RANK[merged[i]!.priority];
      if (rank > worst) {
        worst = rank;
        dropIdx = i;
      }
    }
    if (dropIdx < 0) break; // everything hard: nothing droppable, leave overflow to Zod
    dropped.push(merged.splice(dropIdx, 1)[0]!);
  }
  return { merged, changes, dropped };
}

/** Word-or-two value summary, wording kept identical to components/ConstraintsStrip.tsx summarizeValue. */
export function summarizeConstraintValue(c: Constraint): string {
  switch (c.type) {
    case "arrival":
      return c.value.normalizedClock;
    case "seated_by":
      return c.value.milestone.replace("_", " ");
    case "dietary":
      return c.value.need;
    case "budget":
      return `$${c.value.maxTotalCad} max`;
    case "accessibility":
      return c.value.need.replace("-", " ");
    case "party":
      return `${c.value.adults} adult${c.value.adults === 1 ? "" : "s"}, ${c.value.children} child${c.value.children === 1 ? "" : "ren"}`;
    case "noise":
      return c.value.preference === "quieter-preferred" ? "quieter" : "no preference";
    case "food_preference":
      return c.value.preference.replace("-", " ");
  }
}
