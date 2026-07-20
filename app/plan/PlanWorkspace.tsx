"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clarification,
  Constraint,
  DisruptionId,
  ItineraryStep,
  PlanApiInput,
  PlanResult,
  SessionContext,
  SessionContextSchema,
  TraceEvent,
} from "@/lib/planning/schemas";
import { loadVenue } from "@/lib/data/load";
import { RealNearbyEntry } from "@/lib/data/realNearbySchema";
import { ChatTurn } from "@/lib/chat/turns";
import { useTraceStream } from "@/components/useTraceStream";
import { MessageThread } from "@/components/MessageThread";
import { ChatComposer, QuickChip, SuggestedPrompt } from "@/components/ChatComposer";
import { PlanEyebrow, PlanPanel } from "@/components/PlanPanel";
import { DISRUPTIONS } from "@/components/DisruptionControls";
import { readStoredSession, SESSION_STORAGE_KEY, SESSION_UPDATED_EVENT } from "@/components/MemoryPanel";
import { COPY } from "@/lib/copy";

// Matches the "tonight" showcase game hardcoded in Task 9's loadPlannerInput.
const DEMO_GAME_ID = "2025030413";

export default function PlanWorkspace(props: { eyebrow: PlanEyebrow; realNearby: RealNearbyEntry[] }) {
  return (
    <Suspense fallback={null}>
      <PlanWorkspaceInner {...props} />
    </Suspense>
  );
}

function PlanWorkspaceInner({ eyebrow, realNearby }: { eyebrow: PlanEyebrow; realNearby: RealNearbyEntry[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demo = searchParams.get("demo") === "1";
  const venue = useMemo(() => loadVenue(), []);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const infeasibleRef = useRef<HTMLDivElement | null>(null);

  const [disruptions, setDisruptions] = useState<DisruptionId[]>([]);
  const [submittedBody, setSubmittedBody] = useState<PlanApiInput | null>(null);
  const [lastPlanResult, setLastPlanResult] = useState<PlanResult | null>(null);
  // The plan being replaced by an in-flight re-plan, kept only so
  // ItineraryTimeline can render readable titles for diff.invalidatedStepIds
  // instead of raw stepIds once the prior plan's steps are gone from state.
  const [priorPlanSteps, setPriorPlanSteps] = useState<ItineraryStep[]>([]);
  // The most recent request_parsed contract, kept separate from `events`
  // (which useTraceStream resets to [] on every new submit): refinements
  // build on it, and its presence is what flips the composer into
  // follow-up mode.
  const [persistedRequestParsed, setPersistedRequestParsed] = useState<Pick<
    Extract<TraceEvent, { type: "request_parsed" }>,
    "constraints" | "clarificationsNeeded"
  > | null>(null);
  const [lastPlanContext, setLastPlanContext] = useState<{
    planId: string;
    constraints: Constraint[];
    disruptions: DisruptionId[];
  } | null>(null);
  const [refined, setRefined] = useState(false);

  // The conversation ledger. Completed turns are frozen snapshots; the live
  // turn is derived from the current stream below.
  const [completedTurns, setCompletedTurns] = useState<ChatTurn[]>([]);
  const [activeUserText, setActiveUserText] = useState<string | null>(null);
  const turnIdRef = useRef(1);
  // The last free-text request body sent; disruption replans re-send it so
  // the server re-derives the same contract (chip path in demo mode).
  const lastTextRef = useRef("");
  const lastChipIdRef = useRef<PlanApiInput["chipId"]>(undefined);

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

  // Update the persisted contract only when a fresh request_parsed frame
  // actually arrives; `events` resets to [] at the start of every new
  // submit, but that reset must not clear the refinement base.
  useEffect(() => {
    const envelope = events.find((e) => e.event.type === "request_parsed");
    if (envelope?.event.type === "request_parsed") {
      setPersistedRequestParsed({
        constraints: envelope.event.constraints,
        clarificationsNeeded: envelope.event.clarificationsNeeded,
      });
    }
  }, [events]);

  const turns: ChatTurn[] =
    activeUserText === null
      ? completedTurns
      : [...completedTurns, { id: 0, userText: activeUserText, envelopes: events, streamText, status }];

  const freezeActiveTurn = () => {
    if (activeUserText !== null) {
      setCompletedTurns((t) => [
        ...t,
        {
          id: turnIdRef.current++,
          userText: activeUserText,
          envelopes: events,
          streamText,
          status: status === "error" ? "error" : "done",
        },
      ]);
    }
  };

  const buildBody = (text: string, overrides: Partial<PlanApiInput> = {}): PlanApiInput => ({
    mode: "plan",
    text,
    chipId: undefined,
    demo,
    disruptions: [],
    priorPlanId: undefined,
    sessionContext: readStoredSession() ?? undefined,
    ...overrides,
  });

  const submitTurn = (userText: string, body: PlanApiInput) => {
    freezeActiveTurn();
    lastTextRef.current = body.text;
    lastChipIdRef.current = body.chipId;
    setActiveUserText(userText);
    setSubmittedBody(body);
  };

  const startFresh = (text: string, chipId?: PlanApiInput["chipId"]) => {
    setDisruptions([]);
    setLastPlanContext(null);
    setRefined(false);
    submitTurn(text, buildBody(text, { chipId }));
  };

  const refinementBase = () => ({
    baseConstraints: persistedRequestParsed?.constraints ?? [],
    pendingClarifications: (persistedRequestParsed?.clarificationsNeeded ?? []) as Clarification[],
    prior: lastPlanContext ?? undefined,
  });

  const submitRefinement = (refinement: NonNullable<PlanApiInput["refinement"]>, label: string) => {
    setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
    setRefined(true);
    submitTurn(label, buildBody(lastTextRef.current || label, { refinement, disruptions, priorPlanId: undefined }));
  };

  const onSuggestedPrompt = (p: SuggestedPrompt) => startFresh(p.text, p.id);
  const onSubmitText = (text: string) => {
    if (persistedRequestParsed) {
      submitRefinement({ ...refinementBase(), followUpText: text }, text);
    } else {
      startFresh(text);
    }
  };
  const onAnswer = ({ constraints, historyText }: { constraints: Constraint[]; historyText: string }) =>
    submitRefinement({ ...refinementBase(), answerConstraints: constraints }, historyText);
  const onQuickChip = (chip: QuickChip) =>
    submitRefinement({ ...refinementBase(), answerConstraints: [chip.delta] }, chip.label);

  const onDisruption = (id: DisruptionId) => {
    // Dedupe by id: train-plus-18 is non-idempotent (it adds 18 minutes each
    // application), so a stray re-click must not send the same id twice.
    const next = [...new Set([...disruptions, id])].slice(-5);
    setDisruptions(next);
    setPriorPlanSteps(lastPlanResult?.plan?.steps ?? []);
    const label = DISRUPTIONS.find((d) => d.id === id)?.label ?? id;
    if (refined) {
      submitTurn(
        label,
        buildBody(lastTextRef.current || label, {
          disruptions: next,
          refinement: { ...refinementBase(), answerConstraints: [] },
          priorPlanId: undefined,
        }),
      );
    } else {
      submitTurn(
        label,
        buildBody(lastTextRef.current || label, {
          chipId: lastChipIdRef.current,
          disruptions: next,
          priorPlanId: lastPlanResult?.plan?.planId,
        }),
      );
    }
  };

  // A stalled stream is still in flight (the 6s stall timer flips status
  // without tearing the request down), so the composer and disruptions stay
  // locked through it: a submit during a stall would otherwise freeze the
  // stalled turn as "done".
  const busy = status === "streaming" || status === "stalled";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="arrive arrive-1 font-display text-3xl font-bold uppercase tracking-wide text-ice">
            Plan My Night
          </h1>
          <p className="arrive arrive-2 text-sm text-frost">
            Tell us about your group in your own words, or start from an example.
          </p>
        </div>
        <a
          href="#plan-panel"
          className="sticky top-3 z-10 self-end rounded-full border border-steel-bright bg-boards px-3 py-1.5 text-xs font-semibold text-ice md:hidden"
        >
          {COPY.jumpToPlan}
        </a>
        <MessageThread turns={turns} onAnswer={onAnswer} onRetry={retry} />
        <ChatComposer
          demo={demo}
          disabled={busy}
          hasPlanContext={persistedRequestParsed !== null}
          onSuggestedPrompt={onSuggestedPrompt}
          onQuickChip={onQuickChip}
          onSubmitText={onSubmitText}
        />
      </div>
      <PlanPanel
        eyebrow={eyebrow}
        venue={venue}
        realNearby={realNearby}
        result={lastPlanResult}
        priorPlanSteps={priorPlanSteps}
        isReplanning={status === "streaming" && lastPlanResult !== null}
        streamingOrStalled={busy}
        showDisruptions={lastPlanResult?.feasible === true}
        onDisruption={onDisruption}
        disruptionsDisabled={busy}
        resultsRef={resultsRef}
        infeasibleRef={infeasibleRef}
      />
    </main>
  );
}
