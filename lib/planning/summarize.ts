import { ItineraryPlan, PlanResult, ShowcaseGame } from "./schemas";

/**
 * Human label for the selected plan: gate name, food stand name(s), arrival clock, and
 * pickup timing, all read directly off the plan's own steps and fields (the same data
 * ItineraryTimeline renders). Never the raw candidateId, which is an internal tie-break
 * key ("gate-1|stand-harbour-fresh|18:15|pickup-after-seating") with no meaning to a
 * user, and never the raw score. Mirrors runnerUpLabel in components/ConsideredRejected.tsx.
 */
function selectionLabel(plan: ItineraryPlan): string {
  const gateTitle = plan.steps.find((s) => s.kind === "gate")?.title;
  const foodTitles = plan.steps
    .filter((s) => s.kind === "food")
    .map((s) => s.title.replace(/^Pick up food at /, ""));
  const pickupLabel = plan.arrivalStrategy === "pickup-en-route" ? "food pickup en route" : "food pickup after seating";
  const parts = [gateTitle, foodTitles.join(" and ") || undefined, plan.transitArrival ? `arriving ${plan.transitArrival}` : undefined, pickupLabel];
  return parts.filter((p): p is string => Boolean(p)).join(", ");
}

// Deterministic text, used as the Decision Log decision event AND the narrative fallback.
export function decisionSummary(result: PlanResult): string {
  if (!result.feasible) return `No feasible plan: ${result.violations.join("; ")}.`;
  const p = result.plan!;
  const traded = p.constraintOutcomes.filter((o) => o.status === "traded").map((o) => o.constraint.type);
  return (
    `Selected ${selectionLabel(p)}: seated ${p.seatedAtMinutes <= -50 ? "before warmups" : "after warmups"}, ` +
    `${p.walkingMinutes} min walking, ${p.waitMinutes} min waiting` +
    (traded.length ? `; traded: ${traded.join(", ")}` : "") +
    "."
  );
}

// "versus" not "at": inside the fiction Harbourview hosts, so naming either real
// team as the home side would misstate the host. Home team first to mirror the
// code-built scoreLine order ("VGK 5, CAR 4").
export function redirectSummary(requested: string, game: ShowcaseGame): string {
  const home = `${game.homeTeam.placeName} ${game.homeTeam.commonName}`;
  const away = `${game.awayTeam.placeName} ${game.awayTeam.commonName}`;
  return `You asked about ${requested}. Tonight Harbourview Arena hosts hockey: ${home} versus ${away}, puck drop ${game.puckDropAt}. Planning your night around it.`;
}

export function fallbackNarrative(result: PlanResult): string {
  if (!result.feasible) {
    return (
      `This request cannot be satisfied as stated: ${result.violations.join("; ")}. ` +
      `The closest feasible alternative is shown below the Decision Log. (Plain summary, written without the live narrator.)`
    );
  }
  const p = result.plan!;
  return (
    `${decisionSummary(result)} Enter at ${p.steps.find((s) => s.kind === "gate")?.title ?? "the gate"}, ` +
    `seated by ${p.steps.find((s) => s.kind === "seat")?.clock ?? ""}. (Plain summary, written without the live narrator.)`
  );
}
