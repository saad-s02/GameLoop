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

/**
 * Phase color per step kind, always paired with the glyph and the step's own
 * title text below (color alone never carries meaning): ice-green for the
 * two "you have arrived" moments (transit landing, being seated), sodium for
 * the in-between waiting/moving steps (walk, gate, food all model wait
 * profiles at the venue), red-lamp for game-time milestones.
 */
const PHASE_DOT: Record<ItineraryStep["kind"], string> = {
  transit: "bg-ice-green",
  seat: "bg-ice-green",
  walk: "bg-sodium",
  gate: "bg-sodium",
  food: "bg-sodium",
  milestone: "bg-red-lamp",
};

const GLYPH_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

/** One small inline glyph per step kind, ~16px, stroke currentColor. Decorative: the step title is the label. */
function StepGlyph({ kind, className }: { kind: ItineraryStep["kind"]; className?: string }) {
  switch (kind) {
    case "transit":
      return (
        <svg {...GLYPH_PROPS} className={className}>
          <rect x="3" y="2" width="10" height="7.5" rx="2" />
          <path d="M3 6.5h10" />
          <path d="M5.5 12.5 4 14.5M10.5 12.5l1.5 2" />
          <circle cx="5.5" cy="10" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="10" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "walk":
      return (
        <svg {...GLYPH_PROPS} className={className}>
          <circle cx="8" cy="3" r="1.2" fill="currentColor" stroke="none" />
          <path d="M8 4.4v3l-2 2.6M8 7.4l2 2.2M6.2 13l1.4-3.6M10.4 13l-1-3.6" />
        </svg>
      );
    case "gate":
      return (
        <svg {...GLYPH_PROPS} className={className}>
          <path d="M3 13.5V2.5M13 13.5V2.5M3 5.5h10M3 9.5h10" />
        </svg>
      );
    case "food":
      return (
        <svg {...GLYPH_PROPS} className={className}>
          <path d="M5 2v4.5a1.5 1.5 0 0 0 3 0V2M6.5 6.5V14M11 2c-1.1 0-1.7 1.2-1.7 3s.6 3 1.7 3v6" />
        </svg>
      );
    case "seat":
      return (
        <svg {...GLYPH_PROPS} className={className}>
          <path d="M4.5 3v5.5a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V3M4.5 8.5V13M11.5 8.5V13M4.5 13h7" />
        </svg>
      );
    case "milestone":
      return (
        <svg {...GLYPH_PROPS} className={className}>
          <ellipse cx="8" cy="11" rx="4.2" ry="1.6" />
          <path d="M8 2.5v5.5M6.1 6.4 8 8.3l1.9-1.9" />
        </svg>
      );
  }
}

function DiffBadge({ stepId, diff }: { stepId: string; diff?: PlanDiff }) {
  if (!diff) return null;
  if (diff.preservedStepIds.includes(stepId)) {
    return (
      <span className="diff-badge inline-flex items-center gap-1 rounded border border-ice-green/40 bg-ice-green/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ice-green">
        <span aria-hidden="true">&#10003;</span> kept
      </span>
    );
  }
  const replaced = diff.replacedSteps.find((r) => r.newStepId === stepId);
  if (replaced) {
    return (
      <span className="diff-badge inline-flex items-center gap-1 rounded border border-sodium/40 bg-sodium/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-sodium">
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
    <ol className="itinerary-list flex flex-col gap-2.5">
      {plan.steps.map((step) => (
        <li key={step.stepId} className="plan-step grid grid-cols-[1.25rem_1fr] gap-x-3">
          <span className="relative z-10 flex items-start justify-center pt-4">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${PHASE_DOT[step.kind]}`} />
          </span>
          <div className="min-w-0 rounded-card border border-steel bg-boards p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <StepGlyph kind={step.kind} className="shrink-0 text-frost" />
              <span className="inline-block rounded border border-steel bg-well px-2 py-0.5 font-mono text-sm font-semibold tabular-nums text-ice">
                {step.clock}
              </span>
              <span className="text-sm font-semibold text-ice">{step.title}</span>
              <SourceBadge source={step.source} />
              <DiffBadge stepId={step.stepId} diff={diff} />
            </div>
            <p className="mt-1.5 text-sm leading-5 text-frost">
              {step.kind === "walk" ? walkDetail(venue, step) : step.detail}
            </p>
            {step.kind === "transit" && arrivalAdjustment && (
              <p className="mt-1 text-[13px] italic leading-5 text-frost">
                You said {arrivalAdjustment.requested}; nearest scheduled arrival is {arrivalAdjustment.resolved}.
              </p>
            )}
            {step.kind === "food" &&
              foodStepDietaryNeeds(plan, venue, step).map((need) => (
                <p key={need} className="mt-1 text-xs leading-5 text-frost">
                  {COPY.dietaryDisclaimer(need)}
                </p>
              ))}
          </div>
        </li>
      ))}
      {diff?.invalidatedStepIds.map((stepId) => {
        const priorTitle = priorSteps.find((s) => s.stepId === stepId)?.title;
        return (
          <li key={`dropped-${stepId}`} className="plan-step grid grid-cols-[1.25rem_1fr] gap-x-3">
            <span className="relative z-10 flex items-start justify-center pt-4">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-lamp/60" />
            </span>
            <div className="min-w-0 rounded-card border border-red-lamp/40 bg-red-lamp/10 p-3.5 text-sm text-red-lamp">
              <span aria-hidden="true">&#10007;</span>{" "}
              <span className="line-through">{priorTitle ?? stepId}</span> dropped
            </div>
          </li>
        );
      })}
    </ol>
  );
}
