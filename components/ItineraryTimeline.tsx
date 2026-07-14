import { ConstraintAdjustment, DietaryNeed, ItineraryPlan, ItineraryStep, PlanDiff, Venue } from "@/lib/planning/schemas";
import { walkMinutes } from "@/lib/planning/venueGraph";
import { COPY } from "@/lib/copy";
import { SourceBadge } from "./SourceBadge";

function walkDetail(venue: Venue, step: ItineraryStep): string {
  if (!step.walkFromNode || !step.walkToNode) return step.detail ?? "";
  try {
    const minutes = walkMinutes(venue, step.walkFromNode, step.walkToNode);
    return `${minutes} min walk${step.detail ? ` – ${step.detail}` : ""}`;
  } catch {
    return step.detail ?? "walk";
  }
}

/** stepId convention for food steps is "food:<standId>" (see ItineraryStepSchema comment). */
function standIdForFoodStep(step: ItineraryStep): string | undefined {
  if (step.kind !== "food" || !step.stepId.startsWith("food:")) return undefined;
  return step.stepId.slice("food:".length);
}

/**
 * Dietary need(s) this food step's stand actually covers, derived from the
 * plan's dietary constraint outcomes cross-checked against the venue's
 * per-stand menu flags. Returns [] when the step isn't food, the stand can't
 * be resolved, or the stand doesn't cover any of the plan's dietary needs.
 */
function foodStepDietaryNeeds(plan: ItineraryPlan, venue: Venue, step: ItineraryStep): DietaryNeed[] {
  const standId = standIdForFoodStep(step);
  if (!standId || !plan.standIds.includes(standId)) return [];
  const stand = venue.stands.find((s) => s.id === standId);
  if (!stand) return [];

  const needs = new Set<DietaryNeed>();
  for (const outcome of plan.constraintOutcomes) {
    if (outcome.constraint.type === "dietary") needs.add(outcome.constraint.value.need);
  }
  return [...needs].filter((need) => stand.menu.some((item) => item.dietaryFlags.includes(need)));
}

function DiffBadge({ stepId, diff }: { stepId: string; diff?: PlanDiff }) {
  if (!diff) return null;
  if (diff.preservedStepIds.includes(stepId)) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-900">
        <span aria-hidden="true">&#10003;</span> kept
      </span>
    );
  }
  const replaced = diff.replacedSteps.find((r) => r.newStepId === stepId);
  if (replaced) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900">
        <span aria-hidden="true">&#8594;</span> replaced
      </span>
    );
  }
  return null;
}

export function ItineraryTimeline({
  plan,
  venue,
  adjustments = [],
  diff,
  priorSteps = [],
}: {
  plan: ItineraryPlan;
  venue: Venue;
  adjustments?: ConstraintAdjustment[];
  diff?: PlanDiff;
  /** The previous plan's steps, used only to render readable titles for `diff.invalidatedStepIds`. */
  priorSteps?: ItineraryStep[];
}) {
  const arrivalAdjustment = adjustments.find((a) => a.field === "arrival");

  return (
    <ol className="flex flex-col gap-3">
      {plan.steps.map((step) => (
        <li key={step.stepId} className="rounded-lg border border-black/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block rounded bg-black/5 px-2 py-0.5 font-mono text-sm font-semibold">
              {step.clock}
            </span>
            <span className="text-sm font-semibold">{step.title}</span>
            <SourceBadge source={step.source} />
            <DiffBadge stepId={step.stepId} diff={diff} />
          </div>
          <p className="mt-1 text-sm text-black/70">
            {step.kind === "walk" ? walkDetail(venue, step) : step.detail}
          </p>
          {step.kind === "transit" && arrivalAdjustment && (
            <p className="mt-1 text-sm italic text-black/60">
              You said {arrivalAdjustment.requested}; nearest scheduled arrival is {arrivalAdjustment.resolved}.
            </p>
          )}
          {step.kind === "food" &&
            foodStepDietaryNeeds(plan, venue, step).map((need) => (
              <p key={need} className="mt-1 text-xs text-black/50">
                {COPY.dietaryDisclaimer(need)}
              </p>
            ))}
        </li>
      ))}
      {diff?.invalidatedStepIds.map((stepId) => {
        const priorTitle = priorSteps.find((s) => s.stepId === stepId)?.title;
        return (
          <li key={`dropped-${stepId}`} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <span aria-hidden="true">&#10007;</span>{" "}
            <span className="line-through">{priorTitle ?? stepId}</span> dropped
          </li>
        );
      })}
    </ol>
  );
}
