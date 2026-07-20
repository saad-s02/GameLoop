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
