import { ItineraryPlan } from "@/lib/planning/schemas";

/**
 * Differentiator sentences are computed here, client-side, from the two
 * plans' own numeric fields (walkingMinutes, waitMinutes). The locked
 * schemas.ts PlanResult carries no `runnerUpDeltas` field, so these are
 * derived directly rather than read off the trace stream. The plans' raw
 * `score` values are an internal ranking metric with no real-world meaning
 * to a user, so they never appear here; walking and waiting minutes already
 * carry the comparison.
 */
function buildDifferentiators(selected: ItineraryPlan, runnerUp: ItineraryPlan): string[] {
  const out: string[] = [];
  if (selected.gateId !== runnerUp.gateId) {
    const runnerUpGate = runnerUp.steps.find((s) => s.kind === "gate")?.title;
    const selectedGate = selected.steps.find((s) => s.kind === "gate")?.title;
    out.push(
      runnerUpGate && selectedGate
        ? `The runner-up enters at ${runnerUpGate} instead of ${selectedGate}.`
        : "The runner-up enters at a different gate.",
    );
  }
  const walkDelta = runnerUp.walkingMinutes - selected.walkingMinutes;
  if (walkDelta !== 0) {
    out.push(
      `The runner-up ${walkDelta > 0 ? "adds" : "saves"} ${Math.abs(walkDelta)} walking minute${Math.abs(walkDelta) === 1 ? "" : "s"} versus the selected plan.`,
    );
  }
  const waitDelta = runnerUp.waitMinutes - selected.waitMinutes;
  if (waitDelta !== 0) {
    out.push(
      `The runner-up ${waitDelta > 0 ? "adds" : "saves"} ${Math.abs(waitDelta)} waiting minute${Math.abs(waitDelta) === 1 ? "" : "s"} versus the selected plan.`,
    );
  }
  if (out.length === 0) {
    out.push("The selected plan ranked higher overall.");
  }
  return out;
}

/**
 * Human label for the runner-up: gate name, food stand name(s), and arrival
 * clock, all read directly off the plan's own steps and transitArrival
 * fields (the same data ItineraryTimeline renders for the selected plan).
 * Never the raw candidateId, which is an internal tie-break key
 * ("gate-1|stand-harbour-fresh|18:15|pickup-after-seating") with no meaning
 * to a user.
 */
function runnerUpLabel(runnerUp: ItineraryPlan): string {
  const gateTitle = runnerUp.steps.find((s) => s.kind === "gate")?.title;
  const foodTitles = runnerUp.steps
    .filter((s) => s.kind === "food")
    .map((s) => s.title.replace(/^Pick up food at /, ""));
  const parts = [gateTitle, foodTitles.join(" and ") || undefined, runnerUp.transitArrival ? `arriving ${runnerUp.transitArrival}` : undefined];
  return parts.filter((p): p is string => Boolean(p)).join(", ");
}

export function ConsideredRejected({ selected, runnerUp }: { selected: ItineraryPlan; runnerUp?: ItineraryPlan }) {
  if (!runnerUp) {
    return (
      <section
        aria-label="Considered and rejected"
        className="rounded-card border border-steel bg-boards p-4 text-sm text-frost"
      >
        No distinct runner-up plan was evaluated for this request.
      </section>
    );
  }

  const deltas = buildDifferentiators(selected, runnerUp);

  return (
    <section aria-label="Considered and rejected" className="rounded-card border border-steel bg-boards p-4">
      <h2 className="font-display text-base font-semibold uppercase tracking-[0.06em] text-frost">
        Considered and rejected
      </h2>
      <p className="mt-1.5 text-sm text-ice">Runner-up: {runnerUpLabel(runnerUp)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-frost">Walking</dt>
          <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-ice">
            {runnerUp.walkingMinutes} min <span className="text-frost">(selected {selected.walkingMinutes} min)</span>
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-frost">Waiting</dt>
          <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-ice">
            {runnerUp.waitMinutes} min <span className="text-frost">(selected {selected.waitMinutes} min)</span>
          </dd>
        </div>
      </dl>
      <ul className="mt-3 flex flex-col gap-1 text-sm leading-5 text-frost">
        {deltas.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </section>
  );
}
