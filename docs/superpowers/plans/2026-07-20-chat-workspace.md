# Chat Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild /plan as a two-region chat workspace (conversation thread beside a persistent plan panel) composed from the existing SSE TraceEnvelope stream, plus the real-places research card and the July 25 weekend service disruption.

**Architecture:** The existing PlanClient state machine survives nearly intact inside a new PlanWorkspace orchestrator; the page's stacked sections become chat turns composed by a pure function (stream envelopes to turn segments) on the left and the polished plan hero relocated into a sticky panel on the right. No API, schema, or lib/ai changes. Two deterministic-core additions only: one new DisruptionId and one new reduced data fixture with schema, loader, and filter.

**Tech Stack:** Next.js 16 App Router, TS strict, Zod, Tailwind (Lit Sheet tokens), Vitest (+jsdom and @testing-library/react for components), Playwright.

## Global Constraints

- Prod is FROZEN at gameloop-l0vn7tgb3 for the 2026-07-21 demo. Never push, merge, or deploy. All commits stay local on feature/chat-workspace.
- Gates green at every commit: `npx vitest run` (232 passing at baseline, count grows), `npm run build`, `npx playwright test`. playwright.config.ts stays byte-identical (poisoned ANTHROPIC_API_KEY webServer).
- lib/ai is untouched (hand-review only; this plan requires zero changes there). NO_GEOGRAPHY stays intact; the model never sees the real-places data.
- lib/planning is TDD with exact fixtures. The single sanctioned planning addition is the `july25-weekend-service` disruption (Task 1). Nothing else in lib/planning changes.
- Zod at every boundary. The new fixture is validated by a schema at load time.
- No new dependencies. No DECISIONS.md entry needed.
- All time math in normalized minutes; never compare time strings.
- Design invariants: every animation lives in the single `@media (prefers-reduced-motion: no-preference)` block in app/globals.css; dashed borders are exclusive to SIMULATED; provenance badge on every external value; no color-only meaning; AA floors; docs in plain prose without em dashes.
- The real-places card renders research data labeled as such, never model output, and never names the real city.
- Demo mode stays zero-LLM: suggested prompts run the chip path, free text is honestly disabled with the existing copy.
- Subagent policy (CLAUDE.md): sonnet implements from task briefs, opus reviews per wave, model passed explicitly. Waves: 1 = Tasks 1-4, 2 = Tasks 5-10, 3 = Tasks 11, final = Task 12.

## File structure

New files:

| File | Responsibility |
|---|---|
| `lib/planning/disruptions.test.ts` | Tests for the July 25 disruption (written first) |
| `lib/data/realNearbySchema.ts` | Zod schema, evidence tiers, pure `filterRealNearby` (no JSON import, client-safe) |
| `lib/data/realNearbySchema.test.ts` | Schema + filter tests |
| `lib/data/real-nearby.json` | Reduced research fixture (9 weekend-evening-open entries) |
| `lib/data/realNearby.ts` | Server-side loader (imports the JSON) |
| `lib/data/realNearby.test.ts` | Fixture validation and honesty guards |
| `lib/chat/turns.ts` | `ChatTurn` type + pure `composeAssistantTurn` |
| `lib/chat/turns.test.ts` | Envelope-fixture tests |
| `components/ReasoningDisclosure.tsx` | Relocated decision log with the collapse contract |
| `components/ReasoningDisclosure.test.tsx` | Collapse-contract regression tests |
| `components/PartyAnswerForm.tsx` | Steppers + Use this, extracted from ConstraintContract |
| `components/ChatComposer.tsx` | Suggested prompts + quick chips + free text composer |
| `components/ChatComposer.test.tsx` | Composer behavior tests |
| `components/NearbyRealOptions.tsx` | Real-places card |
| `components/NearbyRealOptions.test.tsx` | Card tests incl. nut-free absence |
| `components/UserTurn.tsx` | User bubble |
| `components/AssistantTurn.tsx` | Assistant turn rendering segments |
| `components/AssistantTurn.test.tsx` | Turn rendering tests |
| `components/MessageThread.tsx` | Turn list |
| `components/PlanPanel.tsx` | Panel region (eyebrow, quick actions, hero, real places, memory, reset) |
| `app/plan/PlanWorkspace.tsx` | Orchestrator replacing PlanClient |

Modified: `lib/planning/schemas.ts` (one enum value), `lib/planning/disruptions.ts` (one case), `lib/copy.ts` + `lib/copy.test.ts` (new keys), `components/DisruptionControls.tsx` (new entry + exported list), `app/plan/page.tsx`, `app/globals.css` (one rule inside the motion block), `e2e/demo-smoke.spec.ts`, `e2e/conversational-smoke.spec.ts` (rewritten, Task 11 only).

Deleted in Task 11 (absorbed): `app/plan/PlanClient.tsx`, `components/ActivityPanel.tsx`, `components/ConstraintContract.tsx`, `components/FollowUpComposer.tsx`.

---

### Task 1: July 25 weekend service disruption (TDD)

**Files:**
- Test: `lib/planning/disruptions.test.ts` (create)
- Modify: `lib/planning/schemas.ts:342-348` (DisruptionIdSchema)
- Modify: `lib/planning/disruptions.ts` (new case in applyDisruptions)

**Interfaces:**
- Consumes: `applyDisruptions(input, ids)`, `evaluate(input, options)`, `loadVenue()`, `loadTransit()`, `loadShowcaseGame("2025030413")`.
- Produces: DisruptionId `"july25-weekend-service"`. Effect: removes Lakeshore West transit options whose origin does not include "West Harbour" (models the verified 2026-07-25/26 Exhibition Station construction reduction; UP Express bus replacement is out of model). Lakeshore East untouched.

Grounding (research/2026-07-25-real-data/report.md section 3, all accessed 2026-07-20): Lakeshore West runs every 30 minutes on 2026-07-25/26 for Ontario Line construction at Exhibition, with retimed departures (VERIFIED, two sources); UP Express is replaced by GO buses that weekend (VERIFIED); Lakeshore East is unaffected (confident negative). The fixture models the reduction by keeping only the West Harbour base-service trips on Lakeshore West, which re-snaps an 18:18 arrival from the 18:15 Lakeshore West train to the 18:12 Lakeshore East train.

- [ ] **Step 1: Write the failing tests**

Create `lib/planning/disruptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyDisruptions, PlannerInput } from "./disruptions";
import { evaluate } from "./evaluate";
import { loadTransit, loadVenue } from "../data/load";
import { loadShowcaseGame } from "../data/showcaseGame";
import { PlanRequest } from "./schemas";

const game = loadShowcaseGame("2025030413");

function baseInput(request: PlanRequest): PlannerInput {
  return {
    venue: loadVenue(),
    transitOptions: loadTransit(),
    request,
    game: {
      gameId: game.gameId,
      doorsOpenAt: game.doorsOpenAt,
      warmupStartAt: game.warmupStartAt,
      puckDropAt: game.puckDropAt,
    },
    transitDelayMinutes: 0,
  };
}

const trainAt618: PlanRequest = {
  constraints: [
    {
      type: "arrival",
      value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" },
      priority: "hard",
      sourceText: "train at 6:18",
    },
    {
      type: "party",
      value: { adults: 1, children: 2 },
      priority: "hard",
      sourceText: "me and two kids",
    },
  ],
  clarificationsNeeded: [],
  offTopic: false,
};

describe("july25-weekend-service", () => {
  it("removes non-West-Harbour Lakeshore West trips, keeps all Lakeshore East trips, and never mutates its input", () => {
    const input = baseInput(trainAt618);
    const next = applyDisruptions(input, ["july25-weekend-service"]);

    const lw = next.transitOptions.filter((o) => o.routeId.endsWith("-LW"));
    expect(lw.map((o) => o.scheduledArrival)).toEqual(["17:45:00", "18:45:00"]);
    expect(lw.every((o) => o.origin.includes("West Harbour"))).toBe(true);

    const le = next.transitOptions.filter((o) => o.routeId.endsWith("-LE"));
    expect(le.length).toBe(5);

    expect(input.transitOptions.length).toBe(10);
    expect(next.venue).toEqual(input.venue);
    expect(next.request).toEqual(input.request);
  });

  it("re-snaps an 18:18 train arrival from the 18:15 Lakeshore West to the 18:12 Lakeshore East", () => {
    const base = evaluate(baseInput(trainAt618));
    expect(base.feasible).toBe(true);
    expect(base.plan?.transitArrival).toBe("18:15");
    expect(base.plan?.transitRouteId).toBe("06260926-LW");

    const disrupted = evaluate(baseInput(trainAt618), { disruptions: ["july25-weekend-service"] });
    expect(disrupted.feasible).toBe(true);
    expect(disrupted.plan?.transitArrival).toBe("18:12");
    expect(disrupted.plan?.transitRouteId).toBe("06260926-LE");
  });

  it("reports the transit step as replaced when replanning from the undisrupted prior plan", () => {
    const base = evaluate(baseInput(trainAt618));
    const disrupted = evaluate(baseInput(trainAt618), {
      disruptions: ["july25-weekend-service"],
      priorPlanId: base.plan!.planId,
    });
    expect(
      disrupted.diff?.replacedSteps.some(
        (r) => r.oldStepId.startsWith("transit:") && r.newStepId.startsWith("transit:"),
      ),
    ).toBe(true);
  });

  it("stacks with train-plus-18: the 18:12 Lakeshore East arrival lands at 18:30", () => {
    const both = evaluate(baseInput(trainAt618), {
      disruptions: ["july25-weekend-service", "train-plus-18"],
    });
    expect(both.feasible).toBe(true);
    const transitStep = both.plan?.steps.find((s) => s.kind === "transit");
    expect(transitStep?.clock).toBe("18:30");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/planning/disruptions.test.ts`
Expected: FAIL. TypeScript rejects `"july25-weekend-service"` as a DisruptionId (not in the enum), or at runtime applyDisruptions falls through and arrival stays "18:15".

- [ ] **Step 3: Add the enum value**

In `lib/planning/schemas.ts`, extend DisruptionIdSchema:

```ts
export const DisruptionIdSchema = z.enum([
  "train-plus-18",
  "gate1-wait-22",
  "gf-stand-closed",
  "milestone-puck-drop",
  "add-accessibility",
  "july25-weekend-service",
]);
```

- [ ] **Step 4: Add the applyDisruptions case**

In `lib/planning/disruptions.ts`, inside the `switch (d)` before the closing brace:

```ts
      case "july25-weekend-service": {
        // The verified 2026-07-25/26 weekend: Ontario Line construction at
        // Exhibition reduces Lakeshore West service (UP Express is replaced
        // by GO buses that weekend and is not modeled in this snapshot).
        // Modeled as Lakeshore West dropping to its West Harbour base
        // trips; Lakeshore East is unaffected per the same research pass.
        // Source: research/2026-07-25-real-data/report.md section 3.
        next.transitOptions = next.transitOptions.filter(
          (o) => !o.routeId.endsWith("-LW") || o.origin.includes("West Harbour"),
        );
        break;
      }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/planning/disruptions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Full gates, then commit**

Run: `npx vitest run` (expect 236), `npm run build`, `npx playwright test` (expect 3 passed).

```bash
git add lib/planning/schemas.ts lib/planning/disruptions.ts lib/planning/disruptions.test.ts
git commit -m "feat(planning): july25-weekend-service disruption, tests first"
```

---

### Task 2: real-nearby schema and dietary filter (TDD)

**Files:**
- Create: `lib/data/realNearbySchema.ts`
- Test: `lib/data/realNearbySchema.test.ts`

**Interfaces:**
- Consumes: `DietaryNeedSchema`, `DietaryNeed` from `@/lib/planning/schemas` (read only).
- Produces: `EvidenceTierSchema` / `EvidenceTier` ("certified" | "self-described" | "friendly"), `RealNearbyEntrySchema` / `RealNearbyEntry`, `RealNearbyFileSchema`, `UNVERIFIABLE_NEEDS`, `RealNearbySelection`, `filterRealNearby(entries, needs)`. This module never imports the JSON so client bundles that import the filter never pull the fixture.

- [ ] **Step 1: Write the failing tests**

Create `lib/data/realNearbySchema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  filterRealNearby,
  RealNearbyEntry,
  RealNearbyEntrySchema,
  UNVERIFIABLE_NEEDS,
} from "./realNearbySchema";

function entry(over: Partial<RealNearbyEntry> & { id: string }): RealNearbyEntry {
  return RealNearbyEntrySchema.parse({
    name: over.id,
    rating: { value: 4.0, source: "Tripadvisor", reviewNote: "test note" },
    walkMinutes: 5,
    priceLevel: "$$",
    openWeekendEvenings: true,
    iconic: false,
    evidence: [],
    sourceUrl: "https://example.com/",
    accessedAt: "2026-07-20",
    source: "research-notes",
    ...over,
  });
}

describe("RealNearbyEntrySchema", () => {
  it("accepts a complete entry and an entry with no rating", () => {
    expect(() => entry({ id: "a" })).not.toThrow();
    expect(() => entry({ id: "b", rating: undefined })).not.toThrow();
  });

  it("rejects an unknown evidence tier and a bad accessed date", () => {
    expect(() =>
      entry({
        id: "c",
        evidence: [{ need: "halal", tier: "verified" as never, line: "x" }],
      }),
    ).toThrow();
    expect(() => entry({ id: "d", accessedAt: "July 20" })).toThrow();
  });
});

describe("filterRealNearby", () => {
  const wvrst = entry({
    id: "wvrst",
    name: "WVRST",
    walkMinutes: 5,
    evidence: [{ need: "gluten-free", tier: "friendly", line: "dedicated fryer" }],
  });
  const paramount = entry({
    id: "paramount",
    name: "Paramount",
    walkMinutes: 5,
    evidence: [{ need: "halal", tier: "certified", line: "HMA directory" }],
  });
  const union = entry({
    id: "union-chicken",
    name: "Union Chicken",
    walkMinutes: 5,
    evidence: [{ need: "halal", tier: "self-described", line: "own claim" }],
  });
  const fresh = entry({
    id: "fresh",
    name: "Fresh Kitchen",
    walkMinutes: 13,
    evidence: [
      { need: "vegetarian", tier: "self-described", line: "fully vegan" },
      { need: "vegan", tier: "self-described", line: "fully vegan" },
    ],
  });
  const realSports = entry({ id: "real-sports", name: "Real Sports", walkMinutes: 2, iconic: true });
  const steam = entry({ id: "steam", name: "Steam Whistle", walkMinutes: 8, iconic: true });
  const blondies = entry({ id: "blondies", name: "Blondies", walkMinutes: 6, iconic: true });
  const closedSat = entry({ id: "closed", name: "Closed Sat", openWeekendEvenings: false, iconic: true, walkMinutes: 1 });
  const all = [wvrst, paramount, union, fresh, realSports, steam, blondies, closedSat];

  it("nut-free and dairy-free render the honest absence, never options", () => {
    expect(UNVERIFIABLE_NEEDS).toEqual(["nut-free", "dairy-free"]);
    expect(filterRealNearby(all, ["nut-free"])).toEqual({ kind: "absence", need: "nut-free" });
    expect(filterRealNearby(all, ["gluten-free", "nut-free"])).toEqual({ kind: "absence", need: "nut-free" });
    expect(filterRealNearby(all, ["dairy-free"])).toEqual({ kind: "absence", need: "dairy-free" });
  });

  it("no dietary needs: the iconic picks, nearest first, never weekend-closed entries", () => {
    const sel = filterRealNearby(all, []);
    expect(sel.kind).toBe("options");
    if (sel.kind === "options") {
      expect(sel.picks.map((p) => p.id)).toEqual(["real-sports", "blondies", "steam"]);
    }
  });

  it("gluten-free picks entries with gluten-free evidence", () => {
    const sel = filterRealNearby(all, ["gluten-free"]);
    if (sel.kind === "options") expect(sel.picks.map((p) => p.id)).toEqual(["wvrst"]);
  });

  it("halal picks both tiers, nearest first then name", () => {
    const sel = filterRealNearby(all, ["halal"]);
    if (sel.kind === "options") expect(sel.picks.map((p) => p.id)).toEqual(["paramount", "union-chicken"]);
  });

  it("vegetarian includes the borderline-walk fully vegan option", () => {
    const sel = filterRealNearby(all, ["vegetarian"]);
    if (sel.kind === "options") expect(sel.picks.map((p) => p.id)).toEqual(["fresh"]);
  });

  it("a need with no matching entries degrades to the absence statement", () => {
    const sel = filterRealNearby([realSports], ["halal"]);
    expect(sel).toEqual({ kind: "absence", need: "halal" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/data/realNearbySchema.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the schema and filter**

Create `lib/data/realNearbySchema.ts`:

```ts
import { z } from "zod";
import { DietaryNeed, DietaryNeedSchema } from "../planning/schemas";

/**
 * Reduced research fixture schema for the real-places card. Authored from
 * research/2026-07-25-real-data/candidates.json; UI-only data, never fed to
 * the planner or the model. The three evidence tiers follow the research
 * ground rules: "certified" only when a named, checkable certifier is on
 * record for the exact outlet; "self-described" for a restaurant's own
 * claim; "friendly" for partial-menu or good-practice claims.
 */
export const EvidenceTierSchema = z.enum(["certified", "self-described", "friendly"]);
export type EvidenceTier = z.infer<typeof EvidenceTierSchema>;

export const RealNearbyEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Absent when the research pass did not capture a star value. */
  rating: z
    .object({
      value: z.number().min(0).max(5),
      source: z.string().min(1),
      reviewNote: z.string().min(1),
    })
    .optional(),
  /** Estimated from the published address, not a mapping API. */
  walkMinutes: z.number().int().positive(),
  priceLevel: z.enum(["$", "$$", "$$$"]),
  /** Confirmed open through a Saturday/Sunday pre-game evening window. */
  openWeekendEvenings: z.boolean(),
  /** Well-known quick pre-game anchor; used when no dietary need filters. */
  iconic: z.boolean(),
  evidence: z.array(
    z.object({ need: DietaryNeedSchema, tier: EvidenceTierSchema, line: z.string().min(1) }),
  ),
  sourceUrl: z.string().url(),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.literal("research-notes"),
});
export type RealNearbyEntry = z.infer<typeof RealNearbyEntrySchema>;

export const RealNearbyFileSchema = z.object({
  generatedFrom: z.string().min(1),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(RealNearbyEntrySchema).min(1),
});

/**
 * Needs the research pass found no verifiable evidence for at any candidate
 * restaurant. The card must render an honest absence statement for these,
 * never a list of options.
 */
export const UNVERIFIABLE_NEEDS: DietaryNeed[] = ["nut-free", "dairy-free"];

export type RealNearbySelection =
  | { kind: "options"; picks: RealNearbyEntry[] }
  | { kind: "absence"; need: DietaryNeed };

/**
 * Deterministic pick of two or three entries for the card. Weekend-closed
 * entries never surface. Any unverifiable need forces the absence statement.
 * With needs: entries covering more of the needs win, then shorter walk,
 * then name. Without needs: the iconic picks, nearest first.
 */
export function filterRealNearby(entries: RealNearbyEntry[], needs: DietaryNeed[]): RealNearbySelection {
  const open = entries.filter((e) => e.openWeekendEvenings);
  const absent = needs.find((n) => UNVERIFIABLE_NEEDS.includes(n));
  if (absent) return { kind: "absence", need: absent };

  if (needs.length === 0) {
    const picks = open
      .filter((e) => e.iconic)
      .sort((a, b) => a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name))
      .slice(0, 3);
    if (picks.length === 0 && open.length > 0) {
      return { kind: "options", picks: open.slice(0, 3) };
    }
    return { kind: "options", picks };
  }

  const coverage = (e: RealNearbyEntry) => needs.filter((n) => e.evidence.some((ev) => ev.need === n)).length;
  const picks = open
    .filter((e) => coverage(e) > 0)
    .sort(
      (a, b) =>
        coverage(b) - coverage(a) || a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name),
    )
    .slice(0, 3);
  if (picks.length === 0) return { kind: "absence", need: needs[0]! };
  return { kind: "options", picks };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/data/realNearbySchema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Full gates, then commit**

Run: `npx vitest run`, `npm run build`, `npx playwright test`.

```bash
git add lib/data/realNearbySchema.ts lib/data/realNearbySchema.test.ts
git commit -m "feat(data): real-nearby schema, evidence tiers, dietary filter"
```

---

### Task 3: real-nearby fixture and loader

**Files:**
- Create: `lib/data/real-nearby.json`
- Create: `lib/data/realNearby.ts`
- Test: `lib/data/realNearby.test.ts`

**Interfaces:**
- Consumes: `RealNearbyFileSchema` from Task 2.
- Produces: `loadRealNearby(): RealNearbyEntry[]` (server-side only, mirrors the loadVenue pattern in lib/data/load.ts; kept in its own module like showcaseGame.ts so the JSON never enters a client bundle through an unrelated import).

Fixture policy: only weekend-evening-open candidates from research/2026-07-25-real-data/candidates.json (the research showed Financial District counters closed weekends; Sultan's, Kupfert & Kim, Amano, Holy Cow, Sumaq, Byblos are excluded as closed, out of radius, or unretrieved hours). Evidence lines are hand-written honest summaries. No entry ever carries nut-free or dairy-free evidence.

- [ ] **Step 1: Write the failing tests**

Create `lib/data/realNearby.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/data/realNearby.test.ts`
Expected: FAIL (module and fixture do not exist).

- [ ] **Step 3: Author the fixture**

Create `lib/data/real-nearby.json` with exactly this content:

```json
{
  "generatedFrom": "research/2026-07-25-real-data/candidates.json",
  "accessedAt": "2026-07-20",
  "entries": [
    {
      "id": "union-chicken",
      "name": "Union Chicken",
      "rating": { "value": 3.6, "source": "Tripadvisor", "reviewNote": "ranked about 1,229 of 5,810 Toronto-area listings; a separate Yelp listing shows 177 reviews" },
      "walkMinutes": 5,
      "priceLevel": "$$",
      "openWeekendEvenings": true,
      "iconic": false,
      "evidence": [
        { "need": "halal", "tier": "self-described", "line": "Serves halal fried and rotisserie chicken by its own description; no third-party certifier named in any source found." }
      ],
      "sourceUrl": "https://www.unionchicken.com/union-station",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    },
    {
      "id": "paramount-fine-foods",
      "name": "Paramount Fine Foods (Union Station)",
      "rating": { "value": 3.6, "source": "Tripadvisor", "reviewNote": "ranked about 1,692 of 5,797 listings; reviews split on busy-day service" },
      "walkMinutes": 5,
      "priceLevel": "$$",
      "openWeekendEvenings": true,
      "iconic": false,
      "evidence": [
        { "need": "halal", "tier": "certified", "line": "The Halal Monitoring Authority (HMA) lists this exact outlet on its own certified directory; certificate text was not re-confirmed, so treat this as the certifier's listing, not a hard guarantee." }
      ],
      "sourceUrl": "https://hmacanada.org/paramount-fine-foods-union-station/",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    },
    {
      "id": "wvrst",
      "name": "WVRST (Union Station)",
      "rating": { "value": 4.3, "source": "Restaurant Guru", "reviewNote": "1,606 reviews; a Google rating around 4.4 was cited separately" },
      "walkMinutes": 5,
      "priceLevel": "$$",
      "openWeekendEvenings": true,
      "iconic": false,
      "evidence": [
        { "need": "gluten-free", "tier": "friendly", "line": "All sausages reported gluten-free and the fries get a dedicated fryer, a documented good practice; not a dedicated gluten-free kitchen, and buns are not gluten-free." }
      ],
      "sourceUrl": "https://torontounion.ca/locations/wvrst/",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    },
    {
      "id": "venezolano",
      "name": "Venezolano (Union Station)",
      "rating": { "value": 4.5, "source": "delivery-platform aggregator", "reviewNote": "delivery-app ratings tend to skew high; weigh lightly" },
      "walkMinutes": 5,
      "priceLevel": "$$",
      "openWeekendEvenings": true,
      "iconic": false,
      "evidence": [
        { "need": "gluten-free", "tier": "friendly", "line": "Corn arepas make most of the menu naturally gluten-free and staff are described as cross-contact aware; explicitly not a dedicated gluten-free facility." }
      ],
      "sourceUrl": "https://torontounion.ca/locations/venezolano/",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    },
    {
      "id": "fresh-kitchen-front",
      "name": "Fresh Kitchen + Juice Bar (Front)",
      "walkMinutes": 13,
      "priceLevel": "$$",
      "openWeekendEvenings": true,
      "iconic": false,
      "evidence": [
        { "need": "vegetarian", "tier": "self-described", "line": "Fully vegan by concept: nothing on the menu contains meat, dairy, or eggs, the cleanest claim in the research pass. Walk runs a few minutes past the usual radius." },
        { "need": "vegan", "tier": "self-described", "line": "Fully vegan by concept: nothing on the menu contains meat, dairy, or eggs, the cleanest claim in the research pass. Walk runs a few minutes past the usual radius." }
      ],
      "sourceUrl": "https://www.freshkitchens.ca/en/locations/on/toronto/47-front-street-east",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    },
    {
      "id": "bangkok-buri",
      "name": "Bangkok Buri (Union Station food court)",
      "rating": { "value": 3.4, "source": "Tripadvisor", "reviewNote": "ranked about 3,650 of 5,757 listings; closes 19:00 weekend evenings, pre-game only" },
      "walkMinutes": 5,
      "priceLevel": "$$",
      "openWeekendEvenings": true,
      "iconic": false,
      "evidence": [
        { "need": "vegetarian", "tier": "friendly", "line": "Sauces reported vegan with tofu and vegetable swaps available; a vegetarian-friendly menu in a shared kitchen, not a vegetarian restaurant." },
        { "need": "vegan", "tier": "friendly", "line": "Sauces reported vegan with tofu and vegetable swaps available; a vegetarian-friendly menu in a shared kitchen, not a vegetarian restaurant." }
      ],
      "sourceUrl": "https://www.findmeglutenfree.com/biz/bangkok-buri/4734032275963904",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    },
    {
      "id": "real-sports",
      "name": "Real Sports Bar & Grill",
      "rating": { "value": 4.9, "source": "Restaurant Guru", "reviewNote": "9,133 reviews, the highest volume in the research pass; a separate Yelp listing shows 575" },
      "walkMinutes": 2,
      "priceLevel": "$$$",
      "openWeekendEvenings": true,
      "iconic": true,
      "evidence": [
        { "need": "gluten-free", "tier": "friendly", "line": "Named gluten-free items exist, but an allergy-tracking source states it is not a dedicated gluten-free facility and warns of fryer cross-contact." }
      ],
      "sourceUrl": "https://www.realsports.ca/",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    },
    {
      "id": "steam-whistle",
      "name": "Steam Whistle Kitchen (at the Roundhouse)",
      "rating": { "value": 4.6, "source": "Google (cited)", "reviewNote": "Restaurant Guru shows 4.8 with 4,070 reviews, two sources broadly agreeing" },
      "walkMinutes": 8,
      "priceLevel": "$$",
      "openWeekendEvenings": true,
      "iconic": true,
      "evidence": [],
      "sourceUrl": "https://steamwhistle.ca/pages/kitchen",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    },
    {
      "id": "blondies-pizza",
      "name": "Blondies Pizza (Union Station)",
      "rating": { "value": 4.0, "source": "Tripadvisor", "reviewNote": "review count not separately captured" },
      "walkMinutes": 6,
      "priceLevel": "$",
      "openWeekendEvenings": true,
      "iconic": true,
      "evidence": [],
      "sourceUrl": "https://union.blondiespizza.ca/",
      "accessedAt": "2026-07-20",
      "source": "research-notes"
    }
  ]
}
```

- [ ] **Step 4: Write the loader**

Create `lib/data/realNearby.ts`:

```ts
import realNearbyJson from "./real-nearby.json";
import { RealNearbyEntry, RealNearbyFileSchema } from "./realNearbySchema";

/**
 * Server-side loader for the real-places research fixture, validated at the
 * boundary like every other fixture. Lives in its own module (the
 * showcaseGame.ts precedent) so the JSON never reaches a client bundle
 * through an unrelated lib/data import; the /plan page passes the parsed
 * entries down as props.
 */
export function loadRealNearby(): RealNearbyEntry[] {
  return RealNearbyFileSchema.parse(realNearbyJson).entries;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run lib/data/realNearby.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Full gates, then commit**

```bash
git add lib/data/real-nearby.json lib/data/realNearby.ts lib/data/realNearby.test.ts
git commit -m "feat(data): real-nearby fixture from July 25 research, loader"
```

---

### Task 4: copy additions

**Files:**
- Modify: `lib/copy.ts`
- Modify: `lib/copy.test.ts`

**Interfaces:**
- Consumes: `EvidenceTier` from `@/lib/data/realNearbySchema` (type-only, no JSON pulled).
- Produces: `COPY.suggestedPromptsLabel`, `COPY.composerFreshPlaceholder`, `COPY.turnPlanReady(hero?)`, `COPY.turnInfeasible`, `COPY.jumpToPlan`, `COPY.realNearbyHeading`, `COPY.realNearbyLead`, `COPY.realNearbyWalkNote`, `COPY.realNearbyAbsence(need)`, `COPY.evidenceTierLabel(tier)`. Existing keys unchanged (followUpDemoNote, followUpPlaceholder, followUpSend, decisionLogSummary, heroSentence all stay verbatim; historyHeading stays in place even though its section dies in Task 11, removal happens there).

- [ ] **Step 1: Write the failing tests**

Append to `lib/copy.test.ts` (keep every existing test):

```ts
describe("chat workspace copy", () => {
  it("turnPlanReady echoes the hero sentence and degrades without one", () => {
    expect(COPY.turnPlanReady("In by 18:40, seated before warmups.")).toBe(
      "Tonight's plan is ready. In by 18:40, seated before warmups.",
    );
    expect(COPY.turnPlanReady(undefined)).toBe(
      "Tonight's plan is ready. Details in the plan panel.",
    );
  });

  it("realNearbyAbsence names the need and points at the venue confirmation pattern", () => {
    const s = COPY.realNearbyAbsence("nut-free");
    expect(s).toContain("nut-free");
    expect(s).toContain("confirm directly with the restaurant");
  });

  it("the real-places lead disclaims planner involvement and never names the real city", () => {
    expect(COPY.realNearbyLead).toContain("research notes");
    expect(COPY.realNearbyLead).toContain("planner does not choose");
    expect(COPY.realNearbyLead).not.toMatch(/Toronto|Scotiabank|Union Station/);
  });

  it("evidence tier labels are the tier words in caps", () => {
    expect(COPY.evidenceTierLabel("certified")).toBe("CERTIFIED");
    expect(COPY.evidenceTierLabel("self-described")).toBe("SELF-DESCRIBED");
    expect(COPY.evidenceTierLabel("friendly")).toBe("FRIENDLY");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/copy.test.ts`
Expected: FAIL (missing keys).

- [ ] **Step 3: Implement**

In `lib/copy.ts`, add the import and a tier map above COPY:

```ts
import { EvidenceTier } from "@/lib/data/realNearbySchema";

const EVIDENCE_TIER_LABEL: Record<EvidenceTier, string> = {
  certified: "CERTIFIED",
  "self-described": "SELF-DESCRIBED",
  friendly: "FRIENDLY",
};
```

Add inside the COPY object (before the closing `} as const`):

```ts
  /** Chat workspace. The composer label before any plan exists. */
  suggestedPromptsLabel: "Try one of these",
  composerFreshPlaceholder:
    "e.g. We're a family of four, need gluten-free food, and want to be seated before warmups.",
  /** Assistant confirmation closing a plan turn, echoing the hero sentence. */
  turnPlanReady: (hero?: string): string =>
    hero ? `Tonight's plan is ready. ${hero}` : "Tonight's plan is ready. Details in the plan panel.",
  turnInfeasible:
    "This request cannot be satisfied as stated. The closest feasible alternative is in the plan panel.",
  jumpToPlan: "Jump to plan",
  /**
   * Real-places card. Hand-written UI copy, never model output: the card
   * names real restaurants while the model prompts' NO_GEOGRAPHY rule stays
   * intact, so this copy must never name the real city or venue either.
   */
  realNearbyHeading: "Real places near the arena",
  realNearbyLead:
    "Real restaurants from research notes, near the real station this demo's fictional arena stands in for. Shown for reference; the planner does not choose or rank them.",
  realNearbyWalkNote: "Walk times are estimates from published addresses, not a mapping service.",
  realNearbyAbsence: (need: string): string =>
    `No researched restaurant near the arena has a verifiable ${need} policy. Cross-contact information is unavailable; confirm directly with the restaurant.`,
  evidenceTierLabel: (tier: EvidenceTier): string => EVIDENCE_TIER_LABEL[tier],
```

- [ ] **Step 4: Run to verify pass, full gates, commit**

Run: `npx vitest run lib/copy.test.ts`, then `npx vitest run`, `npm run build`, `npx playwright test`.

```bash
git add lib/copy.ts lib/copy.test.ts
git commit -m "feat(copy): chat workspace and real-places strings"
```

---

### Task 5: turn composition (TDD)

**Files:**
- Create: `lib/chat/turns.ts`
- Test: `lib/chat/turns.test.ts`

**Interfaces:**
- Consumes: `TraceEnvelope`, `PlanResult` from `@/lib/planning/schemas`.
- Produces: `TurnStatus`, `ChatTurn { id: number; userText: string; envelopes: TraceEnvelope[]; streamText: string; status: TurnStatus }`, `AssistantSegments`, `composeAssistantTurn(envelopes): AssistantSegments`. Consumed by AssistantTurn (Task 9) and PlanWorkspace (Task 11).

Composition rules, derived from the exact emission order in app/api/plan/route.ts:
- logEnvelopes: every envelope except response_chunk (the reasoning rows).
- redirect: the first decision whose summary starts with "You asked about " (the server's redirectSummary shape; locked by fixture).
- adjustments: every constraint_adjusted.
- assumptions: every assumption_made.
- clarification: the last request_parsed's first clarificationsNeeded entry (the server only emits blocking party clarifications there).
- planResult: the last plan_result's result.
- errorMessage: the last error event's message.
- body: the last non-redirect decision summary, but only when there is no plan_result, no error, and no clarification (those three carry their own rendering; when a plan lands the narrative streamText is the body and is handled by the component).

- [ ] **Step 1: Write the failing tests**

Create `lib/chat/turns.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PlanResult, TraceEnvelope, TraceEvent } from "../planning/schemas";
import { composeAssistantTurn } from "./turns";

function envelopes(events: TraceEvent[]): TraceEnvelope[] {
  return events.map((event, seq) => ({ v: 1, requestId: "req-1", seq, event }));
}

const feasibleResult: PlanResult = {
  feasible: true,
  violations: [],
  adjustments: [],
  candidateStats: { evaluated: 10, feasible: 4 },
};

describe("composeAssistantTurn", () => {
  it("plan stream: adjustments and assumptions surface, log excludes chunks, no body", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "request_parsed", constraints: [], clarificationsNeeded: [] },
        { type: "constraint_adjusted", field: "arrival", requested: "6:18", resolved: "18:15 (Lakeshore West)", reason: "No scheduled arrival at 18:18; nearest real GO arrival, GTFS snapshot 2026-07-07" },
        { type: "candidates_summary", evaluated: 10, feasible: 4 },
        { type: "assumption_made", field: "food_timing", assumed: "food gets picked up on the way to your seats", reason: "No food timing preference was given. Tell us if you want it the other way." },
        { type: "decision", summary: "Selected Gate 3, arriving 18:15, food pickup en route." },
        { type: "plan_result", result: feasibleResult },
        { type: "response_chunk", text: "Here is the plan. " },
        { type: "response_chunk", text: "It works." },
        { type: "done" },
      ]),
    );
    expect(seg.planResult).toEqual(feasibleResult);
    expect(seg.adjustments).toHaveLength(1);
    expect(seg.adjustments[0]!.requested).toBe("6:18");
    expect(seg.assumptions).toHaveLength(1);
    expect(seg.body).toBeUndefined();
    expect(seg.clarification).toBeUndefined();
    expect(seg.redirect).toBeUndefined();
    expect(seg.logEnvelopes).toHaveLength(8);
    expect(seg.logEnvelopes.every((e) => e.event.type !== "response_chunk")).toBe(true);
  });

  it("clarification stream: the question surfaces as a bubble, not as body text", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "request_parsed", constraints: [], clarificationsNeeded: [{ field: "party", question: "How many adults and how many children are going?" }] },
        { type: "decision", summary: "Need one answer before planning: How many adults and how many children are going?" },
        { type: "done" },
      ]),
    );
    expect(seg.clarification).toEqual({ field: "party", question: "How many adults and how many children are going?" });
    expect(seg.body).toBeUndefined();
    expect(seg.planResult).toBeUndefined();
  });

  it("redirect stream: the honest redirect line is separated from the decisions", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "request_parsed", constraints: [], clarificationsNeeded: [] },
        { type: "decision", summary: "You asked about the Raptors. Tonight Harbourview Arena hosts hockey: Vegas Golden Knights versus Carolina Hurricanes, puck drop 19:30. Planning your night around it." },
        { type: "plan_result", result: feasibleResult },
        { type: "done" },
      ]),
    );
    expect(seg.redirect).toContain("You asked about the Raptors.");
    expect(seg.body).toBeUndefined();
  });

  it("terminal decision stream: the demo refusal becomes the turn body", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "decision", summary: "Demo mode runs without model calls, so free-text changes are disabled here. Use the quick chips, or run live to type a change." },
        { type: "done" },
      ]),
    );
    expect(seg.body).toContain("Demo mode runs without model calls");
    expect(seg.planResult).toBeUndefined();
  });

  it("error stream: the message surfaces and suppresses the body", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "error", message: "Could not read that request. Try rephrasing in a sentence or two." },
      ]),
    );
    expect(seg.errorMessage).toContain("Could not read that request");
    expect(seg.body).toBeUndefined();
  });

  it("refinement stream: follow-up adjustments ride along", () => {
    const seg = composeAssistantTurn(
      envelopes([
        { type: "decision", summary: "Reading your request." },
        { type: "request_parsed", constraints: [], clarificationsNeeded: [] },
        { type: "constraint_adjusted", field: "party", requested: "not set", resolved: "1 adult, 2 children", reason: "Added in your follow-up." },
        { type: "plan_result", result: feasibleResult },
        { type: "done" },
      ]),
    );
    expect(seg.adjustments[0]!.reason).toBe("Added in your follow-up.");
    expect(seg.clarification).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/chat/turns.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement**

Create `lib/chat/turns.ts`:

```ts
import { PlanResult, TraceEnvelope } from "../planning/schemas";

/** Mirrors components/useTraceStream's TraceStreamStatus without importing a client module into lib. */
export type TurnStatus = "idle" | "streaming" | "stalled" | "done" | "error";

/** One user request and the assistant activity it produced. Frozen for past turns; the live turn re-renders as frames land. */
export interface ChatTurn {
  id: number;
  userText: string;
  envelopes: TraceEnvelope[];
  streamText: string;
  status: TurnStatus;
}

export interface TurnAdjustment {
  field: string;
  requested: string;
  resolved: string;
  reason: string;
}
export interface TurnAssumption {
  field: string;
  assumed: string;
  reason: string;
}
export interface TurnClarification {
  field: string;
  question: string;
}

export interface AssistantSegments {
  /** The honest event-mismatch redirect line, rendered at the top of the turn. */
  redirect?: string;
  adjustments: TurnAdjustment[];
  assumptions: TurnAssumption[];
  /** Blocking question; renders as a question bubble with inline steppers. */
  clarification?: TurnClarification;
  /** Terminal decision text for streams that end without a plan, an error, or a question. */
  body?: string;
  planResult?: PlanResult;
  errorMessage?: string;
  /** Everything except response_chunk, for the reasoning disclosure. */
  logEnvelopes: TraceEnvelope[];
}

const REDIRECT_PREFIX = "You asked about ";

/**
 * Pure composition of one assistant turn from its stream envelopes. The rules
 * mirror app/api/plan/route.ts's emission order; the narrative streamText is
 * handled by the caller (it is separate accumulator state, not an envelope).
 */
export function composeAssistantTurn(envelopes: TraceEnvelope[]): AssistantSegments {
  const logEnvelopes = envelopes.filter((e) => e.event.type !== "response_chunk");
  const adjustments: TurnAdjustment[] = [];
  const assumptions: TurnAssumption[] = [];
  let redirect: string | undefined;
  let clarification: TurnClarification | undefined;
  let planResult: PlanResult | undefined;
  let errorMessage: string | undefined;
  let lastDecision: string | undefined;

  for (const { event } of envelopes) {
    switch (event.type) {
      case "request_parsed":
        clarification = event.clarificationsNeeded[0];
        break;
      case "constraint_adjusted":
        adjustments.push({
          field: event.field,
          requested: event.requested,
          resolved: event.resolved,
          reason: event.reason,
        });
        break;
      case "assumption_made":
        assumptions.push({ field: event.field, assumed: event.assumed, reason: event.reason });
        break;
      case "decision":
        if (redirect === undefined && event.summary.startsWith(REDIRECT_PREFIX)) {
          redirect = event.summary;
        } else {
          lastDecision = event.summary;
        }
        break;
      case "plan_result":
        planResult = event.result;
        break;
      case "error":
        errorMessage = event.message;
        break;
      default:
        break;
    }
  }

  const body =
    planResult === undefined && errorMessage === undefined && clarification === undefined
      ? lastDecision
      : undefined;

  return { redirect, adjustments, assumptions, clarification, body, planResult, errorMessage, logEnvelopes };
}
```

- [ ] **Step 4: Run to verify pass, full gates, commit**

Run: `npx vitest run lib/chat/turns.test.ts` (6 tests), then all three gates.

```bash
git add lib/chat/turns.ts lib/chat/turns.test.ts
git commit -m "feat(chat): pure turn composition from trace envelopes"
```

---

### Task 6: ReasoningDisclosure (relocated decision log)

**Files:**
- Create: `components/ReasoningDisclosure.tsx`
- Test: `components/ReasoningDisclosure.test.tsx`
- Reference (do not modify yet): `components/ActivityPanel.tsx`

**Interfaces:**
- Consumes: `TraceEnvelope`, `TraceEvent` from schemas, `TraceStreamStatus` from `./useTraceStream`, `COPY`, `SourceBadge`.
- Produces: `ReasoningDisclosure({ envelopes, status, onRetry? })`. The exact collapse contract from ActivityPanel: open while streaming, auto-fold to the "Plan built from N signals · View reasoning" summary on done, manual toggle wins until the next fresh stream. The streamText paragraph is NOT carried over (narrative is the turn body now). Section aria-label is "Reasoning". CSS classes log-details, log-summary, log-details-body, log-list, log-row are kept so globals.css motion and the spine keep working.

- [ ] **Step 1: Write the failing tests**

Create `components/ReasoningDisclosure.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceEnvelope } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";
import { ReasoningDisclosure } from "./ReasoningDisclosure";

const envelopes: TraceEnvelope[] = [
  { v: 1, requestId: "r1", seq: 0, event: { type: "decision", summary: "Reading your request." } },
];

function details(container: HTMLElement): HTMLDetailsElement {
  return container.querySelector("details.log-details") as HTMLDetailsElement;
}

describe("ReasoningDisclosure collapse contract", () => {
  it("opens while streaming and auto-folds to the signals summary when done", () => {
    const { container, rerender } = render(
      <ReasoningDisclosure envelopes={envelopes} status="streaming" />,
    );
    expect(details(container).open).toBe(true);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
    expect(container.textContent).toContain(COPY.decisionLogSummary(1));
  });

  it("a manual toggle wins over the auto-fold until the next fresh stream", () => {
    const { container, rerender } = render(
      <ReasoningDisclosure envelopes={envelopes} status="streaming" />,
    );
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    fireEvent.click(container.querySelector("summary")!);
    expect(details(container).open).toBe(true);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(true);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="streaming" />);
    expect(details(container).open).toBe(true);
    rerender(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
  });

  it("mounts collapsed for an already-completed turn", () => {
    const { container } = render(<ReasoningDisclosure envelopes={envelopes} status="done" />);
    expect(details(container).open).toBe(false);
  });

  it("shows Retry only for stalled or error states", () => {
    const { queryByRole, rerender } = render(
      <ReasoningDisclosure envelopes={envelopes} status="streaming" onRetry={() => {}} />,
    );
    expect(queryByRole("button", { name: "Retry" })).toBeNull();
    rerender(<ReasoningDisclosure envelopes={envelopes} status="stalled" onRetry={() => {}} />);
    expect(queryByRole("button", { name: "Retry" })).not.toBeNull();
    rerender(<ReasoningDisclosure envelopes={envelopes} status="error" onRetry={() => {}} />);
    expect(queryByRole("button", { name: "Retry" })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/ReasoningDisclosure.test.tsx`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement**

Create `components/ReasoningDisclosure.tsx`. Copy from `components/ActivityPanel.tsx` verbatim: STATUS_MESSAGE, EVENT_TITLE, VERDICT_TYPES, formatElapsed, EventBody, FaceoffDot, EventCard (all unchanged). Then the exported component, which is ActivityPanel with the streamText paragraph removed, `events` renamed `envelopes`, initial open state aware of already-done turns, and the section relabeled:

```tsx
export function ReasoningDisclosure({
  envelopes,
  status,
  onRetry,
}: {
  envelopes: TraceEnvelope[];
  status: TraceStreamStatus;
  onRetry?: () => void;
}) {
  // Ledger clock: stamp each envelope with its client arrival time relative
  // to the first frame of its request. Write-once per key, so the render-time
  // ref mutation is idempotent (StrictMode-safe). This is a UI measurement of
  // stream arrival, not an external data value.
  const arrivalsRef = useRef<Map<string, number>>(new Map());
  const startsRef = useRef<Map<string, number>>(new Map());
  if (typeof performance !== "undefined") {
    for (const envelope of envelopes) {
      const key = `${envelope.requestId}:${envelope.seq}`;
      if (!arrivalsRef.current.has(key)) {
        if (!startsRef.current.has(envelope.requestId)) {
          startsRef.current.set(envelope.requestId, performance.now());
        }
        arrivalsRef.current.set(key, performance.now() - startsRef.current.get(envelope.requestId)!);
      }
    }
  }

  const cardEvents = envelopes.filter((e) => e.event.type !== "response_chunk");
  const lastEnvelope = cardEvents.at(-1);
  const lastSeq = lastEnvelope?.seq ?? -1;
  const totalMs = lastEnvelope
    ? arrivalsRef.current.get(`${lastEnvelope.requestId}:${lastEnvelope.seq}`)
    : undefined;

  // Open while the trace streams in, auto-collapse once it completes. A
  // manual toggle wins over that default for the rest of this turn; the next
  // fresh stream (a retry, or this component re-mounted for a new live turn)
  // clears the override and starts the cycle over. A turn that mounts
  // already completed starts folded to its signals summary.
  const [open, setOpen] = useState(status === "streaming");
  const userToggledRef = useRef(false);
  const prevStatusRef = useRef<TraceStreamStatus>(status);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === "streaming" && prevStatus !== "streaming") {
      userToggledRef.current = false;
      setOpen(true);
    } else if (status === "done" && !userToggledRef.current) {
      setOpen(false);
    }
  }, [status]);

  return (
    <section aria-label="Reasoning" className="flex flex-col gap-4 rounded-card border border-steel bg-boards p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          aria-live="polite"
          className={`flex items-center gap-2 text-sm ${
            status === "error"
              ? "rounded-card border border-red-lamp/40 bg-red-lamp/10 px-3 py-1.5 text-red-lamp"
              : "text-frost"
          }`}
        >
          {status === "streaming" && (
            <span aria-hidden="true" className="streaming-dot h-2 w-2 rounded-full bg-sodium" />
          )}
          {STATUS_MESSAGE[status]}
          {status === "done" && totalMs !== undefined && totalMs >= 100 && (
            <span className="font-mono text-xs tabular-nums text-sodium">{formatElapsed(totalMs)}</span>
          )}
        </p>
        {(status === "stalled" || status === "error") && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-well border border-steel-bright px-2 py-0.5 text-xs font-semibold text-ice motion-safe:transition-colors hover:bg-glass"
          >
            Retry
          </button>
        )}
      </div>
      <details className="log-details" open={open}>
        {/* preventDefault cancels the native toggle so React alone owns `open`;
            a programmatic open change can then never masquerade as user intent
            (the native toggle event fires for programmatic changes too). */}
        <summary
          onClick={(e) => {
            e.preventDefault();
            userToggledRef.current = true;
            setOpen((o) => !o);
          }}
          className="log-summary flex cursor-pointer list-none items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-[0.08em] text-frost hover:text-ice [&::-webkit-details-marker]:hidden"
        >
          {COPY.decisionLogSummary(cardEvents.length)}
        </summary>
        <div className="log-details-body mt-4 flex flex-col gap-4">
          <ol className="log-list flex flex-col gap-5">
            {cardEvents.map((envelope) => (
              <EventCard
                key={envelope.seq}
                envelope={envelope}
                isStreamingRow={status === "streaming" && envelope.seq === lastSeq}
              />
            ))}
          </ol>
        </div>
      </details>
    </section>
  );
}
```

The heading row change from ActivityPanel: the h2 "Decision log" title is dropped (the disclosure lives inside a turn now; the summary strip is the title). Everything else in the copied helpers stays byte-identical.

- [ ] **Step 4: Run to verify pass, full gates, commit**

Run: `npx vitest run components/ReasoningDisclosure.test.tsx` (4 tests), then all three gates. ActivityPanel still exists and still powers the live page; it is deleted in Task 11.

```bash
git add components/ReasoningDisclosure.tsx components/ReasoningDisclosure.test.tsx
git commit -m "feat(components): ReasoningDisclosure, the relocated log collapse contract"
```

---

### Task 7: ChatComposer and PartyAnswerForm

**Files:**
- Create: `components/PartyAnswerForm.tsx` (extracted verbatim from ConstraintContract.tsx lines 54-106)
- Create: `components/ChatComposer.tsx`
- Test: `components/ChatComposer.test.tsx`

**Interfaces:**
- Consumes: `Constraint`, `INPUT_CHAR_CAP`, `PlanApiInput` from schemas; `COPY`.
- Produces:
  - `PartyAnswerForm({ onAnswer })` with `onAnswer(a: { constraints: Constraint[]; historyText: string })`, exactly the steppers + "Use this" markup from ConstraintContract.
  - `SuggestedPrompt { id: NonNullable<PlanApiInput["chipId"]>; label: string; text: string }`, `SUGGESTED_PROMPTS` (the four CHIPS from PlanClient.tsx lines 44-65, moved verbatim).
  - `QuickChip { id: string; label: string; delta: Constraint }`, `QUICK_CHIPS` (moved verbatim from FollowUpComposer.tsx lines 14-45).
  - `ChatComposer({ demo, disabled, hasPlanContext, onSuggestedPrompt, onQuickChip, onSubmitText })`.

Behavior: before a plan context exists, the four suggested prompts render and clicking one calls onSuggestedPrompt(prompt) which submits immediately (the zero-LLM chip path). After a plan context exists, the three quick chips render and call onQuickChip. The textarea is disabled in demo mode with COPY.followUpDemoNote (the existing honest copy); in live mode Enter submits (Shift+Enter for a newline) and the button label is "Plan my night" fresh, COPY.followUpSend afterwards.

- [ ] **Step 1: Extract PartyAnswerForm**

Create `components/PartyAnswerForm.tsx` containing exactly the PartyAnswerForm function from `components/ConstraintContract.tsx` (the `"use client"` directive, the imports it needs, and `export function PartyAnswerForm`). Do not modify ConstraintContract.tsx yet (it is deleted in Task 11; two copies existing briefly is fine because the ConstraintContract copy is not exported).

- [ ] **Step 2: Write the failing composer tests**

Create `components/ChatComposer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COPY } from "@/lib/copy";
import { ChatComposer, QUICK_CHIPS, SUGGESTED_PROMPTS } from "./ChatComposer";

const noop = () => {};

describe("ChatComposer", () => {
  it("before a plan: renders the four suggested prompts and submits one immediately", () => {
    const onPrompt = vi.fn();
    const { getByRole } = render(
      <ChatComposer demo disabled={false} hasPlanContext={false} onSuggestedPrompt={onPrompt} onQuickChip={noop} onSubmitText={noop} />,
    );
    expect(SUGGESTED_PROMPTS).toHaveLength(4);
    fireEvent.click(getByRole("button", { name: "Family + gluten-free" }));
    expect(onPrompt).toHaveBeenCalledWith(SUGGESTED_PROMPTS[0]);
  });

  it("demo mode: textarea disabled with the honest copy, no send button", () => {
    const { container, queryByRole } = render(
      <ChatComposer demo disabled={false} hasPlanContext={false} onSuggestedPrompt={noop} onQuickChip={noop} onSubmitText={noop} />,
    );
    const textarea = container.querySelector("textarea")!;
    expect(textarea.disabled).toBe(true);
    expect(container.textContent).toContain(COPY.followUpDemoNote);
    expect(queryByRole("button", { name: "Plan my night" })).toBeNull();
  });

  it("after a plan: quick chips replace the prompts and fire onQuickChip", () => {
    const onChip = vi.fn();
    const { getByRole, queryByRole } = render(
      <ChatComposer demo disabled={false} hasPlanContext onSuggestedPrompt={noop} onQuickChip={onChip} onSubmitText={noop} />,
    );
    expect(queryByRole("button", { name: "Family + gluten-free" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Arriving at 6:00 instead" }));
    expect(onChip).toHaveBeenCalledWith(QUICK_CHIPS[0]);
  });

  it("live mode: typed text submits via Enter and clears the draft", () => {
    const onText = vi.fn();
    const { container } = render(
      <ChatComposer demo={false} disabled={false} hasPlanContext={false} onSuggestedPrompt={noop} onQuickChip={noop} onSubmitText={onText} />,
    );
    const textarea = container.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "two of us, budget night" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onText).toHaveBeenCalledWith("two of us, budget night");
    expect(textarea.value).toBe("");
  });

  it("disabled while streaming: prompts and chips are inert", () => {
    const onPrompt = vi.fn();
    const { getByRole } = render(
      <ChatComposer demo disabled hasPlanContext={false} onSuggestedPrompt={onPrompt} onQuickChip={noop} onSubmitText={noop} />,
    );
    fireEvent.click(getByRole("button", { name: "Family + gluten-free" }));
    expect(onPrompt).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run components/ChatComposer.test.tsx`
Expected: FAIL (module does not exist).

- [ ] **Step 4: Implement ChatComposer**

Create `components/ChatComposer.tsx`:

```tsx
"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { Constraint, INPUT_CHAR_CAP, PlanApiInput } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";

export interface SuggestedPrompt {
  id: NonNullable<PlanApiInput["chipId"]>;
  label: string;
  text: string;
}

/** The former demo chips: full sentences that run the zero-LLM chip path. */
export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    id: "family",
    label: "Family + gluten-free",
    text: "I'm bringing my dad and two kids. One child needs gluten-free food. Our train arrives at 6:18, and seeing warmups matters more than having many food choices.",
  },
  {
    id: "budget",
    label: "Budget night, quieter gate",
    text: "There are two of us, we want to keep the whole night under $80 including food, and we'd rather skip the loudest crowds at the main gate.",
  },
  {
    id: "access",
    label: "Wheelchair access",
    text: "My mom uses a wheelchair, so we need step-free access the whole way. She's vegetarian. We just need to be in our seats before puck drop.",
  },
  {
    id: "vague",
    label: "Short on details",
    text: "Two kids, one gluten-free, train at 6:18, seated for warmups",
  },
];

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

export function ChatComposer({
  demo,
  disabled,
  hasPlanContext,
  onSuggestedPrompt,
  onQuickChip,
  onSubmitText,
}: {
  demo: boolean;
  disabled: boolean;
  hasPlanContext: boolean;
  onSuggestedPrompt: (prompt: SuggestedPrompt) => void;
  onQuickChip: (chip: QuickChip) => void;
  onSubmitText: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (demo || disabled || !draft.trim()) return;
    onSubmitText(draft.trim());
    setDraft("");
  };
  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section aria-label="Composer" className="flex flex-col gap-3 rounded-card border border-steel bg-boards p-4">
      {!hasPlanContext ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-frost">
            {COPY.suggestedPromptsLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                disabled={disabled}
                onClick={() => onSuggestedPrompt(prompt)}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-steel px-3 py-1.5 text-sm font-medium text-frost motion-safe:transition-colors hover:border-steel-bright hover:text-ice disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={disabled}
              onClick={() => onQuickChip(chip)}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-steel px-3 py-1.5 text-sm font-medium text-frost motion-safe:transition-colors hover:border-steel-bright hover:text-ice disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={onFormSubmit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ice">
          {hasPlanContext ? "Your change" : "Your request"}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={INPUT_CHAR_CAP}
            rows={2}
            disabled={demo || disabled}
            placeholder={hasPlanContext ? COPY.followUpPlaceholder : COPY.composerFreshPlaceholder}
            className="rounded-card border border-steel bg-well/70 px-3 py-2.5 text-[15px] leading-6 text-ice placeholder:text-frost motion-safe:transition-colors focus:border-steel-bright disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        {demo ? (
          <p className="text-[13px] leading-5 text-frost">{COPY.followUpDemoNote}</p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              type="submit"
              disabled={disabled || !draft.trim()}
              className="inline-flex min-h-11 items-center justify-center self-start rounded-well bg-ice px-4 py-2 text-sm font-semibold text-bowl motion-safe:transition-colors hover:bg-ice/90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            >
              {hasPlanContext ? COPY.followUpSend : "Plan my night"}
            </button>
            <p className="font-mono text-xs tabular-nums text-frost">
              {draft.length} / {INPUT_CHAR_CAP}
            </p>
          </div>
        )}
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Run to verify pass, full gates, commit**

Run: `npx vitest run components/ChatComposer.test.tsx` (5 tests), then all three gates.

```bash
git add components/ChatComposer.tsx components/ChatComposer.test.tsx components/PartyAnswerForm.tsx
git commit -m "feat(components): ChatComposer with suggested prompts, PartyAnswerForm extraction"
```

---

### Task 8: NearbyRealOptions card

**Files:**
- Create: `components/NearbyRealOptions.tsx`
- Test: `components/NearbyRealOptions.test.tsx`

**Interfaces:**
- Consumes: `RealNearbyEntry`, `EvidenceTier`, `filterRealNearby` from `@/lib/data/realNearbySchema` (never the loader, so no JSON in the client bundle); `DietaryNeed`; `COPY`; `SourceBadge`.
- Produces: `NearbyRealOptions({ entries, needs })`. Section aria-label "Real places near the arena". SNAPSHOT provenance badge in the header, per-entry accessed date and source link, evidence tier chips whose visible words carry the meaning (no color-only), solid borders only (dashed stays exclusive to SIMULATED).

- [ ] **Step 1: Write the failing tests**

Create `components/NearbyRealOptions.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/NearbyRealOptions.test.tsx`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement**

Create `components/NearbyRealOptions.tsx`:

```tsx
import { DietaryNeed } from "@/lib/planning/schemas";
import { EvidenceTier, RealNearbyEntry, filterRealNearby } from "@/lib/data/realNearbySchema";
import { COPY } from "@/lib/copy";
import { SourceBadge } from "./SourceBadge";

// Tier chips pair the visible tier word with a tone; the word carries the
// meaning, color is reinforcement only. All solid borders: dashed stays
// exclusive to SIMULATED, and this card is research SNAPSHOT data.
const TIER_STYLE: Record<EvidenceTier, string> = {
  certified: "border-ice-green/40 bg-ice-green/10 text-ice-green",
  "self-described": "border-sodium/40 bg-sodium/10 text-sodium",
  friendly: "border-steel-bright bg-glass text-frost",
};

/**
 * The real-places footer card: research data presented by the UI, labeled as
 * such, never model output. Renders only after a feasible plan lands (the
 * panel gates it); receives already-validated entries from the server page
 * and filters them by the plan's dietary needs.
 */
export function NearbyRealOptions({ entries, needs }: { entries: RealNearbyEntry[]; needs: DietaryNeed[] }) {
  const selection = filterRealNearby(entries, needs);
  return (
    <section aria-label="Real places near the arena" className="flex flex-col gap-3 rounded-card border border-steel bg-boards p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">
          {COPY.realNearbyHeading}
        </h2>
        <SourceBadge source="snapshot" title="Research notes, accessed 2026-07-20" />
      </div>
      <p className="text-[13px] leading-5 text-frost">{COPY.realNearbyLead}</p>
      {selection.kind === "absence" ? (
        <p className="rounded-card border border-sodium/40 bg-sodium/10 p-3 text-sm leading-6 text-ice">
          {COPY.realNearbyAbsence(selection.need)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {selection.picks.map((e) => (
            <li key={e.id} className="rounded-card border border-steel bg-well/60 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-ice">{e.name}</span>
                <span className="font-mono text-xs tabular-nums text-frost">
                  {e.walkMinutes} min walk &middot; {e.priceLevel}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] leading-5 text-frost">
                {e.rating
                  ? `${e.rating.value.toFixed(1)} / 5 (${e.rating.source}). ${e.rating.reviewNote}.`
                  : "Rating not captured in this research pass."}
              </p>
              {e.evidence
                .filter((ev) => needs.length === 0 || needs.includes(ev.need))
                .map((ev) => (
                  <p key={`${e.id}-${ev.need}`} className="mt-1.5 flex flex-wrap items-start gap-1.5 text-[13px] leading-5 text-ice/90">
                    <span
                      className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${TIER_STYLE[ev.tier]}`}
                    >
                      {ev.need} &middot; {COPY.evidenceTierLabel(ev.tier)}
                    </span>
                    <span className="min-w-0 flex-1">{ev.line}</span>
                  </p>
                ))}
              <p className="mt-1.5 font-mono text-[11px] text-frost">
                Accessed {e.accessedAt} &middot;{" "}
                <a className="underline hover:text-ice" href={e.sourceUrl} target="_blank" rel="noreferrer">
                  source
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-4 text-frost">{COPY.realNearbyWalkNote}</p>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify pass, full gates, commit**

Run: `npx vitest run components/NearbyRealOptions.test.tsx` (4 tests), then all three gates.

```bash
git add components/NearbyRealOptions.tsx components/NearbyRealOptions.test.tsx
git commit -m "feat(components): real-places card with evidence tiers and honest absence"
```

---

### Task 9: UserTurn, AssistantTurn, MessageThread

**Files:**
- Create: `components/UserTurn.tsx`
- Create: `components/AssistantTurn.tsx`
- Create: `components/MessageThread.tsx`
- Test: `components/AssistantTurn.test.tsx`

**Interfaces:**
- Consumes: `ChatTurn`, `composeAssistantTurn` from `@/lib/chat/turns`; `ReasoningDisclosure` (Task 6); `PartyAnswerForm` (Task 7); `COPY`; `Constraint`.
- Produces:
  - `UserTurn({ text })`
  - `AssistantTurn({ turn, isLive, onAnswer?, onRetry? })` with `data-role="assistant-turn"` on the root (the e2e selector).
  - `MessageThread({ turns, onAnswer, onRetry })` with `aria-label="Conversation"` (the e2e selector). The last turn is live: its clarification steppers and Retry are interactive; earlier turns render frozen.

- [ ] **Step 1: Write the failing tests**

Create `components/AssistantTurn.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatTurn } from "@/lib/chat/turns";
import { PlanResult, TraceEvent } from "@/lib/planning/schemas";
import { AssistantTurn } from "./AssistantTurn";

function turn(events: TraceEvent[], over: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: 1,
    userText: "test",
    envelopes: events.map((event, seq) => ({ v: 1, requestId: "r1", seq, event })),
    streamText: "",
    status: "done",
    ...over,
  };
}

const feasibleResult: PlanResult = {
  feasible: true,
  violations: [],
  adjustments: [],
  candidateStats: { evaluated: 10, feasible: 4 },
};

describe("AssistantTurn", () => {
  it("renders the adjustment sentence and the plan-ready confirmation", () => {
    const t = turn([
      { type: "constraint_adjusted", field: "arrival", requested: "6:18", resolved: "18:15 (Lakeshore West)", reason: "No scheduled arrival at 18:18; nearest real GO arrival, GTFS snapshot 2026-07-07" },
      { type: "plan_result", result: feasibleResult },
      { type: "done" },
    ], { streamText: "A narrative sentence." });
    const { container } = render(<AssistantTurn turn={t} isLive={false} />);
    expect(container.textContent).toContain("You said 6:18");
    expect(container.textContent).toContain("Resolved to 18:15 (Lakeshore West)");
    expect(container.textContent).toContain("A narrative sentence.");
    expect(container.textContent).toContain("Tonight's plan is ready.");
  });

  it("renders a live clarification with interactive steppers, frozen without", () => {
    const t = turn([
      { type: "request_parsed", constraints: [], clarificationsNeeded: [{ field: "party", question: "How many adults and how many children are going?" }] },
      { type: "done" },
    ]);
    const live = render(<AssistantTurn turn={t} isLive onAnswer={() => {}} />);
    expect(live.container.textContent).toContain("How many adults");
    expect(live.queryByRole("button", { name: "Use this" })).not.toBeNull();

    const frozen = render(<AssistantTurn turn={t} isLive={false} onAnswer={() => {}} />);
    expect(frozen.container.textContent).toContain("How many adults");
    expect(frozen.queryByRole("button", { name: "Use this" })).toBeNull();
  });

  it("renders assumption lines with the assumed provenance chip", () => {
    const t = turn([
      { type: "assumption_made", field: "arrival", assumed: "you can take any scheduled train, so GameLoop picked Lakeshore West arriving 18:15", reason: "No arrival time was given. Tell us in a follow-up if you are arriving differently." },
      { type: "plan_result", result: feasibleResult },
      { type: "done" },
    ]);
    const { container } = render(<AssistantTurn turn={t} isLive={false} />);
    expect(container.textContent).toContain("assumed");
    expect(container.textContent).toContain("Lakeshore West arriving 18:15");
  });

  it("renders the terminal decision as the body when no plan landed", () => {
    const t = turn([
      { type: "decision", summary: "Reading your request." },
      { type: "decision", summary: "Demo mode runs without model calls, so free-text changes are disabled here. Use the quick chips, or run live to type a change." },
      { type: "done" },
    ]);
    const { container } = render(<AssistantTurn turn={t} isLive={false} />);
    expect(container.textContent).toContain("Demo mode runs without model calls");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/AssistantTurn.test.tsx`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the three components**

Create `components/UserTurn.tsx`:

```tsx
export function UserTurn({ text }: { text: string }) {
  return (
    <div className="turn-arrive flex justify-end">
      <p className="max-w-[85%] rounded-card border border-steel bg-glass px-3.5 py-2.5 text-[15px] leading-6 text-ice">
        {text}
      </p>
    </div>
  );
}
```

Create `components/AssistantTurn.tsx`:

```tsx
"use client";

import { ChatTurn, composeAssistantTurn } from "@/lib/chat/turns";
import { Constraint } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";
import { ReasoningDisclosure } from "./ReasoningDisclosure";
import { PartyAnswerForm } from "./PartyAnswerForm";

/**
 * One assistant turn composed from its stream envelopes. Order inside the
 * turn mirrors the stream's own narrative arc: the honest redirect first,
 * then the reasoning disclosure (open while streaming, folded after), the
 * adjustment and assumption lines with their provenance, the narrative body,
 * the clarification question, and the closing confirmation.
 */
export function AssistantTurn({
  turn,
  isLive,
  onAnswer,
  onRetry,
}: {
  turn: ChatTurn;
  isLive: boolean;
  onAnswer?: (a: { constraints: Constraint[]; historyText: string }) => void;
  onRetry?: () => void;
}) {
  const seg = composeAssistantTurn(turn.envelopes);
  const heroLine =
    seg.planResult?.feasible === true
      ? COPY.turnPlanReady(COPY.heroSentence(seg.planResult.plan))
      : undefined;

  return (
    <div data-role="assistant-turn" className="turn-arrive flex flex-col gap-3">
      {seg.redirect && (
        <p className="border-l-2 border-sodium py-0.5 pl-2.5 text-sm italic leading-6 text-frost">{seg.redirect}</p>
      )}
      {turn.envelopes.length > 0 && (
        <ReasoningDisclosure envelopes={turn.envelopes} status={turn.status} onRetry={isLive ? onRetry : undefined} />
      )}
      {seg.adjustments.map((a, i) => (
        <p key={`adj-${i}`} className="text-sm leading-6 text-ice/90">
          {a.requested === "not set" ? "Not set before; " : `You said ${a.requested}; `}
          {a.reason} Resolved to {a.resolved}.
        </p>
      ))}
      {seg.assumptions.map((a) => (
        <p key={a.field} className="flex items-start gap-2 rounded-card border border-sodium/40 bg-sodium/10 p-3 text-sm leading-6 text-ice">
          <span aria-hidden="true" className="font-mono text-sodium">~</span>
          <span>
            <span className="mr-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-sodium">
              assumed
            </span>
            {a.assumed}. <span className="text-frost">{a.reason}</span>
          </span>
        </p>
      ))}
      {turn.streamText && <p className="text-[15px] leading-7 text-ice/90">{turn.streamText}</p>}
      {!turn.streamText && seg.body && <p className="text-[15px] leading-7 text-ice/90">{seg.body}</p>}
      {seg.clarification && (
        <div className="rounded-card border border-sodium/40 bg-sodium/10 p-3.5 text-sm text-sodium">
          <span aria-hidden="true">? </span>
          {seg.clarification.question}
          {isLive && onAnswer && seg.clarification.field === "party" && <PartyAnswerForm onAnswer={onAnswer} />}
        </div>
      )}
      {seg.errorMessage && <p className="text-sm leading-6 text-red-lamp">{seg.errorMessage}</p>}
      {heroLine && <p className="text-sm font-medium leading-6 text-ice-green">{heroLine}</p>}
      {seg.planResult && !seg.planResult.feasible && (
        <p className="text-sm leading-6 text-red-lamp">{COPY.turnInfeasible}</p>
      )}
      {turn.status === "streaming" && (
        <p className="flex items-center gap-2 text-sm text-frost">
          <span aria-hidden="true" className="streaming-dot h-2 w-2 rounded-full bg-sodium" />
          Planning&hellip;
        </p>
      )}
    </div>
  );
}
```

Create `components/MessageThread.tsx`:

```tsx
"use client";

import { ChatTurn } from "@/lib/chat/turns";
import { Constraint } from "@/lib/planning/schemas";
import { AssistantTurn } from "./AssistantTurn";
import { UserTurn } from "./UserTurn";

export function MessageThread({
  turns,
  onAnswer,
  onRetry,
}: {
  turns: ChatTurn[];
  onAnswer: (a: { constraints: Constraint[]; historyText: string }) => void;
  onRetry: () => void;
}) {
  if (turns.length === 0) return null;
  return (
    <ol aria-label="Conversation" className="flex list-none flex-col gap-5 p-0">
      {turns.map((t, i) => (
        <li key={t.id} className="flex flex-col gap-3">
          <UserTurn text={t.userText} />
          <AssistantTurn turn={t} isLive={i === turns.length - 1} onAnswer={onAnswer} onRetry={onRetry} />
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: Run to verify pass, full gates, commit**

Run: `npx vitest run components/AssistantTurn.test.tsx` (4 tests), then all three gates.

```bash
git add components/UserTurn.tsx components/AssistantTurn.tsx components/MessageThread.tsx components/AssistantTurn.test.tsx
git commit -m "feat(components): message thread with composed assistant turns"
```

---

### Task 10: July 25 quick action in DisruptionControls

**Files:**
- Modify: `components/DisruptionControls.tsx`

**Interfaces:**
- Produces: exported `DISRUPTIONS` list (PlanWorkspace uses it to label disruption user turns) with the new entry `{ id: "july25-weekend-service", label: "July 25 weekend service" }` and an optional per-entry `title` rendered as the button's title attribute.

- [ ] **Step 1: Edit the component**

Replace the DISRUPTIONS constant and button in `components/DisruptionControls.tsx`:

```tsx
export const DISRUPTIONS: { id: DisruptionId; label: string; title?: string }[] = [
  { id: "train-plus-18", label: "Train delayed +18 min" },
  { id: "gate1-wait-22", label: "Gate 1 wait rises to 22 min" },
  { id: "gf-stand-closed", label: "Gluten-free stand unavailable" },
  { id: "milestone-puck-drop", label: "Warmups -> puck drop" },
  { id: "add-accessibility", label: "Add accessibility need" },
  {
    id: "july25-weekend-service",
    label: "July 25 weekend service",
    title:
      "Sat Jul 25, 2026: Lakeshore West reduced for Exhibition Station construction; UP Express replaced by GO buses. Verified 2026-07-20, simulated against the weekday snapshot.",
  },
];
```

And in the map, add `title={d.title}` to the button element. Nothing else changes.

- [ ] **Step 2: Full gates, commit**

The extra button renders on the live page already (it sits below the plan in the current layout until Task 11 moves it into the panel); the existing e2e specs do not assert an exhaustive button list, so gates stay green. Run all three gates.

```bash
git add components/DisruptionControls.tsx
git commit -m "feat(components): July 25 weekend service quick action"
```

---

### Task 11: the workspace swap and e2e rewrite (single commit)

This is the one large commit the spec calls for: layout, wiring, deletions, and both Playwright specs land together so gates never go red between commits.

**Files:**
- Create: `components/PlanPanel.tsx`
- Create: `app/plan/PlanWorkspace.tsx`
- Modify: `app/plan/page.tsx`
- Modify: `app/globals.css` (one rule inside the motion block)
- Modify: `e2e/demo-smoke.spec.ts` (rewrite)
- Modify: `e2e/conversational-smoke.spec.ts` (rewrite)
- Delete: `app/plan/PlanClient.tsx`, `components/ActivityPanel.tsx`, `components/ConstraintContract.tsx`, `components/FollowUpComposer.tsx`
- Do NOT touch: `playwright.config.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 1-10 plus the reused components (ItineraryTimeline, ConstraintsStrip, SkeletonTimeline, ConsideredRejected, MemoryPanel, ResetControl, SourceBadge, useTraceStream).
- Produces: `PlanPanel({ eyebrow, venue, realNearby, result, priorPlanSteps, isReplanning, streamingOrStalled, showDisruptions, onDisruption, disruptionsDisabled, resultsRef, infeasibleRef })` with `aria-label="Plan panel"` and `id="plan-panel"`; default-exported `PlanWorkspace({ eyebrow, realNearby })`.

- [ ] **Step 1: Create PlanPanel**

Create `components/PlanPanel.tsx`. The hero, infeasible, alternative, and eyebrow blocks are moved from PlanClient.tsx with their markup unchanged; only their wrapper changes:

```tsx
"use client";

import { RefObject, useEffect, useState } from "react";
import {
  DietaryNeed,
  DisruptionId,
  ItineraryStep,
  PlanResult,
  SourceClass,
  Venue,
} from "@/lib/planning/schemas";
import { RealNearbyEntry } from "@/lib/data/realNearbySchema";
import { COPY } from "@/lib/copy";
import { SourceBadge } from "./SourceBadge";
import { ConstraintsStrip } from "./ConstraintsStrip";
import { ItineraryTimeline } from "./ItineraryTimeline";
import { SkeletonTimeline } from "./SkeletonTimeline";
import { ConsideredRejected } from "./ConsideredRejected";
import { DisruptionControls } from "./DisruptionControls";
import { NearbyRealOptions } from "./NearbyRealOptions";
import { MemoryPanel } from "./MemoryPanel";
import { ResetControl } from "./ResetControl";

export interface PlanEyebrow {
  matchup: string;
  puckDropAt: string;
  source: SourceClass;
}

/** Viewer's local wall-clock time of day, "HH:MM". Client-only: the server
 * has no notion of the viewer's clock, so this is read after mount rather
 * than seeded during SSR (see the null-until-mounted state below). */
function currentClock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The persistent plan artifact panel: eyebrow and disruption quick actions
 * in the header, the polished plan hero as the body, the real-places card
 * as the footer, memory and reset below. Sticky beside the thread on
 * desktop, stacked below it on mobile (the thread's jump control targets
 * the id here).
 */
export function PlanPanel({
  eyebrow,
  venue,
  realNearby,
  result,
  priorPlanSteps,
  isReplanning,
  streamingOrStalled,
  showDisruptions,
  onDisruption,
  disruptionsDisabled,
  resultsRef,
  infeasibleRef,
}: {
  eyebrow: PlanEyebrow;
  venue: Venue;
  realNearby: RealNearbyEntry[];
  result: PlanResult | null;
  priorPlanSteps: ItineraryStep[];
  isReplanning: boolean;
  streamingOrStalled: boolean;
  showDisruptions: boolean;
  onDisruption: (id: DisruptionId) => void;
  disruptionsDisabled: boolean;
  resultsRef: RefObject<HTMLDivElement | null>;
  infeasibleRef: RefObject<HTMLDivElement | null>;
}) {
  // Tonight's-game eyebrow: null until the client mounts, so the puck-drop
  // countdown never depends on a server-side notion of "now", then refreshed
  // on a coarse one-minute interval -- a text update, not animation, so no
  // reduced-motion concern.
  const [nowClock, setNowClock] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNowClock(currentClock());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const puckDrop = nowClock
    ? COPY.puckDropEyebrow(nowClock, eyebrow.puckDropAt)
    : { mode: "static" as const, prefix: "Puck drop", value: eyebrow.puckDropAt };

  const dietaryNeeds: DietaryNeed[] = [];
  if (result?.feasible && result.plan) {
    for (const o of result.plan.constraintOutcomes) {
      if (o.constraint.type === "dietary" && !dietaryNeeds.includes(o.constraint.value.need)) {
        dietaryNeeds.push(o.constraint.value.need);
      }
    }
  }
  const heroSentence = result?.feasible ? COPY.heroSentence(result.plan) : undefined;

  return (
    <aside
      id="plan-panel"
      aria-label="Plan panel"
      className="arrive arrive-4 flex w-full scroll-mt-16 flex-col gap-4 md:sticky md:top-16 md:max-h-[calc(100vh-5rem)] md:w-[26rem] md:overflow-y-auto lg:w-[28rem]"
    >
      <div
        aria-label="Tonight's game"
        className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-l-2 border-sodium py-0.5 pl-2.5 text-[11px]"
      >
        <span className="font-mono font-medium uppercase tracking-[0.14em] text-frost">Tonight</span>
        <span aria-hidden="true" className="text-frost">&middot;</span>
        <span className="font-mono text-frost">{eyebrow.matchup}</span>
        <span aria-hidden="true" className="text-frost">&middot;</span>
        <span className="font-mono text-frost">
          {puckDrop.prefix} <span className="text-sodium tabular-nums">{puckDrop.value}</span>
        </span>
        <SourceBadge source={eyebrow.source} title="Tonight's matchup and puck drop, from the NHL snapshot fixture" />
      </div>

      {showDisruptions && <DisruptionControls onTrigger={onDisruption} disabled={disruptionsDisabled} />}

      {result && !result.feasible && (
        <section
          ref={infeasibleRef}
          tabIndex={-1}
          aria-label="Infeasible"
          className="scroll-mt-20 rounded-card border border-red-lamp/40 bg-red-lamp/10 p-4 text-sm text-ice"
        >
          <p className="font-semibold text-red-lamp">This request cannot be satisfied as stated:</p>
          <ul className="mt-1 list-disc pl-5 leading-6">
            {result.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
          {result.bestAlternative && <p className="mt-2 text-frost">Closest feasible alternative shown below.</p>}
        </section>
      )}

      {result?.feasible && result.plan ? (
        <div
          ref={resultsRef}
          tabIndex={-1}
          aria-label="Tonight's plan"
          aria-busy={isReplanning}
          className={`ice-sheet replan-wrap scroll-mt-20 p-6${isReplanning ? " replan-dim" : ""}`}
        >
          <h2 className="mb-1 font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice-green">
            Tonight&apos;s plan
          </h2>
          {heroSentence && (
            <p className="mb-4 font-display text-2xl font-bold tracking-wide text-ice md:text-3xl">{heroSentence}</p>
          )}
          <ConstraintsStrip outcomes={result.plan.constraintOutcomes} />
          <ItineraryTimeline
            plan={result.plan}
            venue={venue}
            adjustments={result.adjustments}
            diff={result.diff}
            priorSteps={priorPlanSteps}
          />
        </div>
      ) : (
        streamingOrStalled && <SkeletonTimeline />
      )}

      {result && !result.feasible && result.bestAlternative && (
        <div ref={resultsRef} tabIndex={-1} aria-label="Closest feasible alternative" className="scroll-mt-20">
          <ConstraintsStrip outcomes={result.bestAlternative.constraintOutcomes} />
          <ItineraryTimeline plan={result.bestAlternative} venue={venue} adjustments={result.adjustments} />
        </div>
      )}

      {result?.feasible && result.plan && (
        <ConsideredRejected selected={result.plan} runnerUp={result.runnerUp} />
      )}

      {result?.feasible && result.plan && <NearbyRealOptions entries={realNearby} needs={dietaryNeeds} />}

      <MemoryPanel />
      <ResetControl />
    </aside>
  );
}
```

- [ ] **Step 2: Create PlanWorkspace**

Create `app/plan/PlanWorkspace.tsx`. The state machine is PlanClientInner's, with the removed sections gone and the turn ledger added:

```tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clarification,
  Constraint,
  DisruptionId,
  ItineraryStep,
  PlanApiInput,
  PlanResult,
  SessionContext,
  SessionContextSchema,
  TraceEvent,
} from "@/lib/planning/schemas";
import { loadVenue } from "@/lib/data/load";
import { RealNearbyEntry } from "@/lib/data/realNearbySchema";
import { ChatTurn } from "@/lib/chat/turns";
import { useTraceStream } from "@/components/useTraceStream";
import { MessageThread } from "@/components/MessageThread";
import { ChatComposer, QuickChip, SuggestedPrompt } from "@/components/ChatComposer";
import { PlanEyebrow, PlanPanel } from "@/components/PlanPanel";
import { DISRUPTIONS } from "@/components/DisruptionControls";
import { readStoredSession, SESSION_STORAGE_KEY, SESSION_UPDATED_EVENT } from "@/components/MemoryPanel";
import { COPY } from "@/lib/copy";

// Matches the "tonight" showcase game hardcoded in Task 9's loadPlannerInput.
const DEMO_GAME_ID = "2025030413";

export default function PlanWorkspace(props: { eyebrow: PlanEyebrow; realNearby: RealNearbyEntry[] }) {
  return (
    <Suspense fallback={null}>
      <PlanWorkspaceInner {...props} />
    </Suspense>
  );
}

function PlanWorkspaceInner({ eyebrow, realNearby }: { eyebrow: PlanEyebrow; realNearby: RealNearbyEntry[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demo = searchParams.get("demo") === "1";
  const venue = useMemo(() => loadVenue(), []);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const infeasibleRef = useRef<HTMLDivElement | null>(null);

  const [disruptions, setDisruptions] = useState<DisruptionId[]>([]);
  const [submittedBody, setSubmittedBody] = useState<PlanApiInput | null>(null);
  const [lastPlanResult, setLastPlanResult] = useState<PlanResult | null>(null);
  // The plan being replaced by an in-flight re-plan, kept only so
  // ItineraryTimeline can render readable titles for diff.invalidatedStepIds
  // instead of raw stepIds once the prior plan's steps are gone from state.
  const [priorPlanSteps, setPriorPlanSteps] = useState<ItineraryStep[]>([]);
  // The most recent request_parsed contract, kept separate from `events`
  // (which useTraceStream resets to [] on every new submit): refinements
  // build on it, and its presence is what flips the composer into
  // follow-up mode.
  const [persistedRequestParsed, setPersistedRequestParsed] = useState<Pick<
    Extract<TraceEvent, { type: "request_parsed" }>,
    "constraints" | "clarificationsNeeded"
  > | null>(null);
  const [lastPlanContext, setLastPlanContext] = useState<{
    planId: string;
    constraints: Constraint[];
    disruptions: DisruptionId[];
  } | null>(null);
  const [refined, setRefined] = useState(false);

  // The conversation ledger. Completed turns are frozen snapshots; the live
  // turn is derived from the current stream below.
  const [completedTurns, setCompletedTurns] = useState<ChatTurn[]>([]);
  const [activeUserText, setActiveUserText] = useState<string | null>(null);
  const turnIdRef = useRef(1);
  // The last free-text request body sent; disruption replans re-send it so
  // the server re-derives the same contract (chip path in demo mode).
  const lastTextRef = useRef("");
  const lastChipIdRef = useRef<PlanApiInput["chipId"]>(undefined);

  const { events, streamText, status, retry, httpStatus } = useTraceStream(
    submittedBody ? "/api/plan" : null,
    submittedBody,
  );

  useEffect(() => {
    if (httpStatus === 401) router.push("/enter");
  }, [httpStatus, router]);

  // Track the latest plan_result across the life of a request, and persist
  // SessionContext once a feasible plan lands. Kept separate from `events`
  // (which the hook resets on every new request) so the previously
  // rendered plan stays visible, dimmed, while a replan streams in.
  useEffect(() => {
    const planResultEnvelope = [...events].reverse().find((e) => e.event.type === "plan_result");
    if (!planResultEnvelope || planResultEnvelope.event.type !== "plan_result") return;
    const result = planResultEnvelope.event.result;
    setLastPlanResult(result);

    if (result.feasible && result.plan) {
      const parsedConstraints =
        [...events].reverse().find((e) => e.event.type === "request_parsed")?.event;
      setLastPlanContext({
        planId: result.plan.planId,
        constraints: parsedConstraints?.type === "request_parsed" ? parsedConstraints.constraints : [],
        disruptions: submittedBody?.disruptions ?? [],
      });
    }

    if (!result.feasible || !result.plan) return;
    const requestParsedEnvelope = events.find((e) => e.event.type === "request_parsed");
    const constraints: Constraint[] =
      requestParsedEnvelope?.event.type === "request_parsed" ? requestParsedEnvelope.event.constraints : [];
    const partyConstraint = constraints.find((c) => c.type === "party");
    const arrivalConstraint = constraints.find((c) => c.type === "arrival");
    const dietaryConstraints = constraints.filter((c) => c.type === "dietary");

    const now = Date.now();
    const session: SessionContext = {
      schemaVersion: 1,
      plannedGameId: DEMO_GAME_ID,
      venueId: "harbourview-arena",
      party:
        partyConstraint?.type === "party"
          ? { adults: partyConstraint.value.adults, children: partyConstraint.value.children }
          : { adults: 0, children: 0 },
      dietaryRequirements: dietaryConstraints
        .filter((c): c is Extract<Constraint, { type: "dietary" }> => c.type === "dietary")
        .map((c) => ({ value: c.value.need, source: "explicit-user-input" as const })),
      seatSection: result.plan.seatSection,
      viewZone: result.plan.viewZone,
      arrivalChoice:
        arrivalConstraint?.type === "arrival"
          ? { mode: arrivalConstraint.value.mode, scheduledArrival: result.plan.transitArrival ?? arrivalConstraint.value.normalizedClock }
          : undefined,
      selectedPlanId: result.plan.planId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const parsed = SessionContextSchema.safeParse(session);
    if (parsed.success) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed.data));
      window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
    }
  }, [events, submittedBody]);

  useEffect(() => {
    if (status === "done" && lastPlanResult) {
      resultsRef.current?.focus();
    }
  }, [status, lastPlanResult]);

  useEffect(() => {
    if (status === "done" && lastPlanResult && !lastPlanResult.feasible && !lastPlanResult.bestAlternative) {
      infeasibleRef.current?.focus();
    }
  }, [status, lastPlanResult]);

  // Update the persisted contract only when a fresh request_parsed frame
  // actually arrives; `events` resets to [] at the start of every new
  // submit, but that reset must not clear the refinement base.
  useEffect(() => {
    const envelope = events.find((e) => e.event.type === "request_parsed");
    if (envelope?.event.type === "request_parsed") {
      setPersistedRequestParsed({
        constraints: envelope.event.constraints,
        clarificationsNeeded: envelope.event.clarificationsNeeded,
      });
    }
  }, [events]);

  const turns: ChatTurn[] =
    activeUserText === null
      ? completedTurns
      : [...completedTurns, { id: 0, userText: activeUserText, envelopes: events, streamText, status }];

  const freezeActiveTurn = () => {
    if (activeUserText !== null) {
      setCompletedTurns((t) => [
        ...t,
        {
          id: turnIdRef.current++,
          userText: activeUserText,
          envelopes: events,
          streamText,
          status: status === "error" ? "error" : "done",
        },
      ]);
    }
  };

  const buildBody = (text: string, overrides: Partial<PlanApiInput> = {}): PlanApiInput => ({
    mode: "plan",
    text,
    chipId: undefined,
    demo,
    disruptions: [],
    priorPlanId: undefined,
    sessionContext: readStoredSession() ?? undefined,
    ...overrides,
  });

  const submitTurn = (userText: string, body: PlanApiInput) => {
    freezeActiveTurn();
    lastTextRef.current = body.text;
    lastChipIdRef.current = body.chipId;
    setActiveUserText(userText);
    setSubmittedBody(body);
  };

  const startFresh = (text: string, chipId?: PlanApiInput["chipId"]) => {
    setDisruptions([]);
    setLastPlanContext(null);
    setRefined(false);
    submitTurn(text, buildBody(text, { chipId }));
  };

  const refinementBase = () => ({
    baseConstraints: persistedRequestParsed?.constraints ?? [],
    pendingClarifications: (persistedRequestParsed?.clarificationsNeeded ?? []) as Clarification[],
    prior: lastPlanContext ?? undefined,
  });

  const submitRefinement = (refinement: NonNullable<PlanApiInput["refinement"]>, label: string) => {
    setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
    setRefined(true);
    submitTurn(label, buildBody(lastTextRef.current || label, { refinement, disruptions, priorPlanId: undefined }));
  };

  const onSuggestedPrompt = (p: SuggestedPrompt) => startFresh(p.text, p.id);
  const onSubmitText = (text: string) => {
    if (persistedRequestParsed) {
      submitRefinement({ ...refinementBase(), followUpText: text }, text);
    } else {
      startFresh(text);
    }
  };
  const onAnswer = ({ constraints, historyText }: { constraints: Constraint[]; historyText: string }) =>
    submitRefinement({ ...refinementBase(), answerConstraints: constraints }, historyText);
  const onQuickChip = (chip: QuickChip) =>
    submitRefinement({ ...refinementBase(), answerConstraints: [chip.delta] }, chip.label);

  const onDisruption = (id: DisruptionId) => {
    // Dedupe by id: train-plus-18 is non-idempotent (it adds 18 minutes each
    // application), so a stray re-click must not send the same id twice.
    const next = [...new Set([...disruptions, id])].slice(-5);
    setDisruptions(next);
    setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
    const label = DISRUPTIONS.find((d) => d.id === id)?.label ?? id;
    if (refined) {
      submitTurn(
        label,
        buildBody(lastTextRef.current || label, {
          disruptions: next,
          refinement: { ...refinementBase(), answerConstraints: [] },
          priorPlanId: undefined,
        }),
      );
    } else {
      submitTurn(
        label,
        buildBody(lastTextRef.current || label, {
          chipId: lastChipIdRef.current,
          disruptions: next,
          priorPlanId: lastPlanResult?.plan?.planId,
        }),
      );
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="arrive arrive-1 font-display text-3xl font-bold uppercase tracking-wide text-ice">
            Plan My Night
          </h1>
          <p className="arrive arrive-2 text-sm text-frost">
            Tell us about your group in your own words, or start from an example.
          </p>
        </div>
        <a
          href="#plan-panel"
          className="sticky top-3 z-10 self-end rounded-full border border-steel-bright bg-boards px-3 py-1.5 text-xs font-semibold text-ice md:hidden"
        >
          {COPY.jumpToPlan}
        </a>
        <MessageThread turns={turns} onAnswer={onAnswer} onRetry={retry} />
        <ChatComposer
          demo={demo}
          disabled={status === "streaming"}
          hasPlanContext={persistedRequestParsed !== null}
          onSuggestedPrompt={onSuggestedPrompt}
          onQuickChip={onQuickChip}
          onSubmitText={onSubmitText}
        />
      </div>
      <PlanPanel
        eyebrow={eyebrow}
        venue={venue}
        realNearby={realNearby}
        result={lastPlanResult}
        priorPlanSteps={priorPlanSteps}
        isReplanning={status === "streaming" && lastPlanResult !== null}
        streamingOrStalled={status === "streaming" || status === "stalled"}
        showDisruptions={lastPlanResult?.feasible === true}
        onDisruption={onDisruption}
        disruptionsDisabled={status === "streaming"}
        resultsRef={resultsRef}
        infeasibleRef={infeasibleRef}
      />
    </main>
  );
}
```

- [ ] **Step 3: Rewire the page and delete the absorbed components**

Replace `app/plan/page.tsx`:

```tsx
import { loadShowcaseGame } from "@/lib/data/showcaseGame";
import { loadRealNearby } from "@/lib/data/realNearby";
import PlanWorkspace from "./PlanWorkspace";

// Matches the "tonight" showcase game hardcoded in Task 9's loadPlannerInput.
const DEMO_GAME_ID = "2025030413";

export default function PlanPage() {
  const g = loadShowcaseGame(DEMO_GAME_ID);
  const eyebrow = {
    matchup: `${g.homeTeam.commonName} versus ${g.awayTeam.commonName}`,
    puckDropAt: g.puckDropAt,
    source: g.source,
  };
  return <PlanWorkspace eyebrow={eyebrow} realNearby={loadRealNearby()} />;
}
```

Delete `app/plan/PlanClient.tsx`, `components/ActivityPanel.tsx`, `components/ConstraintContract.tsx`, `components/FollowUpComposer.tsx`. Then grep for any remaining imports of the four deleted modules and fix (expected: none; comments in SkeletonTimeline.tsx and ConstraintsStrip.tsx may still mention ActivityPanel by name, update those comments to ReasoningDisclosure).

- [ ] **Step 4: Add the turn entrance to the motion block**

In `app/globals.css`, inside the `@media (prefers-reduced-motion: no-preference)` block, directly after the `.log-row, .plan-step, .memory-row` rule:

```css
  /* Chat turns: the same rise-in entrance as log rows; the thread is the stagger. */
  .turn-arrive {
    animation: rise-in var(--t-move) var(--ease-glide) both;
  }
```

No other CSS changes. Reduced-motion users see instant, complete turns.

- [ ] **Step 5: Rewrite the demo smoke spec**

Replace `e2e/demo-smoke.spec.ts`:

```ts
import { test, expect, Locator } from "@playwright/test";

/**
 * Seeded demo smoke on the chat workspace: access -> suggested prompt ->
 * July 25 weekend service -> train delay -> real places -> reset, all in
 * demo mode against the poisoned-key webServer (playwright.config.ts), so
 * no step ever depends on a live model call.
 */

test.setTimeout(60_000);

/**
 * The reasoning disclosure opens while streaming and auto-collapses on
 * completion (see components/ReasoningDisclosure.tsx). Click its summary
 * strip to expand before asserting on row content, guarded on the current
 * open state so this never re-collapses an already-open disclosure.
 */
async function expandReasoning(turn: Locator) {
  const details = turn.locator("details.log-details");
  const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    await turn.locator("details.log-details > summary").click();
  }
}

test("scripted demo sequence: access, prompt, July 25 service, delay, real places, reset", async ({ page }) => {
  // ---- 1. Access flow ----
  await page.goto("/enter");
  await page.getByLabel("Access code").fill(process.env.SMOKE_ACCESS_CODE ?? "letmein");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL(/\/plan/);

  // ---- 2. Suggested prompt submits immediately as a user turn ----
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Family + gluten-free" }).click();

  const thread = page.locator('[aria-label="Conversation"]');
  await expect(thread).toContainText("I'm bringing my dad and two kids");

  const panel = page.locator('[aria-label="Plan panel"]');
  const itineraryList = panel.locator(`[aria-label="Tonight's plan"] ol`);
  await expect(itineraryList).toBeVisible();
  const transitStep = itineraryList.locator("li", { hasText: "18:15" });
  await expect(transitStep).toBeVisible();
  await expect(transitStep).toContainText("SNAPSHOT");

  // Collapse contract: once the stream completes, the disclosure folds to
  // its signals summary. The snap adjustment renders inside the turn.
  const firstTurn = thread.locator('[data-role="assistant-turn"]').last();
  await expect(firstTurn.locator("details.log-details")).toHaveJSProperty("open", false);
  await expect(firstTurn).toContainText("You said 6:18");
  await expandReasoning(firstTurn);
  await expect(firstTurn).toContainText("Request parsed");

  // ---- 3. July 25 weekend service: Lakeshore West thins, arrival re-snaps ----
  await page.getByRole("button", { name: "July 25 weekend service" }).click();
  await expect(itineraryList.locator("li", { hasText: "18:12" })).toBeVisible();
  await expect(itineraryList).toContainText("Lakeshore East");
  await expect(itineraryList).toContainText(/replaced|dropped/);
  const julyTurn = thread.locator('[data-role="assistant-turn"]').last();
  await expect(julyTurn).toContainText("18:12 (Lakeshore East)");

  // ---- 4. Train delayed +18: stacks on the July 25 service ----
  await page.getByRole("button", { name: "Train delayed +18 min" }).click();
  await expect(itineraryList).toContainText("18:30");
  // Seating slips past warmups; the deterministic decision summary reports
  // the trade verbatim. The disruption replan is a fresh stream, so the
  // disclosure must auto-collapse again before the manual expand.
  const delayTurn = thread.locator('[data-role="assistant-turn"]').last();
  await expect(delayTurn.locator("details.log-details")).toHaveJSProperty("open", false);
  await expandReasoning(delayTurn);
  await expect(delayTurn).toContainText(/traded:\s*seated_by/);

  // ---- 5. Real places: research-labeled, evidence tier, provenance ----
  const realPlaces = panel.locator('[aria-label="Real places near the arena"]');
  await expect(realPlaces).toBeVisible();
  await expect(realPlaces).toContainText("research notes");
  await expect(realPlaces).toContainText("WVRST");
  await expect(realPlaces).toContainText("dedicated fryer");
  await expect(realPlaces).toContainText("SNAPSHOT");
  await expect(realPlaces).toContainText("2026-07-20");

  // ---- 6. Reset ----
  await page.goto("/plan");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  const sessionAfterReset = await page.evaluate(() => window.localStorage.getItem("gameloop.session.v1"));
  expect(sessionAfterReset).toBeNull();

  await page.goto("/plan");
  await expect(page.locator('[aria-label="What GameLoop remembers"]')).toContainText("Nothing saved yet.");
});
```

- [ ] **Step 6: Rewrite the conversational smoke spec**

Replace `e2e/conversational-smoke.spec.ts`:

```ts
import { test, expect, Locator } from "@playwright/test";

/**
 * Conversational flows in the chat workspace, all in demo mode against the
 * poisoned-key webServer: proves the zero-LLM guarantee holds through the
 * clarification-answer and follow-up-refinement paths, plus the 390px
 * mobile stack.
 */

test.setTimeout(60_000);

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/enter");
  await page.getByLabel("Access code").fill(process.env.SMOKE_ACCESS_CODE ?? "letmein");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL(/\/plan/);
}

async function expandReasoning(turn: Locator) {
  const details = turn.locator("details.log-details");
  const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    await turn.locator("details.log-details > summary").click();
  }
}

test("clarification answered inline in the thread: vague prompt, steppers, merged replan", async ({ page }) => {
  await enter(page);
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Short on details" }).click();

  const thread = page.locator('[aria-label="Conversation"]');
  await expect(thread).toContainText("How many adults and how many children are going?");

  await page.getByLabel("Adults").fill("1");
  await page.getByLabel("Children").fill("2");
  await page.getByRole("button", { name: "Use this" }).click();

  // The answer becomes a user turn and the merged replan lands in the panel.
  await expect(thread).toContainText("1 adult, 2 children");
  const panel = page.locator('[aria-label="Plan panel"]');
  await expect(panel.locator(`[aria-label="Tonight's plan"] ol`)).toBeVisible();

  // The merge reads as a visible adjustment inside the new turn, and the
  // unstated food preference surfaces as an assumption with provenance.
  const lastTurn = thread.locator('[data-role="assistant-turn"]').last();
  await expect(lastTurn).toContainText("Added in your follow-up.");
  await expect(lastTurn).toContainText("assumed");
});

test("refinement quick chip: replan diff in the panel, adjustment in the turn", async ({ page }) => {
  await enter(page);
  await page.goto("/plan?demo=1");
  await page.getByRole("button", { name: "Family + gluten-free" }).click();

  const panel = page.locator('[aria-label="Plan panel"]');
  const itineraryList = panel.locator(`[aria-label="Tonight's plan"] ol`);
  await expect(itineraryList).toBeVisible();
  await expect(itineraryList.locator("li", { hasText: "18:15" })).toBeVisible();

  await page.getByRole("button", { name: "Arriving at 6:00 instead" }).click();

  // 18:00 snaps to the 18:12 Lakeshore East train; the transit step is
  // replaced, stable steps keep their badges.
  await expect(itineraryList).toContainText("18:12");
  await expect(itineraryList).toContainText(/kept/);
  await expect(itineraryList).toContainText(/replaced|dropped/);

  const thread = page.locator('[aria-label="Conversation"]');
  // The transcript is the history thread: the chip label is the user turn.
  await expect(thread).toContainText("Arriving at 6:00 instead");
  const refTurn = thread.locator('[data-role="assistant-turn"]').last();
  // Collapse contract on the replan path, then the visible adjustment.
  await expect(refTurn.locator("details.log-details")).toHaveJSProperty("open", false);
  await expect(refTurn).toContainText("Updated in your follow-up.");

  // Free text is honestly disabled in demo mode.
  const composer = page.locator('[aria-label="Composer"]');
  await expect(composer).toContainText("quick chips");
  await expect(composer.locator("textarea")).toBeDisabled();
});

test("mobile 390px: panel stacks below the thread with a working jump control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.goto("/plan?demo=1");

  const jump = page.getByRole("link", { name: "Jump to plan" });
  await expect(jump).toBeVisible();

  await page.getByRole("button", { name: "Family + gluten-free" }).click();
  const panel = page.locator('[aria-label="Plan panel"]');
  await expect(panel.locator(`[aria-label="Tonight's plan"] ol`)).toBeVisible();

  const threadBox = await page.locator('[aria-label="Conversation"]').boundingBox();
  const panelBox = await panel.boundingBox();
  expect(panelBox!.y).toBeGreaterThan(threadBox!.y);

  await jump.click();
  await expect(panel).toBeInViewport();
});
```

- [ ] **Step 7: Full gates**

Run: `npx vitest run` (all suites incl. the new ones), `npm run build`, `npx playwright test` (expect 4 passed: 1 demo + 3 conversational). Do a manual sanity pass with `npm run start` if anything is ambiguous. Fix forward until green; the poisoned-key webServer config must remain byte-identical (`git diff playwright.config.ts` must be empty).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(plan): chat workspace, thread beside persistent plan panel, e2e rewrite"
```

---

### Task 12: final verification and docs

**Files:**
- Modify: `BUILDLOG.md` (append entry, follow the existing entry format)
- Verify: full gates one last time from a clean state

- [ ] **Step 1: Run all gates and record output**

Run: `npx vitest run`, `npm run build`, `npx playwright test`. Record the final counts.

- [ ] **Step 2: BUILDLOG entry**

Append a dated entry in the file's existing style covering: the chat workspace swap (turn composition over the unchanged SSE stream, PlanClient split into PlanWorkspace, thread, and panel), the July 25 weekend service disruption with its research grounding, the real-places card with evidence tiers and the nut-free absence rule, the e2e rewrite (now 4 specs including the 390px mobile pass), and the freeze status (branch READY, prod untouched at gameloop-l0vn7tgb3, no push, no merge, no deploy). Plain prose, no em dashes.

- [ ] **Step 3: Commit**

```bash
git add BUILDLOG.md
git commit -m "docs: BUILDLOG entry for the chat workspace build"
```

---

## Self-review notes (already applied)

- Spec coverage: two-region layout (Task 11), conversation model incl. redirect, clarification bubble, assumptions, narrative body, confirmation (Tasks 5, 9), reasoning relocation with its collapse contract and regression tests (Task 6), composer absorption incl. demo-disabled copy (Task 7), real-data layer with schema, loader, filter, absence rule (Tasks 2, 3, 8), July 25 disruption TDD (Task 1), panel reuse of the polished hero (Task 11), transcript replacing the history section (Task 11 deletes it with PlanClient), e2e rewrite in the same commit as the layout with the mobile pass (Task 11), gates at every commit (every task).
- The mobile jump control and its 390px assertions cover the spec's named mobile risk.
- The e2e demo sequence changes from "train delay only" to "July 25 then train delay" because stacking July 25 after the delay would not change the timeline visibly (18:15 and 18:12 both exist pre-disruption); July 25 first yields the visible 18:15 to 18:12 Lakeshore East re-snap, then the delay yields 18:30 and the seated_by trade, preserving the original spec's trade assertion.
- Playwright spec count grows from 3 to 4; the poisoned-key webServer stays byte-identical.
- Type consistency: `ChatTurn`, `AssistantSegments`, `RealNearbyEntry`, `SuggestedPrompt`, `QuickChip`, `DISRUPTIONS`, and `PlanEyebrow` are each defined once and imported everywhere else; no duplicate definitions remain after Task 11 deletes the absorbed components.
