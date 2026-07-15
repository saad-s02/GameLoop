import { createHash } from "node:crypto";
import {
  AccessibilityNeedSchema,
  Constraint,
  ConstraintAdjustment,
  ConstraintOutcome,
  ConcessionStandSchema,
  DietaryNeed,
  DisruptionId,
  GateSchema,
  ItineraryPlan,
  ItineraryStep,
  PlanDiff,
  PlanRequest,
  PlanResult,
  PlanResultSchema,
  VenueSectionSchema,
} from "./schemas";
import { z } from "zod";
import { normalizedMinutesToClock, toNormalizedMinutes } from "./time";
import { waitAt } from "./venueGraph";
import {
  RawCandidate,
  generateCandidates,
  requiredDietaryNeeds,
  resolveTransitBranches,
  routeLabel,
  standCoverage,
  walkLookup,
} from "./candidates";
import { PlannerGame, PlannerInput, applyDisruptions } from "./disruptions";

type Gate = z.infer<typeof GateSchema>;
type ConcessionStand = z.infer<typeof ConcessionStandSchema>;
type VenueSection = z.infer<typeof VenueSectionSchema>;
type AccessibilityNeed = z.infer<typeof AccessibilityNeedSchema>;

export type { PlannerGame, PlannerInput } from "./disruptions";

export interface EvaluateOptions {
  disruptions?: DisruptionId[];
  priorPlanId?: string;
  priorSteps?: ItineraryStep[];
}

function sha256_12(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function milestoneMinutes(game: PlannerGame, name: "doors" | "warmups" | "puck_drop"): number {
  if (name === "doors") return toNormalizedMinutes(game.doorsOpenAt, game.puckDropAt);
  if (name === "warmups") return toNormalizedMinutes(game.warmupStartAt, game.puckDropAt);
  return 0;
}

function pickSection(input: PlannerInput, gateId: string): VenueSection | undefined {
  const hasAccessibility = input.request.constraints.some((c) => c.type === "accessibility");
  return input.venue.sections.find((s) => s.nearestGateId === gateId && (!hasAccessibility || s.accessible));
}

function checkAccessibility(
  need: AccessibilityNeed,
  gate: Gate,
  section: VenueSection,
  stands: ConcessionStand[],
): boolean {
  if (need === "accessible-seating") return section.accessible;
  return gate.accessible && section.accessible && stands.every((s) => s.accessible);
}

function getPartySize(request: PlanRequest): number {
  const party = request.constraints.find((c) => c.type === "party");
  if (party && party.type === "party") return party.value.adults + party.value.children;
  return 1;
}

function cheapestCoveringItemPrice(stand: ConcessionStand, requiredNeeds: DietaryNeed[]): number {
  const covering = stand.menu.filter((m) => requiredNeeds.some((n) => m.dietaryFlags.includes(n)));
  const pool = covering.length > 0 ? covering : stand.menu;
  return Math.min(...pool.map((m) => m.priceCad));
}

function estimatedCost(
  standIds: string[],
  standLookup: Map<string, ConcessionStand>,
  requiredNeeds: DietaryNeed[],
  partySize: number,
): number {
  if (standIds.length === 0) return 0;
  const setSize = standIds.length;
  const perPerson = Math.ceil(partySize / setSize);
  let total = 0;
  for (const id of standIds) {
    const stand = standLookup.get(id)!;
    total += cheapestCoveringItemPrice(stand, requiredNeeds) * perPerson;
  }
  return total;
}

function budgetOverageFor(request: PlanRequest, cost: number): number {
  let overage = 0;
  for (const c of request.constraints) {
    if (c.type === "budget") overage += Math.max(0, cost - c.value.maxTotalCad);
  }
  return overage;
}

// ---------- timeline ----------

interface TimelineResult {
  atGateMinutes: number;
  gateWaitMinutes: number;
  standWaitMinutes: number;
  seatedAtMinutes: number;
  walkingMinutes: number;
  waitMinutes: number;
  steps: ItineraryStep[];
}

function buildTimeline(
  candidate: RawCandidate,
  input: PlannerInput,
  standLookup: Map<string, ConcessionStand>,
  gate: Gate,
  section: VenueSection,
): TimelineResult {
  const venue = input.venue;
  const arrivalMinutes = candidate.arrivalMinutes + (candidate.transitRouteId ? input.transitDelayMinutes : 0);
  const atGate = arrivalMinutes + walkLookup(venue, "union", gate.id);
  const gateWait = waitAt(gate.waitProfile, atGate);

  const steps: ItineraryStep[] = [];
  let walkingMinutes = walkLookup(venue, "union", gate.id);
  let standWaitMinutes = 0;

  if (candidate.transitRouteId && candidate.transitArrival) {
    const displayClock = normalizedMinutesToClock(arrivalMinutes);
    steps.push({
      stepId: `transit:${candidate.transitRouteId}:${displayClock}`,
      kind: "transit",
      startMinutes: arrivalMinutes,
      clock: displayClock,
      title: `${routeLabel(candidate.transitRouteId)} train arrives Union`,
      source: "snapshot",
    });
  }

  steps.push({
    stepId: `gate:${gate.id}`,
    kind: "gate",
    startMinutes: atGate,
    clock: normalizedMinutesToClock(atGate),
    title: gate.name,
    detail: `${gateWait} min gate wait`,
    source: "simulated",
    walkFromNode: "union",
    walkToNode: gate.id,
  });

  let seatedAtMinutes: number;
  const foodSteps: ItineraryStep[] = [];

  if (candidate.arrivalStrategy === "pickup-en-route" && candidate.standIds.length > 0) {
    let t = atGate + gateWait;
    let prevNode = gate.id;
    for (const standId of candidate.standIds) {
      const stand = standLookup.get(standId)!;
      const walk = walkLookup(venue, prevNode, standId);
      t += walk;
      walkingMinutes += walk;
      const wait = waitAt(stand.waitProfile, t);
      foodSteps.push({
        stepId: `food:${standId}`,
        kind: "food",
        startMinutes: t,
        clock: normalizedMinutesToClock(t),
        title: `Pick up food at ${stand.name}`,
        source: "simulated",
        walkFromNode: prevNode,
        walkToNode: standId,
      });
      t += wait;
      standWaitMinutes += wait;
      prevNode = standId;
    }
    const lastWalk = walkLookup(venue, prevNode, section.id);
    walkingMinutes += lastWalk;
    t += lastWalk;
    seatedAtMinutes = t;
  } else {
    const sectionWalk = walkLookup(venue, gate.id, section.id);
    walkingMinutes += sectionWalk;
    seatedAtMinutes = atGate + gateWait + sectionWalk;

    if (candidate.standIds.length > 0) {
      const anchor = Math.max(seatedAtMinutes, -30);
      let cursor = anchor;
      for (const standId of candidate.standIds) {
        const stand = standLookup.get(standId)!;
        const roundTrip = walkLookup(venue, section.id, standId) * 2;
        const wait = waitAt(stand.waitProfile, anchor);
        cursor += roundTrip;
        walkingMinutes += roundTrip;
        standWaitMinutes += wait;
        foodSteps.push({
          stepId: `food:${standId}`,
          kind: "food",
          startMinutes: cursor,
          clock: normalizedMinutesToClock(cursor),
          title: `Pick up food at ${stand.name}`,
          source: "simulated",
          walkFromNode: section.id,
          walkToNode: standId,
        });
        cursor += wait; // stagger subsequent step timestamps; the wait VALUE is read at anchor per rule 2
      }
    }
  }

  steps.push({
    stepId: `seat:${section.id}`,
    kind: "seat",
    startMinutes: seatedAtMinutes,
    clock: normalizedMinutesToClock(seatedAtMinutes),
    title: `Seated in ${section.name} (${section.viewZone})`,
    source: "simulated",
    walkFromNode:
      candidate.arrivalStrategy === "pickup-en-route" && candidate.standIds.length > 0
        ? candidate.standIds[candidate.standIds.length - 1]
        : gate.id,
    walkToNode: section.id,
  });

  steps.push(...foodSteps);

  const warmupsMinutes = milestoneMinutes(input.game, "warmups");
  steps.push({
    stepId: "milestone:warmups",
    kind: "milestone",
    startMinutes: warmupsMinutes,
    clock: normalizedMinutesToClock(warmupsMinutes, input.game.puckDropAt),
    title: "Warmups begin",
    source: "simulated",
  });
  steps.push({
    stepId: "milestone:puck_drop",
    kind: "milestone",
    startMinutes: 0,
    clock: input.game.puckDropAt,
    title: "Puck drop",
    source: "simulated",
  });

  steps.sort((a, b) => a.startMinutes - b.startMinutes);

  return {
    atGateMinutes: atGate,
    gateWaitMinutes: gateWait,
    standWaitMinutes,
    seatedAtMinutes,
    walkingMinutes,
    waitMinutes: gateWait + standWaitMinutes,
    steps,
  };
}

// ---------- satisfaction / scoring ----------

interface SatisfactionCtx {
  candidate: RawCandidate;
  gate: Gate;
  section: VenueSection;
  standsInSet: ConcessionStand[];
  coveredNeeds: Set<DietaryNeed>;
  seatedAtMinutes: number;
  game: PlannerGame;
  totalStandWait: number;
  budgetOverage: number;
}

function isSatisfied(constraint: Constraint, ctx: SatisfactionCtx): boolean {
  switch (constraint.type) {
    case "party":
      return true;
    case "dietary":
      return ctx.coveredNeeds.has(constraint.value.need);
    case "arrival":
      return ctx.candidate.transitRouteId !== undefined;
    case "seated_by":
      return ctx.seatedAtMinutes <= milestoneMinutes(ctx.game, constraint.value.milestone);
    case "noise":
      return ctx.gate.crowdLevel !== "high";
    case "food_preference": {
      if (constraint.value.preference === "many-choices") return ctx.candidate.standIds.length >= 2;
      if (constraint.value.preference === "quick-service") return ctx.totalStandWait <= 10;
      const detail = (constraint.value.detail ?? "").toLowerCase();
      return ctx.standsInSet.some((s) => s.menu.some((m) => m.name.toLowerCase().includes(detail)));
    }
    case "budget":
      return ctx.budgetOverage <= 0;
    case "accessibility":
      return checkAccessibility(constraint.value.need, ctx.gate, ctx.section, ctx.standsInSet);
  }
}

function buildConstraintOutcomes(request: PlanRequest, ctx: SatisfactionCtx): ConstraintOutcome[] {
  return request.constraints.map((c) => {
    const ok = isSatisfied(c, ctx);
    const status: ConstraintOutcome["status"] = ok ? "satisfied" : c.priority === "hard" ? "violated" : "traded";
    return { constraint: c, status };
  });
}

function tallyScore(
  request: PlanRequest,
  ctx: SatisfactionCtx,
  walkingMinutes: number,
  waitMinutes: number,
): number {
  let hard = 0,
    high = 0,
    medium = 0,
    low = 0;
  for (const c of request.constraints) {
    if (!isSatisfied(c, ctx)) continue;
    if (c.priority === "hard") hard++;
    else if (c.priority === "high") high++;
    else if (c.priority === "medium") medium++;
    else if (c.priority === "low") low++;
  }
  return 1000 * hard + 100 * high + 20 * medium + 5 * low - 0.5 * walkingMinutes - waitMinutes - ctx.budgetOverage;
}

// ---------- per-candidate plan build ----------

interface BuiltCandidate {
  plan: ItineraryPlan;
  feasible: boolean;
  violations: string[];
}

function tryBuildPlan(
  raw: RawCandidate,
  input: PlannerInput,
  gateLookup: Map<string, Gate>,
  standLookup: Map<string, ConcessionStand>,
  disruptions: DisruptionId[],
): BuiltCandidate | undefined {
  const gate = gateLookup.get(raw.gateId);
  if (!gate) return undefined;
  const section = pickSection(input, raw.gateId);
  if (!section) return undefined;

  const requiredNeeds = requiredDietaryNeeds(input.request);
  const standsInSet = raw.standIds.map((id) => standLookup.get(id)!);

  const timeline = buildTimeline(raw, input, standLookup, gate, section);

  // Feasibility/enumeration stay gated on HARD dietary needs only (requiredNeeds above).
  // Outcome reporting and tier scoring must judge EVERY dietary constraint (any priority)
  // against the candidate's actual stand-set coverage: rule 5 says "dietary satisfied when
  // covered" with no hard-only qualifier. requiredNeeds is a subset of allDietaryNeeds, so
  // this cannot change the hard-coverage feasibility check below.
  const allDietaryNeeds = [
    ...new Set(
      input.request.constraints
        .filter((c): c is Extract<Constraint, { type: "dietary" }> => c.type === "dietary")
        .map((c) => c.value.need),
    ),
  ];

  const coveredNeeds = new Set<DietaryNeed>();
  for (const s of standsInSet) for (const n of standCoverage(s, allDietaryNeeds)) coveredNeeds.add(n);

  const partySize = getPartySize(input.request);
  const cost = estimatedCost(raw.standIds, standLookup, requiredNeeds, partySize);
  const overage = budgetOverageFor(input.request, cost);

  const ctx: SatisfactionCtx = {
    candidate: raw,
    gate,
    section,
    standsInSet,
    coveredNeeds,
    seatedAtMinutes: timeline.seatedAtMinutes,
    game: input.game,
    totalStandWait: timeline.standWaitMinutes,
    budgetOverage: overage,
  };

  const violations: string[] = [];

  const dietaryOk = requiredNeeds.every((n) => coveredNeeds.has(n));
  if (!dietaryOk) {
    const missingNeeds = requiredNeeds.filter((n) => !coveredNeeds.has(n));
    violations.push(`dietary: no stand tonight offers ${missingNeeds.join(", ")}`);
  }

  const accessibilityConstraint = input.request.constraints.find(
    (c) => c.type === "accessibility" && c.priority === "hard",
  );
  if (accessibilityConstraint && accessibilityConstraint.type === "accessibility") {
    const ok = checkAccessibility(accessibilityConstraint.value.need, gate, section, standsInSet);
    if (!ok) violations.push(`accessibility: ${gate.name} path is not ${accessibilityConstraint.value.need} accessible`);
  }

  const seatedByConstraint = input.request.constraints.find((c) => c.type === "seated_by" && c.priority === "hard");
  if (seatedByConstraint && seatedByConstraint.type === "seated_by") {
    const target = milestoneMinutes(input.game, seatedByConstraint.value.milestone);
    if (timeline.seatedAtMinutes > target) {
      violations.push(`seated_by: cannot seat by ${seatedByConstraint.value.milestone}`);
    }
  }

  const arrivalConstraint = input.request.constraints.find((c) => c.type === "arrival" && c.priority === "hard");
  if (arrivalConstraint && raw.noUsableTransit) {
    violations.push(`arrival: no usable transit for the requested mode`);
  }

  const budgetConstraint = input.request.constraints.find((c) => c.type === "budget" && c.priority === "hard");
  if (budgetConstraint && budgetConstraint.type === "budget") {
    const hardOverage = Math.max(0, cost - budgetConstraint.value.maxTotalCad);
    if (hardOverage > 0) violations.push(`budget: over by $${hardOverage}`);
  }

  const feasible = violations.length === 0;
  const outcomes = buildConstraintOutcomes(input.request, ctx);
  const score = tallyScore(input.request, ctx, timeline.walkingMinutes, timeline.waitMinutes);

  const planId = "plan-" + sha256_12(`${raw.candidateId}|${[...disruptions].sort().join(",")}`);

  const plan: ItineraryPlan = {
    planId,
    candidateId: raw.candidateId,
    gateId: raw.gateId,
    standIds: raw.standIds,
    transitRouteId: raw.transitRouteId,
    transitArrival: raw.transitArrival,
    arrivalStrategy: raw.arrivalStrategy,
    seatSection: section.id,
    viewZone: section.viewZone,
    seatedAtMinutes: timeline.seatedAtMinutes,
    walkingMinutes: timeline.walkingMinutes,
    waitMinutes: timeline.waitMinutes,
    estimatedCostCad: cost,
    score,
    steps: timeline.steps,
    constraintOutcomes: outcomes,
  };

  return { plan, feasible, violations };
}

function compareBuilt(a: BuiltCandidate, b: BuiltCandidate): number {
  if (b.plan.score !== a.plan.score) return b.plan.score - a.plan.score;
  if (a.plan.walkingMinutes !== b.plan.walkingMinutes) return a.plan.walkingMinutes - b.plan.walkingMinutes;
  if (a.plan.waitMinutes !== b.plan.waitMinutes) return a.plan.waitMinutes - b.plan.waitMinutes;
  return a.plan.candidateId < b.plan.candidateId ? -1 : a.plan.candidateId > b.plan.candidateId ? 1 : 0;
}

function computeDiff(oldSteps: ItineraryStep[], newSteps: ItineraryStep[]): PlanDiff {
  const oldIds = new Set(oldSteps.map((s) => s.stepId));
  const newIds = new Set(newSteps.map((s) => s.stepId));
  const preservedStepIds = newSteps.map((s) => s.stepId).filter((id) => oldIds.has(id));
  const invalidatedStepIds = oldSteps.map((s) => s.stepId).filter((id) => !newIds.has(id));
  const addedIds = new Set(newSteps.map((s) => s.stepId).filter((id) => !oldIds.has(id)));

  const replacedSteps: { oldStepId: string; newStepId: string }[] = [];
  const kinds: ItineraryStep["kind"][] = ["transit", "gate", "food", "seat", "milestone", "walk"];
  for (const kind of kinds) {
    const oldOfKind = oldSteps.filter((s) => s.kind === kind && invalidatedStepIds.includes(s.stepId));
    const newOfKind = newSteps.filter((s) => s.kind === kind && addedIds.has(s.stepId));
    const n = Math.min(oldOfKind.length, newOfKind.length);
    for (let i = 0; i < n; i++) {
      replacedSteps.push({ oldStepId: oldOfKind[i]!.stepId, newStepId: newOfKind[i]!.stepId });
    }
  }

  return { preservedStepIds, invalidatedStepIds, replacedSteps };
}

// ---------- top-level ----------

export function evaluate(input: PlannerInput, options: EvaluateOptions = {}): PlanResult {
  const disruptions = options.disruptions ?? [];
  const effectiveInput = disruptions.length > 0 ? applyDisruptions(input, disruptions) : input;

  const rawCandidates = generateCandidates({
    venue: effectiveInput.venue,
    transitOptions: effectiveInput.transitOptions,
    request: effectiveInput.request,
    puckDropClock: effectiveInput.game.puckDropAt,
    doorsOpenClock: effectiveInput.game.doorsOpenAt,
  });

  const { adjustment } = resolveTransitBranches({
    venue: effectiveInput.venue,
    transitOptions: effectiveInput.transitOptions,
    request: effectiveInput.request,
    puckDropClock: effectiveInput.game.puckDropAt,
    doorsOpenClock: effectiveInput.game.doorsOpenAt,
  });
  const adjustments: ConstraintAdjustment[] = adjustment ? [adjustment] : [];

  const gateLookup = new Map(effectiveInput.venue.gates.map((g) => [g.id, g]));
  const standLookup = new Map(effectiveInput.venue.stands.map((s) => [s.id, s]));

  const built = rawCandidates
    .map((raw) => tryBuildPlan(raw, effectiveInput, gateLookup, standLookup, disruptions))
    .filter((x): x is BuiltCandidate => x !== undefined);

  const feasibleOnes = built.filter((b) => b.feasible);

  if (feasibleOnes.length > 0) {
    const sorted = [...feasibleOnes].sort(compareBuilt);
    const winner = sorted[0]!;
    const runnerUp = sorted.find((c) => c.plan.candidateId !== winner.plan.candidateId);

    let diff: PlanDiff | undefined;
    if (options.priorSteps) {
      diff = computeDiff(options.priorSteps, winner.plan.steps);
    } else if (options.priorPlanId) {
      const priorResult = evaluate(input, {});
      diff = computeDiff(priorResult.plan?.steps ?? [], winner.plan.steps);
    }

    return PlanResultSchema.parse({
      feasible: true,
      plan: winner.plan,
      runnerUp: runnerUp?.plan,
      violations: [],
      adjustments,
      candidateStats: { evaluated: rawCandidates.length, feasible: feasibleOnes.length },
      priorPlanId: options.priorPlanId,
      diff,
    });
  }

  // ---- infeasible: identify universal blockers, compute bestAlternative by relaxing them ----
  const prefixOf = (v: string) => v.split(":")[0]!;
  const perCandidateTypes = built.map((b) => new Set(b.violations.map(prefixOf)));
  const allTypes = new Set<string>();
  for (const s of perCandidateTypes) for (const t of s) allTypes.add(t);
  const universalTypes = [...allTypes].filter((t) => built.length > 0 && perCandidateTypes.every((s) => s.has(t)));

  const relaxed = built
    .map((b) => ({ b, relaxedViolations: b.violations.filter((v) => !universalTypes.includes(prefixOf(v))) }))
    .filter((x) => x.relaxedViolations.length === 0)
    .map((x) => x.b);

  const pool = relaxed.length > 0 ? relaxed : built;
  const bestAlternative = pool.length > 0 ? [...pool].sort(compareBuilt)[0]!.plan : undefined;

  const violations = [...new Set(built.flatMap((b) => b.violations))].sort();

  return PlanResultSchema.parse({
    feasible: false,
    violations: violations.length > 0 ? violations : ["no feasible candidates generated"],
    bestAlternative,
    adjustments,
    candidateStats: { evaluated: rawCandidates.length, feasible: 0 },
    priorPlanId: options.priorPlanId,
  });
}
