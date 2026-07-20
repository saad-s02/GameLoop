"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clarification,
  Constraint,
  DisruptionId,
  INPUT_CHAR_CAP,
  ItineraryStep,
  PlanApiInput,
  PlanResult,
  SessionContext,
  SessionContextSchema,
  SourceClass,
  TraceEvent,
} from "@/lib/planning/schemas";
import { loadVenue } from "@/lib/data/load";
import { useTraceStream } from "@/components/useTraceStream";
import { ConstraintContract } from "@/components/ConstraintContract";
import { ConstraintsStrip } from "@/components/ConstraintsStrip";
import { ActivityPanel } from "@/components/ActivityPanel";
import { ItineraryTimeline } from "@/components/ItineraryTimeline";
import { SkeletonTimeline } from "@/components/SkeletonTimeline";
import { ConsideredRejected } from "@/components/ConsideredRejected";
import { DisruptionControls } from "@/components/DisruptionControls";
import { MemoryPanel, readStoredSession, SESSION_STORAGE_KEY, SESSION_UPDATED_EVENT } from "@/components/MemoryPanel";
import { ResetControl } from "@/components/ResetControl";
import { FollowUpComposer, QuickChip } from "@/components/FollowUpComposer";
import { SourceBadge } from "@/components/SourceBadge";
import { COPY } from "@/lib/copy";

// Matches the "tonight" showcase game hardcoded in Task 9's loadPlannerInput.
const DEMO_GAME_ID = "2025030413";

/** Viewer's local wall-clock time of day, "HH:MM". Client-only: the server
 * has no notion of the viewer's clock, so this is read after mount rather
 * than seeded during SSR (see the null-until-mounted state below). */
function currentClock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

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
  {
    id: "vague",
    label: "Short on details",
    text: "Two kids, one gluten-free, train at 6:18, seated for warmups",
  },
];

type PlanEyebrow = { matchup: string; puckDropAt: string; source: SourceClass };

export default function PlanClient({ eyebrow }: { eyebrow: PlanEyebrow }) {
  return (
    <Suspense fallback={null}>
      <PlanClientInner eyebrow={eyebrow} />
    </Suspense>
  );
}

function PlanClientInner({ eyebrow }: { eyebrow: PlanEyebrow }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demo = searchParams.get("demo") === "1";
  const venue = useMemo(() => loadVenue(), []);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const infeasibleRef = useRef<HTMLDivElement | null>(null);

  // Tonight's-game eyebrow: null until the client mounts, so the puck-drop
  // countdown never depends on a server-side notion of "now" (see
  // currentClock above), then refreshed on a coarse one-minute interval --
  // a text update, not animation, so no reduced-motion concern.
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
  const matchupLabel = eyebrow.matchup;

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
  const [history, setHistory] = useState<string[]>([]);
  const [lastPlanContext, setLastPlanContext] = useState<{
    planId: string;
    constraints: Constraint[];
    disruptions: DisruptionId[];
  } | null>(null);
  const [refined, setRefined] = useState(false);
  const [assumptions, setAssumptions] = useState<{ field: string; assumed: string; reason: string }[]>([]);

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

    if (result.feasible && result.plan) {
      const parsedConstraints =
        [...events].reverse().find((e) => e.event.type === "request_parsed")?.event;
      setLastPlanContext({
        planId: result.plan.planId,
        constraints: parsedConstraints?.type === "request_parsed" ? parsedConstraints.constraints : [],
        disruptions: submittedBody?.disruptions ?? [],
      });
    }

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
  }, [events, submittedBody]);

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

  // Assumptions persist like the contract does: `events` resets to [] on
  // every new submit, but the previously shown assumption row must not
  // disappear until a fresh request actually resolves.
  useEffect(() => {
    const fresh = events
      .filter((e) => e.event.type === "assumption_made")
      .map((e) => (e.event.type === "assumption_made" ? { field: e.event.field, assumed: e.event.assumed, reason: e.event.reason } : null))
      .filter((a): a is { field: string; assumed: string; reason: string } => a !== null);
    if (fresh.length > 0) setAssumptions(fresh);
    // A request that emitted a plan but no assumption events clears stale assumptions:
    if (events.some((e) => e.event.type === "plan_result") && fresh.length === 0) setAssumptions([]);
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

  const submitRefinement = (refinement: NonNullable<PlanApiInput["refinement"]>, historyText: string) => {
    setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
    setHistory((h) => [...h, historyText]);
    setRefined(true);
    setSubmittedBody(buildBody({ refinement, disruptions, priorPlanId: undefined }));
  };

  const onAnswer = ({ constraints, historyText }: { constraints: Constraint[]; historyText: string }) => {
    submitRefinement(
      {
        baseConstraints: persistedRequestParsed?.constraints ?? [],
        answerConstraints: constraints,
        pendingClarifications: (persistedRequestParsed?.clarificationsNeeded ?? []) as Clarification[],
        prior: lastPlanContext ?? undefined,
      },
      historyText,
    );
  };

  const refinementBase = () => ({
    baseConstraints: persistedRequestParsed?.constraints ?? [],
    pendingClarifications: (persistedRequestParsed?.clarificationsNeeded ?? []) as Clarification[],
    prior: lastPlanContext ?? undefined,
  });
  const onQuickChip = (chip: QuickChip) => submitRefinement({ ...refinementBase(), answerConstraints: [chip.delta] }, chip.label);
  const onFollowUpText = (t: string) => submitRefinement({ ...refinementBase(), followUpText: t }, t);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setDisruptions([]);
    setHistory([text.trim()]);
    setLastPlanContext(null);
    setRefined(false);
    setAssumptions([]);
    setSubmittedBody(buildBody());
  };

  const onDisruption = (id: DisruptionId) => {
    // Dedupe by id: train-plus-18 is non-idempotent (it adds 18 minutes each
    // application), so a stray re-click must not send the same id twice.
    const next = [...new Set([...disruptions, id])].slice(-5);
    setDisruptions(next);
    setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
    if (refined) {
      setSubmittedBody(buildBody({
        disruptions: next,
        refinement: { ...refinementBase(), answerConstraints: [] },
        priorPlanId: undefined,
      }));
    } else {
      setSubmittedBody(buildBody({ disruptions: next, priorPlanId: lastPlanResult?.plan?.planId }));
    }
  };

  const isReplanning = status === "streaming" && lastPlanResult !== null;
  const heroSentence = lastPlanResult?.feasible ? COPY.heroSentence(lastPlanResult.plan) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-7">
        <div className="flex flex-col gap-2">
          <div
            aria-label="Tonight's game"
            className="arrive arrive-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-l-2 border-sodium py-0.5 pl-2.5 text-[11px]"
          >
            <span className="font-mono font-medium uppercase tracking-[0.14em] text-frost">Tonight</span>
            <span aria-hidden="true" className="text-frost">&middot;</span>
            <span className="font-mono text-frost">{matchupLabel}</span>
            <span aria-hidden="true" className="text-frost">&middot;</span>
            <span className="font-mono text-frost">
              {puckDrop.prefix} <span className="text-sodium tabular-nums">{puckDrop.value}</span>
            </span>
            <SourceBadge source={eyebrow.source} title="Tonight's matchup and puck drop, from the NHL snapshot fixture" />
          </div>
          <h1 className="arrive arrive-2 font-display text-3xl font-bold uppercase tracking-wide text-ice">Plan My Night</h1>
          <p className="arrive arrive-2 text-sm text-frost">Tell us about your group in your own words, or start from an example.</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="arrive arrive-3 flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                aria-pressed={chipId === chip.id}
                onClick={() => {
                  setText(chip.text);
                  setChipId(chip.id);
                }}
                className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 py-1.5 text-sm font-medium motion-safe:transition-colors sm:min-h-0 ${
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
              className="rounded-card border border-steel bg-well/70 px-3 py-2.5 text-[15px] leading-6 text-ice placeholder:text-frost motion-safe:transition-colors focus:border-steel-bright"
              placeholder="e.g. We're a family of four, need gluten-free food, and want to be seated before warmups."
            />
          </label>
          <p className="font-mono text-xs tabular-nums text-frost">{text.length} / {INPUT_CHAR_CAP}</p>
          <button
            type="submit"
            disabled={status === "streaming" || !text.trim()}
            className="cta-ready inline-flex min-h-11 items-center justify-center self-start rounded-well bg-ice px-4 py-2 text-sm font-semibold text-bowl outline outline-2 outline-offset-2 outline-blue-glow/35 motion-safe:transition-colors hover:bg-ice/90 hover:outline-blue-glow/65 disabled:cursor-not-allowed disabled:opacity-50 disabled:outline-transparent disabled:hover:outline-transparent sm:min-h-0"
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
              onAnswer={onAnswer}
            />
          </div>
        )}

        {assumptions.length > 0 && (
          <section aria-label="Assumed for this plan" className="flex flex-col gap-2">
            <h2 className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-frost">{COPY.assumedHeading}</h2>
            <ul className="flex flex-col gap-1.5">
              {assumptions.map((a) => (
                <li key={a.field} className="flex items-start gap-2 rounded-card border border-sodium/40 bg-sodium/10 p-3 text-sm text-ice">
                  <span aria-hidden="true" className="font-mono text-sodium">~</span>
                  <span>
                    <span className="mr-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-sodium">assumed</span>
                    {a.assumed}. <span className="text-frost">{a.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lastPlanResult && !lastPlanResult.feasible && (
          <section
            ref={infeasibleRef}
            tabIndex={-1}
            aria-label="Infeasible"
            className="scroll-mt-20 rounded-card border border-red-lamp/40 bg-red-lamp/10 p-4 text-sm text-ice"
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

        {lastPlanResult?.feasible && lastPlanResult.plan ? (
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
            <ConstraintsStrip outcomes={lastPlanResult.plan.constraintOutcomes} />
            <ItineraryTimeline
              plan={lastPlanResult.plan}
              venue={venue}
              adjustments={lastPlanResult.adjustments}
              diff={lastPlanResult.diff}
              priorSteps={priorPlanSteps}
            />
          </div>
        ) : (
          // No plan on screen yet (fresh submit, or a replan following an
          // infeasible result): the hero slot fills with the skeleton
          // instead of sitting empty until plan_result lands. A replan over
          // an existing feasible plan takes the branch above instead --
          // that plan stays visible, dimmed via .replan-dim, so this never
          // stacks a skeleton over it. The skeleton also stays mounted
          // through a "stalled" status (the 6s stall timer flips status
          // without tearing the stream down), so it never vanishes mid-wait.
          (status === "streaming" || status === "stalled") && <SkeletonTimeline />
        )}

        {submittedBody && (
          <ActivityPanel events={events} status={status} streamText={streamText} onRetry={retry} />
        )}

        {lastPlanResult && !lastPlanResult.feasible && lastPlanResult.bestAlternative && (
          <div ref={resultsRef} tabIndex={-1} aria-label="Closest feasible alternative" className="scroll-mt-20">
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

        {history.length > 0 && persistedRequestParsed && (
          <section aria-label="What you have told us" className="flex flex-col gap-2">
            <h2 className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-frost">{COPY.historyHeading}</h2>
            <ol className="flex flex-col gap-1.5">
              {history.map((h, i) => (
                <li key={i} className="rounded-card border border-steel bg-well/60 px-3 py-2 text-[13px] italic leading-5 text-frost">
                  &ldquo;{h}&rdquo;
                </li>
              ))}
            </ol>
          </section>
        )}
        {persistedRequestParsed && (
          <FollowUpComposer demo={demo} disabled={status === "streaming"} onQuickChip={onQuickChip} onFollowUpText={onFollowUpText} />
        )}
      </div>

      <aside className="arrive arrive-4 flex w-full flex-col gap-4 md:sticky md:top-20 md:w-80">
        <MemoryPanel />
        <ResetControl />
      </aside>
    </main>
  );
}
