"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Constraint,
  DisruptionId,
  INPUT_CHAR_CAP,
  ItineraryStep,
  PlanApiInput,
  PlanResult,
  SessionContext,
  SessionContextSchema,
  TraceEvent,
} from "@/lib/planning/schemas";
import { loadVenue } from "@/lib/data/load";
import { useTraceStream } from "@/components/useTraceStream";
import { ConstraintContract } from "@/components/ConstraintContract";
import { ConstraintsStrip } from "@/components/ConstraintsStrip";
import { ActivityPanel } from "@/components/ActivityPanel";
import { ItineraryTimeline } from "@/components/ItineraryTimeline";
import { ConsideredRejected } from "@/components/ConsideredRejected";
import { DisruptionControls } from "@/components/DisruptionControls";
import { MemoryPanel, readStoredSession, SESSION_STORAGE_KEY, SESSION_UPDATED_EVENT } from "@/components/MemoryPanel";
import { ResetControl } from "@/components/ResetControl";

// Matches the "tonight" showcase game hardcoded in Task 9's loadPlannerInput.
const DEMO_GAME_ID = "2025030413";

const CHIPS: { id: NonNullable<PlanApiInput["chipId"]>; label: string; text: string }[] = [
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
];

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanPageInner />
    </Suspense>
  );
}

function PlanPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demo = searchParams.get("demo") === "1";
  const venue = useMemo(() => loadVenue(), []);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const infeasibleRef = useRef<HTMLDivElement | null>(null);

  const [text, setText] = useState("");
  const [chipId, setChipId] = useState<PlanApiInput["chipId"]>(undefined);
  const [disruptions, setDisruptions] = useState<DisruptionId[]>([]);
  const [submittedBody, setSubmittedBody] = useState<PlanApiInput | null>(null);
  const [lastPlanResult, setLastPlanResult] = useState<PlanResult | null>(null);
  // The plan being replaced by an in-flight disruption re-plan, kept only so
  // ItineraryTimeline can render readable titles for diff.invalidatedStepIds
  // instead of raw stepIds once the prior plan's steps are gone from state.
  const [priorPlanSteps, setPriorPlanSteps] = useState<ItineraryStep[]>([]);
  // The most recent request_parsed contract, kept separate from `events`
  // (which useTraceStream resets to [] on every new submit) so the
  // ConstraintContract card never disappears during a replan: it just dims
  // until a fresh request_parsed frame replaces it.
  const [persistedRequestParsed, setPersistedRequestParsed] = useState<Pick<
    Extract<TraceEvent, { type: "request_parsed" }>,
    "constraints" | "clarificationsNeeded"
  > | null>(null);

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
  }, [events]);

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

  // Update the persisted constraint contract only when a fresh request_parsed
  // frame actually arrives; `events` resets to [] at the start of every new
  // submit, but that reset must not clear the previously shown contract.
  useEffect(() => {
    const envelope = events.find((e) => e.event.type === "request_parsed");
    if (envelope?.event.type === "request_parsed") {
      setPersistedRequestParsed({
        constraints: envelope.event.constraints,
        clarificationsNeeded: envelope.event.clarificationsNeeded,
      });
    }
  }, [events]);

  const constraintContractStale = status === "streaming" && !events.some((e) => e.event.type === "request_parsed");

  const buildBody = (overrides: Partial<PlanApiInput> = {}): PlanApiInput => ({
    mode: "plan",
    text,
    chipId,
    demo,
    disruptions: [],
    priorPlanId: undefined,
    sessionContext: readStoredSession() ?? undefined,
    ...overrides,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setDisruptions([]);
    setSubmittedBody(buildBody());
  };

  const onDisruption = (id: DisruptionId) => {
    // Dedupe by id: train-plus-18 is non-idempotent (it adds 18 minutes each
    // application), so a stray re-click must not send the same id twice.
    const next = [...new Set([...disruptions, id])].slice(-5);
    setDisruptions(next);
    setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
    setSubmittedBody(buildBody({ disruptions: next, priorPlanId: lastPlanResult?.plan?.planId }));
  };

  const isReplanning = status === "streaming" && lastPlanResult !== null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-7">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ice">Plan My Night</h1>
          <p className="text-sm text-frost">Tell us about your group in your own words, or start from an example.</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                aria-pressed={chipId === chip.id}
                onClick={() => {
                  setText(chip.text);
                  setChipId(chip.id);
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium motion-safe:transition-colors ${
                  chipId === chip.id
                    ? "border-blue-glow/60 bg-glass text-ice"
                    : "border-steel text-frost hover:border-steel-bright hover:text-ice"
                }`}
              >
                {chipId === chip.id ? "✓ " : ""}
                {chip.label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ice">
            Your request
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setChipId(undefined);
              }}
              maxLength={INPUT_CHAR_CAP}
              rows={4}
              required
              className="rounded-card border border-steel bg-well/70 px-3 py-2.5 text-[15px] leading-6 text-ice placeholder:text-frost/50 motion-safe:transition-colors focus:border-steel-bright"
              placeholder="e.g. We're a family of four, need gluten-free food, and want to be seated before warmups."
            />
          </label>
          <p className="font-mono text-xs tabular-nums text-frost/70">{text.length} / {INPUT_CHAR_CAP}</p>
          <button
            type="submit"
            disabled={status === "streaming" || !text.trim()}
            className="self-start rounded-well bg-ice px-4 py-2 text-sm font-semibold text-bowl motion-safe:transition-colors hover:bg-ice/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "streaming" && !lastPlanResult ? "Planning…" : "Plan my night"}
          </button>
        </form>

        {persistedRequestParsed && (
          <div
            aria-busy={constraintContractStale}
            className={`replan-wrap${constraintContractStale ? " replan-dim" : ""}`}
          >
            <ConstraintContract
              constraints={persistedRequestParsed.constraints}
              clarificationsNeeded={persistedRequestParsed.clarificationsNeeded}
            />
          </div>
        )}

        {submittedBody && (
          <ActivityPanel events={events} status={status} streamText={streamText} onRetry={retry} />
        )}

        {lastPlanResult && !lastPlanResult.feasible && (
          <section
            ref={infeasibleRef}
            tabIndex={-1}
            aria-label="Infeasible"
            className="rounded-card border border-red-lamp/40 bg-red-lamp/10 p-4 text-sm text-ice"
          >
            <p className="font-semibold text-red-lamp">This request cannot be satisfied as stated:</p>
            <ul className="mt-1 list-disc pl-5 leading-6">
              {lastPlanResult.violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
            {lastPlanResult.bestAlternative && <p className="mt-2 text-frost">Closest feasible alternative shown below.</p>}
          </section>
        )}

        {lastPlanResult?.feasible && lastPlanResult.plan && (
          <div
            ref={resultsRef}
            tabIndex={-1}
            aria-busy={isReplanning}
            className={`replan-wrap${isReplanning ? " replan-dim" : ""}`}
          >
            <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">
              Tonight&apos;s plan
            </h2>
            <ConstraintsStrip outcomes={lastPlanResult.plan.constraintOutcomes} />
            <ItineraryTimeline
              plan={lastPlanResult.plan}
              venue={venue}
              adjustments={lastPlanResult.adjustments}
              diff={lastPlanResult.diff}
              priorSteps={priorPlanSteps}
            />
          </div>
        )}

        {lastPlanResult && !lastPlanResult.feasible && lastPlanResult.bestAlternative && (
          <div ref={resultsRef} tabIndex={-1}>
            <ConstraintsStrip outcomes={lastPlanResult.bestAlternative.constraintOutcomes} />
            <ItineraryTimeline plan={lastPlanResult.bestAlternative} venue={venue} adjustments={lastPlanResult.adjustments} />
          </div>
        )}

        {lastPlanResult?.feasible && lastPlanResult.plan && (
          <ConsideredRejected selected={lastPlanResult.plan} runnerUp={lastPlanResult.runnerUp} />
        )}

        {lastPlanResult?.feasible && (
          <DisruptionControls onTrigger={onDisruption} disabled={status === "streaming"} />
        )}
      </div>

      <aside className="flex w-full flex-col gap-4 md:sticky md:top-20 md:w-80">
        <MemoryPanel />
        <ResetControl />
      </aside>
    </main>
  );
}
