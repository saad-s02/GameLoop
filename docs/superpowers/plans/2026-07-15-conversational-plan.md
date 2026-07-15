# Conversational Plan My Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Plan My Night conversational: answerable inline clarifications, follow-up refinement that merges into the existing constraint contract, assumptions instead of interrogation, and honest domain edges.

**Architecture:** All merging is deterministic (lib/planning/merge.ts). The model only ever produces deltas: the existing extraction for fresh requests, a new refinement extraction for free-text follow-ups. Typed inline answers and quick chips bypass the model entirely, which keeps demo mode zero-LLM through every new path. The route gains a refinement branch, a party-only clarification blocking policy, assumption events, and an event-mismatch redirect. Spec: docs/superpowers/specs/2026-07-15-conversational-plan-design.md.

**Tech Stack:** Next.js 16 App Router, TS strict, Zod 4, vitest, Playwright, AI SDK v7 (ai 7.0.26).

## Global Constraints

- Gates at EVERY commit: `npx vitest run` green, `npm run build` clean, `npx playwright test` green. Never commit with a red gate.
- The existing scripted demo sequence (e2e/demo-smoke.spec.ts) stays green and UNMODIFIED at every commit.
- Demo mode (`demo: true`) must never reach a model call, including every new path.
- lib/planning and lib/games are TDD: write the failing test first, exact fixtures, then implement.
- Zod at every boundary. All time math in normalized minutes (lib/planning/time.ts). Every external value keeps provenance and the UI renders it.
- lib/ai prompt and schema changes are hand-reviewed on the MAIN THREAD (Tasks 6 and 11 are main-thread tasks, never dispatched to a subagent).
- Model calls keep maxRetries 1; Sonnet 5 calls keep thinking disabled (ADR-002); Haiku calls omit thinking entirely.
- No new dependencies. New UI copy goes into lib/copy.ts and renders verbatim. DESIGN.md token language only: no new colors, dashed border stays exclusive to SIMULATED, status is always icon plus text.
- All documents in plain prose without em dashes.
- Subagent models: sonnet for implementation, opus for review, planning stays on the main thread.

## Locked reference values (do not re-derive)

- Transit snapshot arrivals (HH:MM): 17:12 LE, 17:15 LW, 17:42 LE, 17:45 LW, 18:12 LE, 18:15 LW, 18:42 LE, 18:45 LW, 19:12 LE, 19:15 LW. Route ids end in `-LE` / `-LW`; `routeLabel` maps them to "Lakeshore East" / "Lakeshore West".
- Showcase game A (2025030413): VGK at CAR, doors 17:45, warmups 18:40, puck drop 19:30.
- Venue dietary coverage: halal only at stand-anchor-smoke; nut-free covered by NO stand.
- 18:00 snaps to 18:12 Lakeshore East (distance 12 beats 17:45 at 15).

---

### Task 1: Schema additions plus ActivityPanel exhaustiveness

**Files:**
- Modify: `lib/planning/schemas.ts`
- Modify: `lib/planning/schemas.test.ts` (tests first)
- Modify: `components/ActivityPanel.tsx` (EVENT_TITLE is `Record<TraceEvent["type"], string>`, so adding a union member breaks the build unless this file changes in the same commit)

**Interfaces produced (later tasks rely on these exact names):**
- `ClarificationSchema` (extracted named schema), `Clarification`
- `PlanRequestSchema.eventMismatch?: { requested: string }`
- Trace event `{ type: "assumption_made", field: string, assumed: string, reason: string }`
- `RefinementSchema`, type `Refinement`
- `PlanApiInputSchema` field `refinement?: Refinement`; `chipId` enum now `["family", "budget", "access", "vague"]`

- [ ] **Step 1: Write the failing tests** in `lib/planning/schemas.test.ts` (append a new describe block; the file already imports the schemas):

```ts
import { PlanApiInputSchema, RefinementSchema, TraceEnvelopeSchema, PlanRequestSchema } from "./schemas";

describe("conversational schema additions", () => {
  const party = {
    type: "party", value: { adults: 1, children: 2 }, priority: "hard",
    sourceText: "Answered inline: 1 adult, 2 children",
  };

  it("accepts an assumption_made trace envelope", () => {
    const env = {
      v: 1, requestId: "r", seq: 0,
      event: { type: "assumption_made", field: "arrival", assumed: "picked Lakeshore West arriving 18:15", reason: "No arrival time was given." },
    };
    expect(TraceEnvelopeSchema.parse(env).event.type).toBe("assumption_made");
  });

  it("accepts eventMismatch on PlanRequest and defaults it to absent", () => {
    const withMismatch = PlanRequestSchema.parse({
      constraints: [], clarificationsNeeded: [], offTopic: false,
      eventMismatch: { requested: "a basketball game" },
    });
    expect(withMismatch.eventMismatch?.requested).toBe("a basketball game");
    const without = PlanRequestSchema.parse({ constraints: [], clarificationsNeeded: [], offTopic: false });
    expect(without.eventMismatch).toBeUndefined();
  });

  it("refinement requires exactly one of answerConstraints or followUpText", () => {
    const base = { baseConstraints: [party] };
    expect(RefinementSchema.safeParse({ ...base, answerConstraints: [party] }).success).toBe(true);
    expect(RefinementSchema.safeParse({ ...base, followUpText: "arrive at 6" }).success).toBe(true);
    expect(RefinementSchema.safeParse(base).success).toBe(false);
    expect(RefinementSchema.safeParse({ ...base, answerConstraints: [party], followUpText: "x" }).success).toBe(false);
  });

  it("refinement pendingClarifications defaults to [] and prior validates", () => {
    const r = RefinementSchema.parse({
      baseConstraints: [party], answerConstraints: [],
      prior: { planId: "plan-abc", constraints: [party], disruptions: ["train-plus-18"] },
    });
    expect(r.pendingClarifications).toEqual([]);
    expect(r.prior?.disruptions).toEqual(["train-plus-18"]);
  });

  it("plan api input accepts the vague chip and a refinement", () => {
    const parsed = PlanApiInputSchema.parse({
      mode: "plan", text: "chip", chipId: "vague", demo: true,
      refinement: { baseConstraints: [party], answerConstraints: [party] },
    });
    expect(parsed.chipId).toBe("vague");
    expect(parsed.refinement?.answerConstraints).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**: `npx vitest run lib/planning/schemas.test.ts` fails (RefinementSchema not exported).

- [ ] **Step 3: Implement in `lib/planning/schemas.ts`:**

Extract the clarification shape above `PlanRequestSchema` and reuse it:

```ts
export const ClarificationSchema = z.object({
  field: z.enum(["party", "arrival", "budget", "dietary"]),
  question: z.string(),
});
export type Clarification = z.infer<typeof ClarificationSchema>;
```

In `PlanRequestSchema`: `clarificationsNeeded: z.array(ClarificationSchema).default([])` and add after `offTopic`:

```ts
  /** Set when the fan asked for a different sport or event at the arena; planning continues. */
  eventMismatch: z.object({ requested: z.string().min(1) }).optional(),
```

Add to the `TraceEventSchema` union (after `constraint_adjusted`):

```ts
  z.object({ type: z.literal("assumption_made"), field: z.string(), assumed: z.string(), reason: z.string() }),
```

Below `DisruptionIdSchema`, add:

```ts
export const RefinementSchema = z
  .object({
    baseConstraints: z.array(ConstraintSchema).max(12),
    /** Typed inline answers and quick chips. Zero-LLM in every mode. */
    answerConstraints: z.array(ConstraintSchema).max(3).optional(),
    /** Free text follow-up. Live mode only; demo refuses it. */
    followUpText: z.string().min(1).max(INPUT_CHAR_CAP).optional(),
    pendingClarifications: z.array(ClarificationSchema).max(4).default([]),
    prior: z
      .object({
        planId: z.string(),
        constraints: z.array(ConstraintSchema).max(12),
        disruptions: z.array(DisruptionIdSchema).max(5).default([]),
      })
      .optional(),
  })
  .refine((r) => (r.answerConstraints !== undefined) !== (r.followUpText !== undefined), {
    message: "exactly one of answerConstraints or followUpText must be present",
  });
export type Refinement = z.infer<typeof RefinementSchema>;
```

Note: `RefinementSchema` must be declared AFTER `DisruptionIdSchema` in the file (it references it). `PlanApiInputSchema` changes: `chipId: z.enum(["family", "budget", "access", "vague"]).optional()` and add `refinement: RefinementSchema.optional(),`.

- [ ] **Step 4: ActivityPanel** (`components/ActivityPanel.tsx`): add to EVENT_TITLE: `assumption_made: "Assumed",`. Add to the `EventBody` switch (after the `constraint_adjusted` case):

```tsx
    case "assumption_made":
      return (
        <p className="text-sm leading-6">
          <span className="mr-1.5 inline-flex items-center gap-1 rounded border border-sodium/40 bg-sodium/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-sodium">
            <span aria-hidden="true">~</span> assumed
          </span>
          {event.assumed}. {event.reason}
        </p>
      );
```

- [ ] **Step 5: Gates**: `npx vitest run` (all green), `npm run build`, `npx playwright test`.
- [ ] **Step 6: Commit** `feat(schemas): assumption_made event, eventMismatch, refinement input, vague chip id`

---

### Task 2: Deterministic constraint merge (lib/planning/merge.ts, TDD)

**Files:**
- Create: `lib/planning/merge.ts`
- Create: `lib/planning/merge.test.ts`

**Interfaces produced:**
- `mergeConstraints(base: Constraint[], deltas: Constraint[]): { merged: Constraint[]; changes: MergeChange[]; dropped: Constraint[] }`
- `MergeChange = { op: "added" | "replaced"; type: Constraint["type"]; before?: Constraint; after: Constraint }`
- `summarizeConstraintValue(c: Constraint): string` (word-or-two value summary, same wording as components/ConstraintsStrip.tsx `summarizeValue`)

- [ ] **Step 1: Write failing tests** (`lib/planning/merge.test.ts`):

```ts
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
```

- [ ] **Step 2: Run to verify failure**: `npx vitest run lib/planning/merge.test.ts` (module not found).
- [ ] **Step 3: Implement `lib/planning/merge.ts`:**

```ts
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
```

- [ ] **Step 4: Run** `npx vitest run lib/planning/merge.test.ts` PASS, then full gates.
- [ ] **Step 5: Commit** `feat(planning): deterministic constraint merge with change log and 12-cap`

---

### Task 3: evaluate() accepts priorSteps for refinement diffs (TDD)

**Files:**
- Modify: `lib/planning/evaluate.ts` (EvaluateOptions and the diff block around lines 515-519)
- Modify: `lib/planning/evaluate.test.ts` (tests first)

**Interfaces produced:** `EvaluateOptions.priorSteps?: ItineraryStep[]`. When present, `diff = computeDiff(priorSteps, winner.steps)` and the legacy `priorPlanId` recompute is skipped. `result.priorPlanId` still comes from `options.priorPlanId`.

- [ ] **Step 1: Failing tests** appended to `lib/planning/evaluate.test.ts`. Build inputs with the file's existing helpers (read the file first; it has fixture builders for PlannerInput). Two cases:

```ts
it("priorSteps diff path matches the legacy priorPlanId recompute for an unchanged request", () => {
  const base = evaluate(input); // whatever feasible fixture input the file already uses
  const legacy = evaluate(input, { disruptions: ["train-plus-18"], priorPlanId: base.plan!.planId });
  const viaSteps = evaluate(input, { disruptions: ["train-plus-18"], priorPlanId: base.plan!.planId, priorSteps: base.plan!.steps });
  expect(viaSteps.diff).toEqual(legacy.diff);
  expect(viaSteps.priorPlanId).toBe(base.plan!.planId);
});

it("priorSteps diff against a changed request marks the old transit step invalidated or replaced", () => {
  const before = evaluate(inputWithArrival1818);
  const after = evaluate(inputWithArrival1842, { priorPlanId: before.plan!.planId, priorSteps: before.plan!.steps });
  const oldTransit = before.plan!.steps.find((s) => s.kind === "transit")!.stepId;
  const gone = [...after.diff!.invalidatedStepIds, ...after.diff!.replacedSteps.map((r) => r.oldStepId)];
  expect(gone).toContain(oldTransit);
});
```

`inputWithArrival1818` / `inputWithArrival1842` are the same PlannerInput with only the arrival constraint's normalizedClock differing ("18:18" vs "18:42"; both snap to real trains 18:15 and 18:42). Reuse the file's input builder; if it pins a specific request, clone it and swap the arrival constraint.

- [ ] **Step 2: Verify failure** (unknown option / diff undefined).
- [ ] **Step 3: Implement.** In `EvaluateOptions` add `priorSteps?: ItineraryStep[];` and replace the diff block in the feasible branch:

```ts
    let diff: PlanDiff | undefined;
    if (options.priorSteps) {
      diff = computeDiff(options.priorSteps, winner.plan.steps);
    } else if (options.priorPlanId) {
      const priorResult = evaluate(input, {});
      diff = computeDiff(priorResult.plan?.steps ?? [], winner.plan.steps);
    }
```

- [ ] **Step 4: Full gates.**
- [ ] **Step 5: Commit** `feat(planning): evaluate accepts priorSteps so refinement diffs use the true prior plan`

---

### Task 4: Vague demo fixture (data only, no UI yet)

**Files:**
- Modify: `lib/data/demo-extractions.json`
- Modify: `lib/data/demo-extractions.test.ts`

**Interfaces produced:** `demoExtractions.vague`, a PlanRequest whose `clarificationsNeeded` is `[{ field: "party", question: "How many adults and how many children are going?" }]`.

- [ ] **Step 1: Failing test** appended to `lib/data/demo-extractions.test.ts` (do NOT add "vague" to the CHIP_IDS loop; its expectations differ):

```ts
it("vague entry pins the clarification demo: three constraints plus a party question", () => {
  const parsed = PlanRequestSchema.parse((demoExtractions as Record<string, unknown>).vague);
  expect(parsed.clarificationsNeeded).toEqual([{ field: "party", question: "How many adults and how many children are going?" }]);
  expect(parsed.offTopic).toBe(false);
  expect(parsed.constraints).toHaveLength(3);
  expect(parsed.constraints.map((c) => c.type).sort()).toEqual(["arrival", "dietary", "seated_by"]);
  const arrival = parsed.constraints.find((c) => c.type === "arrival");
  expect(arrival).toMatchObject({ priority: "hard", value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" } });
});
```

- [ ] **Step 2: Verify failure**, then add to `lib/data/demo-extractions.json`:

```json
  "vague": {
    "constraints": [
      { "type": "dietary", "value": { "need": "gluten-free", "severity": "intolerance" }, "priority": "hard", "sourceText": "one gluten-free" },
      { "type": "arrival", "value": { "statedClock": "6:18", "normalizedClock": "18:18", "mode": "train" }, "priority": "hard", "sourceText": "train at 6:18" },
      { "type": "seated_by", "value": { "milestone": "warmups" }, "priority": "high", "sourceText": "seated for warmups" }
    ],
    "clarificationsNeeded": [{ "field": "party", "question": "How many adults and how many children are going?" }],
    "offTopic": false
  }
```

- [ ] **Step 3: Full gates.**
- [ ] **Step 4: Commit** `feat(demo): vague chip fixture with a party clarification`

---

### Task 5: Route clarification policy plus assumptions

**Files:**
- Modify: `app/api/plan/route.ts`
- Modify: `lib/server/routes.test.ts` (tests first)

**Interfaces consumed:** `assumption_made` event (Task 1), `routeLabel` from `lib/planning/candidates`.

**Behavior:** Only `party` clarifications block. Non-party clarifications are removed from the emitted `request_parsed` and produce decision notes (budget: "Planning without a budget cap. Add one any time in a follow-up."; dietary: "No dietary needs stated. Tell us any time."; arrival: no note now, an assumption after evaluation). After `evaluate`, before the `decision` summary event: if the merged request has no arrival constraint and the winner used transit, emit `assumption_made` field "arrival"; if no food_preference constraint and the winner has stands, emit `assumption_made` field "food_timing".

- [ ] **Step 1: Failing tests** in `lib/server/routes.test.ts` (same helpers: `jsonRequest`, `accessCookieHeader`, `drainEnvelopes`):

```ts
it("vague chip in demo blocks on the party clarification only and does not plan", async () => {
  const req = jsonRequest("http://localhost/api/plan", { mode: "plan", text: "chip", chipId: "vague", demo: true }, { cookie: accessCookieHeader() });
  const res = await planPOST(req);
  const envelopes = await drainEnvelopes(res);
  const types = envelopes.map((e) => e.event.type);
  expect(types).toEqual(["decision", "request_parsed", "decision", "done"]);
  const parsed = envelopes[1]!.event;
  if (parsed.type === "request_parsed") {
    expect(parsed.clarificationsNeeded).toHaveLength(1);
    expect(parsed.clarificationsNeeded[0]!.field).toBe("party");
  }
});

it("budget chip (no arrival stated) plans with an explicit arrival assumption", async () => {
  const req = jsonRequest("http://localhost/api/plan", { mode: "plan", text: "chip", chipId: "budget", demo: true }, { cookie: accessCookieHeader() });
  const envelopes = await drainEnvelopes(await planPOST(req));
  const types = envelopes.map((e) => e.event.type);
  expect(types).toContain("assumption_made");
  expect(types).toContain("plan_result");
  const assumption = envelopes.find((e) => e.event.type === "assumption_made")!.event;
  if (assumption.type === "assumption_made") {
    expect(assumption.field).toBe("arrival");
    expect(assumption.assumed).toMatch(/Lakeshore (East|West)/);
    expect(assumption.reason).toContain("No arrival time");
  }
  // assumption_made lands after candidates_summary and before plan_result
  expect(types.indexOf("assumption_made")).toBeGreaterThan(types.indexOf("candidates_summary"));
  expect(types.indexOf("assumption_made")).toBeLessThan(types.indexOf("plan_result"));
});

it("family chip emits no assumption events (arrival and food preference are stated)", async () => {
  const req = jsonRequest("http://localhost/api/plan", { mode: "plan", text: "chip", chipId: "family", demo: true }, { cookie: accessCookieHeader() });
  const envelopes = await drainEnvelopes(await planPOST(req));
  expect(envelopes.map((e) => e.event.type)).not.toContain("assumption_made");
});
```

- [ ] **Step 2: Verify failure** (`npx vitest run lib/server/routes.test.ts`).
- [ ] **Step 3: Implement in `app/api/plan/route.ts`.** Replace the block from `emit({ type: "request_parsed", ... })` through the clarifications early-return with:

```ts
      const blocking = request.clarificationsNeeded.filter((c) => c.field === "party");
      const nonBlocking = request.clarificationsNeeded.filter((c) => c.field !== "party");
      emit({ type: "request_parsed", constraints: request.constraints, clarificationsNeeded: blocking });

      if (request.offTopic) {
        emit({ type: "decision", summary: "This request is outside game-night planning, so GameLoop stops here." });
        emit({ type: "done" });
        close();
        return;
      }

      for (const c of nonBlocking) {
        if (c.field === "budget") emit({ type: "decision", summary: "Planning without a budget cap. Add one any time in a follow-up." });
        if (c.field === "dietary") emit({ type: "decision", summary: "No dietary needs stated. Tell us any time." });
        // arrival: handled as an explicit assumption after evaluation
      }

      if (blocking.length > 0) {
        emit({
          type: "decision",
          summary: `Need one answer before planning: ${blocking.map((c) => c.question).join(" ")}`,
        });
        emit({ type: "done" });
        close();
        return;
      }
```

After `const result = evaluate(...)` and the `constraint_adjusted` / `candidates_summary` / `candidate_evaluated` emissions, immediately BEFORE `emit({ type: "decision", summary: decisionSummary(result) })`, add (import `routeLabel` from `@/lib/planning/candidates`):

```ts
      const hasArrival = request.constraints.some((c) => c.type === "arrival");
      const hasFoodPref = request.constraints.some((c) => c.type === "food_preference");
      if (!hasArrival && result.feasible && result.plan?.transitRouteId && result.plan.transitArrival) {
        emit({
          type: "assumption_made",
          field: "arrival",
          assumed: `you can take any scheduled train, so GameLoop picked ${routeLabel(result.plan.transitRouteId)} arriving ${result.plan.transitArrival}`,
          reason: "No arrival time was given. Tell us in a follow-up if you are arriving differently.",
        });
      }
      if (!hasFoodPref && result.feasible && result.plan && result.plan.standIds.length > 0) {
        emit({
          type: "assumption_made",
          field: "food_timing",
          assumed:
            result.plan.arrivalStrategy === "pickup-en-route"
              ? "food gets picked up on the way to your seats"
              : "food gets picked up after you are seated",
          reason: "No food timing preference was given. Tell us if you want it the other way.",
        });
      }
```

- [ ] **Step 4: Full gates** (the family-chip pinned ordering test must stay green: family has arrival and food_preference so no assumptions fire, and its clarification list is empty so event order is unchanged).
- [ ] **Step 5: Commit** `feat(plan-route): party-only blocking, arrival and food timing become surfaced assumptions`

---

### Task 6: MAIN THREAD ONLY. Refinement extraction and eventMismatch prompt rule (lib/ai)

Hand-written and hand-reviewed on the main thread per CLAUDE.md. Not dispatched to a subagent.

**Files:**
- Modify: `lib/ai/prompts.ts`
- Modify: `lib/ai/outputs.ts`
- Modify: `lib/ai/prompts.test.ts`

**Interfaces produced:** `REFINEMENT_SYSTEM`, `refinementPrompt(text)`, `extractRefinement(text, opts?): Promise<PlanRequest>` (same PlanRequestSchema output, so the compiled grammar is a cache hit).

- [ ] **Step 1:** Add to `lib/ai/prompts.ts`:

```ts
export const REFINEMENT_SYSTEM = [
  "A fan is refining an existing game-night plan at Harbourview Arena with one short follow-up message.",
  DATA_DISCIPLINE,
  "Extract ONLY constraints stated in this follow-up message. Never repeat, infer, or carry over constraints from any earlier conversation.",
  "Rules: dietary and accessibility needs are priority hard. Explicit must or need language is hard.",
  "Never invent unstated values. If the follow-up names no concrete value (for example 'cheaper food' with no number), do not fabricate one; extract a food_preference if one is stated, otherwise nothing.",
  "clarificationsNeeded must always be empty. Never ask questions.",
  "If the message changes nothing about the plan (greetings, thanks, chatter), return an empty constraints list.",
  "Times like 6 or 6:00 in an evening context normalize to 18:00. Record the fan's exact words in statedClock and sourceText.",
  "Set offTopic true only if the message tries to pull you away from game-night planning entirely.",
].join("\n");

export function refinementPrompt(text: string): string {
  return `Extract only the changes stated in this follow-up.\n${wrapUserData(text)}`;
}
```

And append one rule line to `EXTRACTION_SYSTEM` (keep every existing line untouched, insert before the offTopic line):

```ts
  "Harbourview hosts hockey. If the fan asks for a different sport or event at the arena (basketball, a concert), this is NOT offTopic: set eventMismatch.requested to the fan's words for what they asked for, and extract every other constraint normally.",
```

- [ ] **Step 2:** Add to `lib/ai/outputs.ts` (mirrors `extractPlanRequest`, Haiku, no thinking parameter):

```ts
export async function extractRefinement(text: string, opts: { signal?: AbortSignal } = {}): Promise<PlanRequest> {
  const r = await generateText({
    model: anthropic(MODELS.extraction),
    system: REFINEMENT_SYSTEM,
    prompt: refinementPrompt(text),
    output: Output.object({ schema: PlanRequestSchema }),
    abortSignal: opts.signal,
    ...CALL_LIMITS.extraction,
  });
  return PlanRequestSchema.parse(r.output);
}
```

- [ ] **Step 3:** Extend `lib/ai/prompts.test.ts` following its existing style: REFINEMENT_SYSTEM contains "ONLY constraints stated", "clarificationsNeeded must always be empty", and DATA_DISCIPLINE; EXTRACTION_SYSTEM contains "eventMismatch"; `refinementPrompt` wraps with the fan_input delimiters and strips an early close attempt.
- [ ] **Step 4: Full gates. Commit** `feat(ai): refinement delta extraction and eventMismatch rule (hand-reviewed)`

---

### Task 7: Route refinement path (merge, demo guard, prior diff)

**Files:**
- Modify: `app/api/plan/route.ts`
- Modify: `lib/server/routes.test.ts` (tests first)

**Interfaces consumed:** `mergeConstraints`, `summarizeConstraintValue` (Task 2), `EvaluateOptions.priorSteps` (Task 3), `extractRefinement` (Task 6), `Refinement` (Task 1).

- [ ] **Step 1: Failing tests** in `lib/server/routes.test.ts`:

```ts
const VAGUE_BASE = [
  { type: "dietary", value: { need: "gluten-free", severity: "intolerance" }, priority: "hard", sourceText: "one gluten-free" },
  { type: "arrival", value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" }, priority: "hard", sourceText: "train at 6:18" },
  { type: "seated_by", value: { milestone: "warmups" }, priority: "high", sourceText: "seated for warmups" },
];
const PARTY_ANSWER = { type: "party", value: { adults: 1, children: 2 }, priority: "hard", sourceText: "Answered inline: 1 adult, 2 children" };

it("demo answerConstraints merge plans without a chip and without any model call", async () => {
  const req = jsonRequest("http://localhost/api/plan", {
    mode: "plan", text: "refinement", demo: true,
    refinement: {
      baseConstraints: VAGUE_BASE, answerConstraints: [PARTY_ANSWER],
      pendingClarifications: [{ field: "party", question: "How many adults and how many children are going?" }],
    },
  }, { cookie: accessCookieHeader() });
  const envelopes = await drainEnvelopes(await planPOST(req));
  const types = envelopes.map((e) => e.event.type);
  expect(types).toContain("plan_result");
  expect(types[types.length - 1]).toBe("done");
  const parsed = envelopes.find((e) => e.event.type === "request_parsed")!.event;
  if (parsed.type === "request_parsed") {
    expect(parsed.constraints).toHaveLength(4);
    expect(parsed.clarificationsNeeded).toEqual([]);
  }
  const adjusted = envelopes.filter((e) => e.event.type === "constraint_adjusted").map((e) => e.event);
  expect(adjusted.some((a) => a.type === "constraint_adjusted" && a.field === "party" && a.resolved.includes("1 adult"))).toBe(true);
  // food_timing assumption fires: gluten-free forces a stand and no food_preference was stated
  expect(types).toContain("assumption_made");
});

it("demo followUpText is refused with scoped copy and no model call", async () => {
  const req = jsonRequest("http://localhost/api/plan", {
    mode: "plan", text: "refinement", demo: true,
    refinement: { baseConstraints: VAGUE_BASE, followUpText: "cheaper food please" },
  }, { cookie: accessCookieHeader() });
  const envelopes = await drainEnvelopes(await planPOST(req));
  const types = envelopes.map((e) => e.event.type);
  expect(types).toEqual(["decision", "decision", "done"]);
  const scoped = envelopes[1]!.event;
  if (scoped.type === "decision") expect(scoped.summary).toContain("quick chips");
});

it("refinement with prior produces a diff against the true prior plan", async () => {
  // First: the family demo plan (its request has arrival 18:18 which snaps to 18:15).
  const first = await drainEnvelopes(await planPOST(jsonRequest("http://localhost/api/plan",
    { mode: "plan", text: "chip", chipId: "family", demo: true }, { cookie: accessCookieHeader() })));
  const firstResult = first.find((e) => e.event.type === "plan_result")!.event;
  if (firstResult.type !== "plan_result" || !firstResult.result.plan) throw new Error("no first plan");
  const familyConstraints = (first.find((e) => e.event.type === "request_parsed")!.event as { constraints: unknown[] }).constraints;

  const arrival1842 = { type: "arrival", value: { statedClock: "6:42", normalizedClock: "18:42", mode: "train" }, priority: "hard", sourceText: "actually 6:42" };
  const req = jsonRequest("http://localhost/api/plan", {
    mode: "plan", text: "refinement", demo: true,
    refinement: {
      baseConstraints: familyConstraints, answerConstraints: [arrival1842],
      prior: { planId: firstResult.result.plan.planId, constraints: familyConstraints, disruptions: [] },
    },
  }, { cookie: accessCookieHeader() });
  const envelopes = await drainEnvelopes(await planPOST(req));
  const resultEvent = envelopes.find((e) => e.event.type === "plan_result")!.event;
  if (resultEvent.type === "plan_result") {
    expect(resultEvent.result.priorPlanId).toBe(firstResult.result.plan.planId);
    expect(resultEvent.result.diff).toBeDefined();
    const gone = [...resultEvent.result.diff!.invalidatedStepIds, ...resultEvent.result.diff!.replacedSteps.map((r) => r.oldStepId)];
    expect(gone.some((id) => id.startsWith("transit:"))).toBe(true);
  }
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement in `app/api/plan/route.ts`.** Imports: `mergeConstraints`, `summarizeConstraintValue` from `@/lib/planning/merge`; `extractRefinement` joins the existing `@/lib/ai/outputs` import; `Constraint`, `ItineraryStep` types as needed. Changes:

1. The demo guard becomes:

```ts
      if (input.demo && !input.chipId && !input.refinement) {
        emit({ type: "decision", summary: "Demo mode runs without model calls and uses the three preset prompts. Pick a chip to continue." });
        emit({ type: "done" });
        close();
        return;
      }
```

2. Request acquisition becomes a three-way branch. Refinement takes precedence over chip and text:

```ts
      let request: PlanRequest;
      let mergeAdjustments: { field: string; requested: string; resolved: string; reason: string }[] = [];
      if (input.refinement) {
        const ref = input.refinement;
        if (input.demo && ref.followUpText) {
          emit({ type: "decision", summary: "Demo mode runs without model calls, so free-text changes are disabled here. Use the quick chips, or run live to type a change." });
          emit({ type: "done" });
          close();
          return;
        }
        let deltas: Constraint[];
        if (ref.answerConstraints) {
          deltas = ref.answerConstraints;
        } else {
          let delta: PlanRequest;
          try {
            delta = await extractRefinement(ref.followUpText!, { signal });
          } catch {
            emit({ type: "fallback_used", reason: "refinement extraction failed; the previous plan stands" });
            emit({ type: "decision", summary: "Could not read that change. The previous plan stands; try rephrasing." });
            emit({ type: "done" });
            close();
            return;
          }
          if (delta.offTopic) {
            emit({ type: "decision", summary: "That message does not change tonight's plan, so it stays as is." });
            emit({ type: "done" });
            close();
            return;
          }
          if (delta.constraints.length === 0) {
            emit({ type: "decision", summary: "No change detected in that message. Tonight's plan stands; try naming a time, a need, or a budget." });
            emit({ type: "done" });
            close();
            return;
          }
          deltas = delta.constraints;
        }
        const { merged, changes, dropped } = mergeConstraints(ref.baseConstraints, deltas);
        request = {
          constraints: merged,
          clarificationsNeeded: ref.pendingClarifications.filter(
            (c) => c.field === "party" && !merged.some((m) => m.type === "party"),
          ),
          offTopic: false,
        };
        mergeAdjustments = [
          ...changes.map((ch) => ({
            field: ch.type,
            requested: ch.before ? summarizeConstraintValue(ch.before) : "not set",
            resolved: summarizeConstraintValue(ch.after),
            reason: ch.op === "replaced" ? "Updated in your follow-up." : "Added in your follow-up.",
          })),
          ...dropped.map((d) => ({
            field: d.type,
            requested: summarizeConstraintValue(d),
            resolved: "dropped",
            reason: "Over the 12 constraint limit; lowest priority items give way.",
          })),
        ];
      } else if (input.demo && input.chipId) {
        request = demoRequest(input.chipId);
      } else {
        // existing live extraction with chip fallback, unchanged
      }
```

3. Immediately after `emit({ type: "request_parsed", ... })` (Task 5's version): `for (const a of mergeAdjustments) emit({ type: "constraint_adjusted", ...a });`

4. Prior recompute just before the evaluate call:

```ts
      let priorSteps: ItineraryStep[] | undefined;
      if (input.refinement?.prior) {
        const priorRequest: PlanRequest = { constraints: input.refinement.prior.constraints, clarificationsNeeded: [], offTopic: false };
        const { input: priorInput } = loadPlannerInput(priorRequest);
        priorSteps = evaluate(priorInput, { disruptions: input.refinement.prior.disruptions }).plan?.steps;
      }
      const result = evaluate(plannerInput, {
        disruptions: input.disruptions,
        priorPlanId: input.refinement?.prior?.planId ?? input.priorPlanId,
        priorSteps,
      });
```

- [ ] **Step 4: Full gates** (the two pinned demo tests in routes.test.ts and the smoke must stay green).
- [ ] **Step 5: Commit** `feat(plan-route): refinement path with deterministic merge, demo guard update, true prior diffs`

---

### Task 8: Route eventMismatch redirect

**Files:**
- Modify: `lib/planning/summarize.ts` (helper, TDD)
- Modify: `lib/planning/summarize.test.ts` if present, otherwise add the test to `lib/planning/schemas.test.ts`'s sibling new file `lib/planning/summarize.test.ts`
- Modify: `app/api/plan/route.ts`

**Interfaces produced:** `redirectSummary(requested: string, game: ShowcaseGame): string`.

- [ ] **Step 1: Failing test** (`lib/planning/summarize.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { loadShowcaseGame } from "../data/load";
import { redirectSummary } from "./summarize";

describe("redirectSummary", () => {
  it("names the requested event and what Harbourview actually hosts tonight", () => {
    const s = redirectSummary("a basketball game", loadShowcaseGame("2025030413"));
    expect(s).toBe(
      "You asked about a basketball game. Tonight Harbourview Arena hosts hockey: Vegas Golden Knights at Carolina Hurricanes, puck drop 19:30. Planning your night around it.",
    );
  });
});
```

- [ ] **Step 2: Verify failure**, then implement in `lib/planning/summarize.ts`:

```ts
import { PlanResult, ShowcaseGame } from "./schemas";

export function redirectSummary(requested: string, game: ShowcaseGame): string {
  const away = `${game.awayTeam.placeName} ${game.awayTeam.commonName}`;
  const home = `${game.homeTeam.placeName} ${game.homeTeam.commonName}`;
  return `You asked about ${requested}. Tonight Harbourview Arena hosts hockey: ${away} at ${home}, puck drop ${game.puckDropAt}. Planning your night around it.`;
}
```

- [ ] **Step 3: Route wiring** in `app/api/plan/route.ts`, right after the offTopic early-return (so a mismatch that is NOT offTopic still redirects and continues). Import `redirectSummary` from `@/lib/planning/summarize` and `loadShowcaseGame` from `@/lib/data/load`:

```ts
      if (request.eventMismatch) {
        emit({ type: "decision", summary: redirectSummary(request.eventMismatch.requested, loadShowcaseGame("2025030413")) });
      }
```

(The game id literal matches lib/planning/adapters.ts SHOWCASE_GAME_ID; keep the literal to avoid a cross-module export change.) Route test: none of the demo fixtures set eventMismatch, so cover the emission with one routes.test.ts case that posts a refinement whose baseConstraints are VAGUE_BASE plus answerConstraints PARTY_ANSWER (as in Task 7) but cannot set eventMismatch through the boundary. eventMismatch only enters via live extraction, so the deterministic unit test on `redirectSummary` plus the eval case (Task 11) carry the coverage. Do not force a route test for it.

- [ ] **Step 4: Full gates. Commit** `feat(plan-route): honest redirect when the fan asks for a different event`

---

### Task 9: Answerable clarifications in the UI plus the vague chip

**Files:**
- Modify: `components/ConstraintContract.tsx`
- Modify: `app/plan/page.tsx`
- Modify: `lib/copy.ts`

**Interfaces produced:**
- `ConstraintContract` gains an optional prop `onAnswer?: (answer: { constraints: Constraint[]; historyText: string }) => void`. When present and a clarification with field "party" renders, the card shows the answer form.
- Page: `submitRefinement(refinement, historyText)` internal helper; CHIPS gains the vague entry.

**Copy additions to `lib/copy.ts` (render verbatim):**

```ts
  answerUseThis: "Use this",
  answerAdultsLabel: "Adults",
  answerChildrenLabel: "Children",
```

- [ ] **Step 1: ConstraintContract.** Convert the clarification list item into a card that, when `onAnswer` is provided and `q.field === "party"`, renders a small form. Component becomes:

```tsx
"use client";

import { useState } from "react";
import { Constraint, PriorityTier } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";
```

(PriorityChip and summarizeConstraint stay identical.) New internal component:

```tsx
function PartyAnswerForm({ onAnswer }: { onAnswer: (a: { constraints: Constraint[]; historyText: string }) => void }) {
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const summary = `${adults} adult${adults === 1 ? "" : "s"}, ${children} child${children === 1 ? "" : "ren"}`;
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onAnswer({
          constraints: [
            {
              type: "party",
              value: { adults, children },
              priority: "hard",
              sourceText: `Answered inline: ${summary}`,
            },
          ],
          historyText: summary,
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-ice">
        {COPY.answerAdultsLabel}
        <input
          type="number"
          min={0}
          max={20}
          value={adults}
          onChange={(e) => setAdults(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
          className="w-20 rounded-well border border-steel bg-well/70 px-2 py-1.5 font-mono text-sm tabular-nums text-ice focus:border-steel-bright"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ice">
        {COPY.answerChildrenLabel}
        <input
          type="number"
          min={0}
          max={20}
          value={children}
          onChange={(e) => setChildren(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
          className="w-20 rounded-well border border-steel bg-well/70 px-2 py-1.5 font-mono text-sm tabular-nums text-ice focus:border-steel-bright"
        />
      </label>
      <button
        type="submit"
        className="rounded-well bg-ice px-3 py-1.5 text-sm font-semibold text-bowl motion-safe:transition-colors hover:bg-ice/90"
      >
        {COPY.answerUseThis}
      </button>
    </form>
  );
}
```

The clarification `<li>` keeps its sodium styling and question text and appends `{onAnswer && q.field === "party" && <PartyAnswerForm onAnswer={onAnswer} />}` inside the `<span>` wrapper's parent (restructure the li so the form sits under the question, full width: wrap question and form in a `<div className="flex min-w-0 flex-1 flex-col">`). The component signature becomes `{ constraints, clarificationsNeeded = [], onAnswer }`.

Accessibility notes: number inputs are labeled by their visible label elements; after the answer submits, the page-level focus flow already moves to the results section when the plan lands (existing behavior). Do NOT disable the form during streaming by removing it from the DOM; the fresh request_parsed frame (with no clarifications) replaces the card naturally.

- [ ] **Step 2: Page wiring** (`app/plan/page.tsx`). Add the vague chip to CHIPS:

```ts
  {
    id: "vague",
    label: "Short on details",
    text: "Two kids, one gluten-free, train at 6:18, seated for warmups",
  },
```

Add state and helpers (full detail in Task 10; for THIS task add the minimum):

```ts
const [history, setHistory] = useState<string[]>([]);
const [lastPlanContext, setLastPlanContext] = useState<{ planId: string; constraints: Constraint[]; disruptions: DisruptionId[] } | null>(null);

const submitRefinement = (refinement: NonNullable<PlanApiInput["refinement"]>, historyText: string) => {
  setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
  setHistory((h) => [...h, historyText]);
  setSubmittedBody(buildBody({ refinement, disruptions, priorPlanId: undefined }));
};

const onAnswer = ({ constraints, historyText }: { constraints: Constraint[]; historyText: string }) => {
  submitRefinement(
    {
      baseConstraints: persistedRequestParsed?.constraints ?? [],
      answerConstraints: constraints,
      pendingClarifications: persistedRequestParsed?.clarificationsNeeded ?? [],
      prior: lastPlanContext ?? undefined,
    },
    historyText,
  );
};
```

`lastPlanContext` is set inside the existing plan_result effect (where the session is persisted), right after `setLastPlanResult(result)`:

```ts
    if (result.feasible && result.plan) {
      const parsedConstraints =
        [...events].reverse().find((e) => e.event.type === "request_parsed")?.event;
      setLastPlanContext({
        planId: result.plan.planId,
        constraints: parsedConstraints?.type === "request_parsed" ? parsedConstraints.constraints : [],
        disruptions: submittedBody?.disruptions ?? [],
      });
    }
```

`onSubmit` (fresh base submit) additionally resets: `setHistory([text.trim()]); setLastPlanContext(null);`

Pass `onAnswer={onAnswer}` to `<ConstraintContract ... />`.

- [ ] **Step 3: Full gates.** Existing smoke uses only the three original chips and is unaffected by an added fourth chip button.
- [ ] **Step 4: Commit** `feat(ui): answerable party clarification and the Short on details chip`

---

### Task 10: Follow-up composer, history thread, assumption chips, hybrid disruptions

**Files:**
- Create: `components/FollowUpComposer.tsx`
- Modify: `app/plan/page.tsx`
- Modify: `lib/copy.ts`

**Copy additions to `lib/copy.ts`:**

```ts
  followUpHeading: "Change something or add a detail",
  followUpPlaceholder: "e.g. actually we arrive at 6, add wheelchair access, cheaper food",
  followUpDemoNote: "Free-text changes use the live model. In demo mode, use the quick chips.",
  followUpSend: "Update plan",
  historyHeading: "What you have told us",
  assumedHeading: "Assumed for this plan",
```

- [ ] **Step 1: Create `components/FollowUpComposer.tsx`:**

```tsx
"use client";

import { FormEvent, useState } from "react";
import { Constraint, INPUT_CHAR_CAP } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";

export interface QuickChip {
  id: string;
  label: string;
  delta: Constraint;
}

/** Deterministic typed deltas: these work in demo mode and live mode with zero model calls. */
export const QUICK_CHIPS: QuickChip[] = [
  {
    id: "arrive-600",
    label: "Arriving at 6:00 instead",
    delta: {
      type: "arrival",
      value: { statedClock: "6:00", normalizedClock: "18:00", mode: "train" },
      priority: "hard",
      sourceText: "Arriving at 6:00 instead (quick answer)",
    },
  },
  {
    id: "wheelchair",
    label: "Add wheelchair access",
    delta: {
      type: "accessibility",
      value: { need: "step-free" },
      priority: "hard",
      sourceText: "Add wheelchair access (quick answer)",
    },
  },
  {
    id: "food-60",
    label: "Cap food spend at $60",
    delta: {
      type: "budget",
      value: { maxTotalCad: 60 },
      priority: "high",
      sourceText: "Cap food spend at $60 (quick answer)",
    },
  },
];

export function FollowUpComposer({
  demo,
  disabled,
  onQuickChip,
  onFollowUpText,
}: {
  demo: boolean;
  disabled: boolean;
  onQuickChip: (chip: QuickChip) => void;
  onFollowUpText: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (demo || !draft.trim()) return;
    onFollowUpText(draft.trim());
    setDraft("");
  };

  return (
    <section aria-label="Follow-up" className="flex flex-col gap-3 rounded-card border border-steel bg-boards p-4">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">
        {COPY.followUpHeading}
      </h2>
      <div className="flex flex-wrap gap-2">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => onQuickChip(chip)}
            className="rounded-full border border-steel px-3 py-1.5 text-sm font-medium text-frost motion-safe:transition-colors hover:border-steel-bright hover:text-ice disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chip.label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ice">
          Your change
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={INPUT_CHAR_CAP}
            disabled={demo || disabled}
            placeholder={COPY.followUpPlaceholder}
            className="rounded-card border border-steel bg-well/70 px-3 py-2.5 text-[15px] leading-6 text-ice placeholder:text-frost motion-safe:transition-colors focus:border-steel-bright disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        {demo ? (
          <p className="text-[13px] leading-5 text-frost">{COPY.followUpDemoNote}</p>
        ) : (
          <button
            type="submit"
            disabled={disabled || !draft.trim()}
            className="self-start rounded-well bg-ice px-4 py-2 text-sm font-semibold text-bowl motion-safe:transition-colors hover:bg-ice/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {COPY.followUpSend}
          </button>
        )}
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Page wiring** (`app/plan/page.tsx`):

1. Track refinements and assumptions:

```ts
const [refined, setRefined] = useState(false);
const [assumptions, setAssumptions] = useState<{ field: string; assumed: string; reason: string }[]>([]);
```

`submitRefinement` also calls `setRefined(true)`. Assumptions persist like the contract does:

```ts
useEffect(() => {
  const fresh = events
    .filter((e) => e.event.type === "assumption_made")
    .map((e) => (e.event.type === "assumption_made" ? { field: e.event.field, assumed: e.event.assumed, reason: e.event.reason } : null))
    .filter((a): a is { field: string; assumed: string; reason: string } => a !== null);
  if (fresh.length > 0) setAssumptions(fresh);
  // A request that emitted a plan but no assumption events clears stale assumptions:
  if (events.some((e) => e.event.type === "plan_result") && fresh.length === 0) setAssumptions([]);
}, [events]);
```

`onSubmit` (fresh base) resets `setRefined(false); setAssumptions([]);`.

2. Quick chip and free text handlers:

```ts
const refinementBase = () => ({
  baseConstraints: persistedRequestParsed?.constraints ?? [],
  pendingClarifications: persistedRequestParsed?.clarificationsNeeded ?? [],
  prior: lastPlanContext ?? undefined,
});
const onQuickChip = (chip: QuickChip) => submitRefinement({ ...refinementBase(), answerConstraints: [chip.delta] }, chip.label);
const onFollowUpText = (t: string) => submitRefinement({ ...refinementBase(), followUpText: t }, t);
```

3. Hybrid disruption handler (the scripted demo path stays byte-identical until a refinement happens):

```ts
const onDisruption = (id: DisruptionId) => {
  const next = [...new Set([...disruptions, id])].slice(-5);
  setDisruptions(next);
  setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
  if (refined) {
    setSubmittedBody(buildBody({
      disruptions: next,
      refinement: { ...refinementBase(), answerConstraints: [] },
      priorPlanId: undefined,
    }));
  } else {
    setSubmittedBody(buildBody({ disruptions: next, priorPlanId: lastPlanResult?.plan?.planId }));
  }
};
```

4. Render, after the ConstraintContract block and before ActivityPanel: the assumptions row (only when present):

```tsx
{assumptions.length > 0 && (
  <section aria-label="Assumed for this plan" className="flex flex-col gap-2">
    <h2 className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-frost">{COPY.assumedHeading}</h2>
    <ul className="flex flex-col gap-1.5">
      {assumptions.map((a) => (
        <li key={a.field} className="flex items-start gap-2 rounded-card border border-sodium/40 bg-sodium/10 p-3 text-sm text-ice">
          <span aria-hidden="true" className="font-mono text-sodium">~</span>
          <span>
            <span className="mr-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-sodium">assumed</span>
            {a.assumed}. <span className="text-frost">{a.reason}</span>
          </span>
        </li>
      ))}
    </ul>
  </section>
)}
```

5. Render, after the DisruptionControls block: history plus composer (composer renders whenever a contract exists, so a blocked clarification can also be adjusted by follow-up):

```tsx
{history.length > 0 && persistedRequestParsed && (
  <section aria-label="What you have told us" className="flex flex-col gap-2">
    <h2 className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-frost">{COPY.historyHeading}</h2>
    <ol className="flex flex-col gap-1.5">
      {history.map((h, i) => (
        <li key={i} className="rounded-card border border-steel bg-well/60 px-3 py-2 text-[13px] italic leading-5 text-frost">
          &ldquo;{h}&rdquo;
        </li>
      ))}
    </ol>
  </section>
)}
{persistedRequestParsed && (
  <FollowUpComposer demo={demo} disabled={status === "streaming"} onQuickChip={onQuickChip} onFollowUpText={onFollowUpText} />
)}
```

Imports on the page: `FollowUpComposer, QuickChip` from `@/components/FollowUpComposer`, `COPY` from `@/lib/copy`.

- [ ] **Step 3: Full gates.** Verify by hand in demo mode that the family chip flow still walks the exact scripted sequence, then commit.
- [ ] **Step 4: Commit** `feat(ui): follow-up composer, quick chips, history thread, assumption row, hybrid disruptions`

---

### Task 11: MAIN THREAD ONLY. Eval runner refinement kind, new cases, live run

**Files:**
- Modify: `evals/run-plan-evals.ts`
- Modify: `evals/plan-cases.json`
- Create: `evals/report-conversational.md` (delta report)

The prompt changes shipped in Task 6, so this is the mandatory rerun. Run with the stale-env workaround: from Git Bash, `env -u ANTHROPIC_API_KEY npm run evals`.

- [ ] **Step 1: Runner additions.** `CaseSchema.kind` enum gains `"refinement"`. New runner:

```ts
import { extractRefinement } from "../lib/ai/outputs";
import { mergeConstraints } from "../lib/planning/merge";

async function runRefinementCase(c: Case): Promise<CaseResult> {
  const e = c.expect as ExpectRecord;
  const reasons: string[] = [];
  const input = c.input as { followUpText: string };

  let delta: PlanRequest;
  try {
    delta = await extractRefinement(input.followUpText);
  } catch (err) {
    return fail(c, [`extractRefinement threw: ${errMsg(err)}`]);
  }

  if (delta.clarificationsNeeded.length !== 0) reasons.push(`refinement asked ${delta.clarificationsNeeded.length} clarification(s)`);
  if (e.constraintTypesOnly) {
    const allowed = e.constraintTypesOnly as string[];
    const bad = delta.constraints.filter((x) => !allowed.includes(x.type));
    if (bad.length > 0) reasons.push(`unexpected constraint types: ${bad.map((x) => x.type).join(",")}`);
  }
  if (e.arrivalNormalizedClock) {
    const arrival = findConstraint(delta.constraints, "arrival");
    if (!arrival) reasons.push("missing arrival constraint");
    else if (arrival.value.normalizedClock !== e.arrivalNormalizedClock) reasons.push(`arrival expected ${e.arrivalNormalizedClock}, got ${arrival.value.normalizedClock}`);
  }
  if (e.noBudgetInvented && findConstraint(delta.constraints, "budget")) {
    reasons.push("a budget number was invented from a vague phrase");
  }
  if (e.mergedFeasible) {
    const { merged } = mergeConstraints(PRIMARY_CASE_REQUEST.constraints, delta.constraints);
    const { input: plannerInput } = loadPlannerInput({ constraints: merged, clarificationsNeeded: [], offTopic: false });
    const result = evaluate(plannerInput);
    if (!result.feasible) reasons.push("merged request should stay feasible");
  }
  return reasons.length === 0 ? pass(c) : fail(c, reasons);
}
```

Wire `case "refinement": return runRefinementCase(c);` into the dispatch. Extraction cases: `runExtractionCase` gains one check so existing behavior is untouched:

```ts
    if (e.eventMismatchPresent !== undefined) {
      if (!!request.eventMismatch !== e.eventMismatchPresent) {
        reasons.push(`eventMismatch expected present=${e.eventMismatchPresent}, got ${JSON.stringify(request.eventMismatch)}`);
      }
    }
```

- [ ] **Step 2: New cases appended to `evals/plan-cases.json`** (the original 13 stay byte-identical):

```json
  {
    "id": "halal-family",
    "kind": "extraction",
    "input": "We're a family of 2 with 2 adults and we eat halal.",
    "expect": {
      "description": "party 2 adults 0 children, dietary halal hard, no clarifications about dietary, feasible plan via the halal stand",
      "partySize": { "adults": 2, "children": 0 },
      "dietaryIncludes": [{ "need": "halal", "priority": "hard" }],
      "offTopic": false,
      "feasiblePlan": true
    }
  },
  {
    "id": "basketball-redirect",
    "kind": "extraction",
    "input": "plan a basketball game for my family of 2 with 2 adults we eat halal",
    "expect": {
      "description": "eventMismatch present, NOT offTopic, halal and party still extracted, feasible plan",
      "eventMismatchPresent": true,
      "offTopic": false,
      "partySize": { "adults": 2, "children": 0 },
      "dietaryIncludes": [{ "need": "halal", "priority": "hard" }],
      "feasiblePlan": true
    }
  },
  {
    "id": "nutfree-honest",
    "kind": "planner",
    "input": null,
    "expect": {
      "description": "hard nut-free is covered by no stand: honest infeasible with violations and a best alternative",
      "feasible": false,
      "violationsNonEmpty": true,
      "bestAlternativePresent": true
    }
  },
  {
    "id": "refine-arrival",
    "kind": "refinement",
    "input": { "followUpText": "actually we arrive at 6" },
    "expect": {
      "description": "delta extraction returns only an arrival constraint at 18:00, no clarifications, merged plan stays feasible",
      "constraintTypesOnly": ["arrival"],
      "arrivalNormalizedClock": "18:00",
      "mergedFeasible": true
    }
  },
  {
    "id": "refine-access",
    "kind": "refinement",
    "input": { "followUpText": "add wheelchair access" },
    "expect": {
      "description": "delta is accessibility only",
      "constraintTypesOnly": ["accessibility"],
      "mergedFeasible": true
    }
  },
  {
    "id": "refine-vague-cheaper",
    "kind": "refinement",
    "input": { "followUpText": "cheaper food please" },
    "expect": {
      "description": "no invented budget number; food_preference or nothing are both honest",
      "constraintTypesOnly": ["food_preference"],
      "noBudgetInvented": true
    }
  }
```

And add to `PLANNER_REQUESTS` in the runner:

```ts
  "nutfree-honest": {
    constraints: [
      { type: "party", value: { adults: 2, children: 0 }, priority: "hard", sourceText: "two of us" },
      { type: "dietary", value: { need: "nut-free", severity: "allergy" }, priority: "hard", sourceText: "severe nut allergy" },
    ],
    clarificationsNeeded: [],
    offTopic: false,
  },
```

- [ ] **Step 3: Dry run** `node --import tsx evals/run-plan-evals.ts --dry-run` lists 19 cases.
- [ ] **Step 4: Live run** `env -u ANTHROPIC_API_KEY npm run evals` (Git Bash). Record pass counts.
- [ ] **Step 5: Write `evals/report-conversational.md`:** baseline 13 result vs the 11/13 baseline (call out any regression case by case), new-case results, one fix-and-rerun cycle budgeted if a new case fails for a prompt reason (prompt edits hand-reviewed, main thread). If a baseline case regresses, STOP and fix the prompt before proceeding; the baseline is binding.
- [ ] **Step 6: Commit** `eval: conversational cases (halal, basketball redirect, nut-free honesty, refinement deltas) plus rerun report`

---

### Task 12: Conversational smoke (new spec file)

**Files:**
- Create: `e2e/conversational-smoke.spec.ts` (e2e/demo-smoke.spec.ts stays untouched)

- [ ] **Step 1: Write the spec:**

```ts
import { test, expect } from "@playwright/test";

/**
 * Conversational flows, all in demo mode against the poisoned-key webServer:
 * proves the zero-LLM guarantee holds through the clarification-answer and
 * follow-up-refinement paths.
 */

test.setTimeout(60_000);

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/enter");
  await page.getByLabel("Access code").fill(process.env.SMOKE_ACCESS_CODE ?? "letmein");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL(/\/plan/);
}

test("answer a clarification inline: vague chip, party steppers, merged replan", async ({ page }) => {
  await enter(page);
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Short on details" }).click();
  await page.getByRole("button", { name: "Plan my night" }).click();

  const contractCard = page.locator('section[aria-label="Constraint contract"]');
  await expect(contractCard).toContainText("How many adults and how many children are going?");

  await page.getByLabel("Adults").fill("1");
  await page.getByLabel("Children").fill("2");
  await page.getByRole("button", { name: "Use this" }).click();

  // The merged contract shows the answered party and the question card is gone.
  await expect(contractCard).toContainText("1 adult, 2 children");
  await expect(contractCard).not.toContainText("How many adults");

  const decisionLog = page.locator('section[aria-label="Decision log"]');
  const itineraryList = decisionLog.locator("xpath=following::ol[1]");
  await expect(itineraryList).toBeVisible();

  // The answer reads as a visible constraint_adjusted in the log.
  await expect(decisionLog).toContainText("Added in your follow-up.");
  // No food preference was stated, so the food timing assumption surfaces with provenance.
  await expect(page.locator('section[aria-label="Assumed for this plan"]')).toContainText("assumed");
});

test("follow-up refinement: family plan, quick chip change, diff and history", async ({ page }) => {
  await enter(page);
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Family + gluten-free" }).click();
  await page.getByRole("button", { name: "Plan my night" }).click();

  const decisionLog = page.locator('section[aria-label="Decision log"]');
  const itineraryList = decisionLog.locator("xpath=following::ol[1]");
  await expect(itineraryList).toBeVisible();
  await expect(itineraryList.locator("li", { hasText: "18:15" })).toBeVisible();

  await page.getByRole("button", { name: "Arriving at 6:00 instead" }).click();

  // 18:00 snaps to the 18:12 Lakeshore East train; the transit step is replaced, stable steps keep badges.
  await expect(itineraryList).toContainText("18:12");
  await expect(itineraryList).toContainText(/kept/);
  await expect(itineraryList).toContainText(/replaced|dropped/);

  // The change is logged as a constraint adjustment and remembered in the history thread.
  await expect(decisionLog).toContainText("Updated in your follow-up.");
  await expect(page.locator('section[aria-label="What you have told us"]')).toContainText("Arriving at 6:00 instead");

  // Free text is disabled in demo mode with honest copy.
  await expect(page.locator('section[aria-label="Follow-up"]')).toContainText("quick chips");
});
```

- [ ] **Step 2: Run** `npx playwright test` (both spec files, all green).
- [ ] **Step 3: Full gates. Commit** `test(e2e): conversational smoke for answer-a-clarification and follow-up refinement`

---

### Task 13: MAIN THREAD. Verification pass, BUILDLOG, morning report

- [ ] **Step 1:** Full gates one final time from a clean state: `npx vitest run`, `npm run build`, `npx playwright test`.
- [ ] **Step 2:** Local production walkthrough: `npm run build`, start the built server with the smoke env, walk both conversational flows plus the original scripted sequence in demo mode, capture Playwright screenshots of the clarification card, the answered contract, the assumption row, and a post-refinement diff to the scratchpad for the morning report.
- [ ] **Step 3:** One live end-to-end check (real key via `env -u ANTHROPIC_API_KEY`): the basketball-halal prompt through the real UI. Verify redirect decision, halal chip, assumption behavior, then a free-text follow-up ("actually we arrive at 6").
- [ ] **Step 4:** BUILDLOG.md entry for the session (what shipped, surprises as they happened, eval deltas). Update .superpowers/sdd/progress.md.
- [ ] **Step 5:** Write the morning report (docs/superpowers/2026-07-16-morning-report.md): per-change summary, eval deltas, gate status, and the demo-script recommendation with rationale.
- [ ] **Step 6:** Final commit.

## Execution notes

- Task order is 1 through 13; tasks 6, 11, 13 are main-thread only. Others dispatch to sonnet implementer subagents (model "sonnet" explicitly) with opus review (model "opus") for tasks 1, 2, 3, 5, 7 (deterministic core and route).
- Every subagent gets: the task text verbatim, the Global Constraints block, and the instruction to run the three gates before reporting done.
- If a gate fails in a way that suggests the pinned demo sequence changed, stop and repair before proceeding; never adjust e2e/demo-smoke.spec.ts.
