import { ConstraintAdjustment, DietaryNeed, PlanRequest, TransitOption, Venue } from "./schemas";
import { toNormalizedMinutes } from "./time";

/** Authored fact from lib/data/transit-snapshot.json's snapshotDate. Never tune. */
export const TRANSIT_SNAPSHOT_DATE = "2026-07-07";

export type ArrivalStrategy = "pickup-en-route" | "pickup-after-seating";

/** Structural candidate identity, independent of disruptions. */
export interface RawCandidate {
  candidateId: string;
  gateId: string;
  standIds: string[]; // sorted
  transitRouteId?: string;
  transitArrival?: string; // "HH:MM", resolved (pre-disruption-delay)
  arrivalMinutes: number; // normalized minutes at Union/origin, pre-disruption-delay
  arrivalStrategy: ArrivalStrategy;
  /** True when an arrival constraint exists but its mode has no servicable transit (e.g. not "train"). */
  noUsableTransit: boolean;
}

export interface GenerateCandidatesInput {
  venue: Venue;
  transitOptions: TransitOption[];
  request: PlanRequest;
  /** Clock string used as the puck-drop reference for normalized-minute math (game.puckDropAt). */
  puckDropClock: string;
  /** Clock string used as the doors-open default arrival when no transit is taken (game.doorsOpenAt). */
  doorsOpenClock: string;
}

export function hhmm(scheduled: string): string {
  return scheduled.slice(0, 5);
}

export function routeLabel(routeId: string): string {
  if (routeId.endsWith("-LW")) return "Lakeshore West";
  if (routeId.endsWith("-LE")) return "Lakeshore East";
  return routeId;
}

/**
 * Resolve an arrival constraint's normalizedClock to a real snapshot transit option.
 * Exact match short-circuits with no adjustment. Otherwise: nearest by absolute minute
 * distance, ties to the earlier arrival.
 */
export function snapTransitArrival(
  transitOptions: TransitOption[],
  arrival: { statedClock: string; normalizedClock: string },
  puckDropClock: string,
): { option: TransitOption; resolvedClock: string; adjustment?: ConstraintAdjustment } {
  const exact = transitOptions.find((o) => hhmm(o.scheduledArrival) === arrival.normalizedClock);
  if (exact) return { option: exact, resolvedClock: hhmm(exact.scheduledArrival) };

  const target = toNormalizedMinutes(arrival.normalizedClock, puckDropClock);
  let best: TransitOption | undefined;
  let bestDist = Infinity;
  let bestArrivalMin = Infinity;
  for (const o of transitOptions) {
    const m = toNormalizedMinutes(hhmm(o.scheduledArrival), puckDropClock);
    const dist = Math.abs(m - target);
    if (dist < bestDist || (dist === bestDist && m < bestArrivalMin)) {
      best = o;
      bestDist = dist;
      bestArrivalMin = m;
    }
  }
  if (!best) throw new Error("no transit options available to snap arrival against");
  const resolvedClock = hhmm(best.scheduledArrival);
  const adjustment: ConstraintAdjustment = {
    field: "arrival",
    requested: arrival.statedClock,
    resolved: `${resolvedClock} (${routeLabel(best.routeId)})`,
    reason: `No scheduled arrival at ${arrival.normalizedClock}; nearest real GO arrival, GTFS snapshot ${TRANSIT_SNAPSHOT_DATE}`,
  };
  return { option: best, resolvedClock, adjustment };
}

interface TransitBranch {
  transitRouteId?: string;
  transitArrival?: string; // "HH:MM"
  arrivalMinutes: number;
  noUsableTransit: boolean;
}

/** Also returns the snap adjustment (undefined when no snap occurred / not applicable). */
export function resolveTransitBranches(
  input: GenerateCandidatesInput,
): { branches: TransitBranch[]; adjustment?: ConstraintAdjustment } {
  const { transitOptions, request, puckDropClock, doorsOpenClock } = input;
  const doorsDefaultMinutes = toNormalizedMinutes(doorsOpenClock, puckDropClock);
  const arrivalConstraint = request.constraints.find((c) => c.type === "arrival");

  if (arrivalConstraint && arrivalConstraint.type === "arrival") {
    if (arrivalConstraint.value.mode !== "train") {
      return { branches: [{ arrivalMinutes: doorsDefaultMinutes, noUsableTransit: true }] };
    }
    const { option, resolvedClock, adjustment } = snapTransitArrival(
      transitOptions,
      arrivalConstraint.value,
      puckDropClock,
    );
    return {
      branches: [
        {
          transitRouteId: option.routeId,
          transitArrival: resolvedClock,
          arrivalMinutes: toNormalizedMinutes(resolvedClock, puckDropClock),
          noUsableTransit: false,
        },
      ],
      adjustment,
    };
  }

  const inRange = transitOptions.filter((o) => {
    const m = toNormalizedMinutes(hhmm(o.scheduledArrival), puckDropClock);
    return m >= -150 && m <= 0;
  });
  if (inRange.length === 0) {
    return { branches: [{ arrivalMinutes: doorsDefaultMinutes, noUsableTransit: false }] };
  }
  return {
    branches: inRange.map((o) => ({
      transitRouteId: o.routeId,
      transitArrival: hhmm(o.scheduledArrival),
      arrivalMinutes: toNormalizedMinutes(hhmm(o.scheduledArrival), puckDropClock),
      noUsableTransit: false,
    })),
  };
}

function hasEdge(venue: Venue, a: string, b: string): boolean {
  return venue.walkingGraph.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
}

export function requiredDietaryNeeds(request: PlanRequest): DietaryNeed[] {
  const needs = new Set<DietaryNeed>();
  for (const c of request.constraints) {
    if (c.type === "dietary" && c.priority === "hard") needs.add(c.value.need);
  }
  return [...needs];
}

export function standCoverage(stand: Venue["stands"][number], required: DietaryNeed[]): Set<DietaryNeed> {
  const covered = new Set<DietaryNeed>();
  for (const need of required) {
    if (stand.menu.some((m) => m.dietaryFlags.includes(need))) covered.add(need);
  }
  return covered;
}

/** Deterministic, time-independent representative wait: minimum band value. */
function representativeWait(stand: Venue["stands"][number]): number {
  return Math.min(...stand.waitProfile.map((b) => b.waitMinutes));
}

/** Reachable stands from a gate, pruned of dominated ones (rule 1). */
function reachablePrunedStands(venue: Venue, gateId: string, required: DietaryNeed[]): Venue["stands"] {
  const reachable = venue.stands.filter((s) => hasEdge(venue, gateId, s.id));
  const survivors: Venue["stands"] = [];
  for (const candidate of reachable) {
    const candidateCoverage = standCoverage(candidate, required);
    const candidateCost = representativeWait(candidate) + walkLookup(venue, gateId, candidate.id);
    const isDominated = reachable.some((other) => {
      if (other.id === candidate.id) return false;
      const otherCoverage = standCoverage(other, required);
      const otherCost = representativeWait(other) + walkLookup(venue, gateId, other.id);
      const otherSuperset = [...candidateCoverage].every((n) => otherCoverage.has(n));
      return otherSuperset && otherCost < candidateCost;
    });
    if (!isDominated) survivors.push(candidate);
  }
  return survivors.sort((a, b) => a.id.localeCompare(b.id));
}

export function walkLookup(venue: Venue, a: string, b: string): number {
  const e = venue.walkingGraph.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
  if (!e) throw new Error(`no walking edge ${a} <-> ${b}`);
  return e.minutes;
}

/** All stand-id combinations of size 0..2 from a sorted stand list, each combo sorted. */
function standCombinations(stands: Venue["stands"]): string[][] {
  const ids = stands.map((s) => s.id).sort((a, b) => a.localeCompare(b));
  const combos: string[][] = [[]];
  for (const id of ids) combos.push([id]);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      combos.push([ids[i]!, ids[j]!].sort((a, b) => a.localeCompare(b)));
    }
  }
  return combos;
}

export function generateCandidates(input: GenerateCandidatesInput): RawCandidate[] {
  const { venue, request } = input;
  const required = requiredDietaryNeeds(request);
  // Gate candidate generation on the subset of hard dietary needs some stand can actually
  // cover. An uncoverable need (e.g. nut-free: no stand in the venue fixture carries it)
  // must not zero out every candidate; tryBuildPlan in evaluate.ts re-derives the FULL
  // required list and will honestly mark those candidates dietary-violated instead.
  const coverable = required.filter((n) => venue.stands.some((s) => s.menu.some((m) => m.dietaryFlags.includes(n))));
  const hasHardDietary = coverable.length > 0;
  const { branches } = resolveTransitBranches(input);

  const candidates: RawCandidate[] = [];

  for (const gate of venue.gates) {
    const prunedStands = reachablePrunedStands(venue, gate.id, coverable);
    const standMap = new Map(prunedStands.map((s) => [s.id, s]));
    const combos = standCombinations(prunedStands);

    for (const standIds of combos) {
      if (standIds.length === 0 && hasHardDietary) continue;
      if (standIds.length > 0 && coverable.length > 0) {
        const covered = new Set<DietaryNeed>();
        for (const id of standIds) {
          const stand = standMap.get(id)!;
          for (const n of standCoverage(stand, coverable)) covered.add(n);
        }
        const coversAll = coverable.every((n) => covered.has(n));
        if (!coversAll) continue;
      }

      // pickup-en-route needs a direct walk between consecutive stands in the set; for
      // cardinality 2 this venue graph only sometimes has that edge, so gate it on existence.
      const strategies: ArrivalStrategy[] = [];
      if (standIds.length === 0) {
        strategies.push("pickup-after-seating");
      } else if (standIds.length === 1 || hasEdge(venue, standIds[0]!, standIds[1]!)) {
        strategies.push("pickup-en-route", "pickup-after-seating");
      } else {
        strategies.push("pickup-after-seating");
      }

      for (const strategy of strategies) {
        for (const branch of branches) {
          const candidateId = `${gate.id}|${standIds.join(",")}|${branch.transitArrival ?? "none"}|${strategy}`;
          candidates.push({
            candidateId,
            gateId: gate.id,
            standIds,
            transitRouteId: branch.transitRouteId,
            transitArrival: branch.transitArrival,
            arrivalMinutes: branch.arrivalMinutes,
            arrivalStrategy: strategy,
            noUsableTransit: branch.noUsableTransit,
          });
        }
      }
    }
  }

  return candidates;
}
