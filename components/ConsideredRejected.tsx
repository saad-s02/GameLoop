import { ItineraryPlan } from "@/lib/planning/schemas";

/**
 * Differentiator sentences are computed here, client-side, from the two
 * plans' own numeric fields (score, walkingMinutes, waitMinutes). The
 * locked schemas.ts PlanResult carries no `runnerUpDeltas` field, so these
 * are derived directly rather than read off the trace stream.
 */
function buildDifferentiators(selected: ItineraryPlan, runnerUp: ItineraryPlan): string[] {
  const out: string[] = [];
  if (selected.gateId !== runnerUp.gateId) {
    out.push(`The runner-up enters at ${runnerUp.gateId} instead of ${selected.gateId}.`);
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
  out.push(`Selected plan scores ${(selected.score - runnerUp.score).toFixed(1)} points higher.`);
  return out;
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
      <p className="mt-1.5 text-sm text-ice">
        Runner-up: <span className="font-mono text-[13px] text-blue-glow">{runnerUp.candidateId}</span>
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-frost/80">Score</dt>
          <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-ice">
            {runnerUp.score.toFixed(1)} <span className="text-frost/60">(selected {selected.score.toFixed(1)})</span>
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-frost/80">Walking</dt>
          <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-ice">
            {runnerUp.walkingMinutes} min <span className="text-frost/60">(selected {selected.walkingMinutes} min)</span>
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-frost/80">Waiting</dt>
          <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-ice">
            {runnerUp.waitMinutes} min <span className="text-frost/60">(selected {selected.waitMinutes} min)</span>
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
