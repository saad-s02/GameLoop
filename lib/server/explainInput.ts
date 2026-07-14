import {
  Constraint,
  ExplainInput,
  ExplainInputSchema,
  ItineraryPlan,
  PlanResult,
  PlanSummaryForModelSchema,
} from "../planning/schemas";
import { routeLabel } from "../planning/candidates";

/** Short human-readable description of a constraint, for the model-facing satisfied/traded/violated lists. */
function describeConstraint(c: Constraint): string {
  switch (c.type) {
    case "arrival":
      return `arriving by ${c.value.mode}`;
    case "seated_by":
      return `seated by ${c.value.milestone.replace("_", " ")}`;
    case "dietary":
      return `${c.value.need} (${c.value.severity})`;
    case "budget":
      return `budget under $${c.value.maxTotalCad} CAD`;
    case "accessibility":
      return `${c.value.need.replace(/-/g, " ")} accessibility`;
    case "party":
      return `party of ${c.value.adults + c.value.children}`;
    case "noise":
      return c.value.preference.replace(/-/g, " ");
    case "food_preference":
      return c.value.preference.replace(/-/g, " ");
  }
}

function gateNameOf(plan: ItineraryPlan): string {
  return plan.steps.find((s) => s.kind === "gate")?.title ?? plan.gateId;
}

function standNamesOf(plan: ItineraryPlan): string[] {
  return plan.steps
    .filter((s) => s.kind === "food")
    .map((s) => s.title.replace(/^Pick up food at /, ""));
}

function seatedClockOf(plan: ItineraryPlan): string {
  return plan.steps.find((s) => s.kind === "seat")?.clock ?? "";
}

function transitLabelOf(plan: ItineraryPlan): string | undefined {
  if (!plan.transitRouteId || !plan.transitArrival) return undefined;
  return `${routeLabel(plan.transitRouteId)}, arrives ${plan.transitArrival}`;
}

function toPlanSummary(plan: ItineraryPlan) {
  const satisfied = plan.constraintOutcomes.filter((o) => o.status === "satisfied").map((o) => describeConstraint(o.constraint));
  const traded = plan.constraintOutcomes.filter((o) => o.status === "traded").map((o) => describeConstraint(o.constraint));
  const violated = plan.constraintOutcomes.filter((o) => o.status === "violated").map((o) => describeConstraint(o.constraint));
  const transitLabel = transitLabelOf(plan);

  return PlanSummaryForModelSchema.parse({
    gateName: gateNameOf(plan),
    standNames: standNamesOf(plan),
    ...(transitLabel ? { transitLabel } : {}),
    seatedClock: seatedClockOf(plan),
    seatSection: plan.seatSection,
    walkingMinutes: plan.walkingMinutes,
    waitMinutes: plan.waitMinutes,
    estimatedCostCad: plan.estimatedCostCad,
    satisfied,
    traded,
    violated,
  });
}

function deltaSentence(label: string, unit: string, selectedVal: number, runnerUpVal: number): string {
  const diff = runnerUpVal - selectedVal;
  if (diff === 0) return `${label} is the same for both plans, at ${selectedVal} ${unit}.`;
  const direction = diff > 0 ? "more" : "fewer";
  return `The runner-up plan has ${Math.abs(diff)} ${unit} ${direction} of ${label.toLowerCase()} than the selected plan (${runnerUpVal} vs ${selectedVal} ${unit}).`;
}

function costDeltaSentence(selectedCad: number, runnerUpCad: number): string {
  const diff = runnerUpCad - selectedCad;
  if (diff === 0) return `Cost is the same for both plans, at $${selectedCad} CAD.`;
  const direction = diff > 0 ? "more" : "less";
  return `The runner-up plan costs $${Math.abs(diff)} CAD ${direction} than the selected plan ($${runnerUpCad} vs $${selectedCad} CAD).`;
}

/** Real, code-computed numeric deltas between the selected and runner-up plans, phrased as full sentences. */
function buildRunnerUpDeltas(selected: ItineraryPlan, runnerUp: ItineraryPlan): string[] {
  return [
    deltaSentence("Walking time", "minutes", selected.walkingMinutes, runnerUp.walkingMinutes),
    deltaSentence("Wait time", "minutes", selected.waitMinutes, runnerUp.waitMinutes),
    costDeltaSentence(selected.estimatedCostCad, runnerUp.estimatedCostCad),
  ];
}

/** Maps a feasible PlanResult to the narrow, structurally-boxScore-free explanation input. */
export function buildExplainInput(result: PlanResult): ExplainInput {
  if (!result.feasible || !result.plan) {
    throw new Error("buildExplainInput requires a feasible PlanResult with a selected plan");
  }
  const selected = toPlanSummary(result.plan);
  const runnerUp = result.runnerUp ? toPlanSummary(result.runnerUp) : undefined;
  const runnerUpDeltas = result.runnerUp ? buildRunnerUpDeltas(result.plan, result.runnerUp) : [];

  return ExplainInputSchema.parse({
    selected,
    ...(runnerUp ? { runnerUp } : {}),
    runnerUpDeltas,
    adjustments: result.adjustments,
  });
}
