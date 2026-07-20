"use client";

import { useEffect, useRef, useState } from "react";
import { TraceEnvelope, TraceEvent } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";
import { SourceBadge } from "./SourceBadge";
import { TraceStreamStatus } from "./useTraceStream";

const STATUS_MESSAGE: Record<TraceStreamStatus, string> = {
  idle: "Waiting to start.",
  streaming: "Streaming decision log…",
  stalled: "Connection interrupted, retrying available.",
  done: "Decision log complete.",
  error: "Something went wrong reaching the planner.",
};

const EVENT_TITLE: Record<TraceEvent["type"], string> = {
  request_parsed: "Request parsed",
  constraint_adjusted: "Constraint adjusted",
  assumption_made: "Assumed",
  data_requested: "Data requested",
  data_received: "Data received",
  candidates_summary: "Candidates summarized",
  candidate_evaluated: "Candidate evaluated",
  decision: "Decision",
  plan_result: "Plan result",
  response_chunk: "Narrative",
  moment_package: "Moment package",
  recap_result: "Recap",
  fallback_used: "Fallback used",
  error: "Error",
  done: "Done",
};

/** Verdict events get the promoted center-ice dot. */
const VERDICT_TYPES: TraceEvent["type"][] = ["plan_result", "recap_result"];

function formatElapsed(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function EventBody({ event }: { event: TraceEvent }) {
  switch (event.type) {
    case "request_parsed":
      return (
        <p className="text-sm leading-6">
          Parsed {event.constraints.length} constraint{event.constraints.length === 1 ? "" : "s"}
          {event.clarificationsNeeded.length > 0 ? `, ${event.clarificationsNeeded.length} clarification(s) needed.` : "."}
        </p>
      );
    case "constraint_adjusted":
      return (
        <p className="text-sm leading-6">
          {event.requested === "not set" ? "Not set before; " : `You said ${event.requested}; `}
          {event.reason} Resolved to {event.resolved}.
        </p>
      );
    case "assumption_made":
      return (
        <p className="text-sm leading-6">
          <span className="mr-1.5 inline-flex items-center gap-1 rounded border border-sodium/40 bg-sodium/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-sodium">
            <span aria-hidden="true">~</span> assumed
          </span>
          {event.assumed}. {event.reason}
        </p>
      );
    case "data_requested":
      return (
        <p className="text-sm leading-6">
          Called <span className="font-mono text-[13px] text-blue-glow">{event.tool}</span>.
        </p>
      );
    case "data_received":
      return (
        <p className="flex flex-wrap items-center gap-2 text-sm leading-6">
          <span className="font-mono text-[13px] text-blue-glow">{event.tool}</span>
          <span>
            returned in <span className="font-mono text-[13px] tabular-nums">{event.latencyMs.toFixed(0)} ms</span>
          </span>
          <SourceBadge source={event.source} />
        </p>
      );
    case "candidates_summary":
      return (
        <p className="text-sm leading-6">
          Evaluated <span className="font-mono text-[13px] tabular-nums">{event.evaluated}</span> candidate
          {event.evaluated === 1 ? "" : "s"}, <span className="font-mono text-[13px] tabular-nums">{event.feasible}</span> feasible.
        </p>
      );
    case "candidate_evaluated":
      // The raw score is an internal ranking metric, not shown here; it stays
      // available in this row's own "Raw event" details below. Violations, when
      // present, are the meaningful part of this row's primary text.
      return (
        <p className="text-sm leading-6">
          Candidate evaluated.{event.violations.length > 0 ? ` ${event.violations.join("; ")}.` : " Feasible."}
        </p>
      );
    case "decision":
      return <p className="text-sm leading-6">{event.summary}</p>;
    case "plan_result":
      return (
        <p className="text-sm leading-6">
          {event.result.feasible ? "A feasible plan was selected." : "No feasible plan was found."}
        </p>
      );
    case "response_chunk":
      return <p className="text-sm leading-6 text-frost">Narrative text streaming…</p>;
    case "moment_package":
      return (
        <p className="text-sm leading-6">
          {event.pkg.moments.length} moment(s) packaged:{" "}
          <span className="font-mono text-[13px]">{event.pkg.scoreLine}</span>
        </p>
      );
    case "recap_result":
      return <p className="text-sm leading-6">Personal Game Memory generated.</p>;
    case "fallback_used":
      return <p className="text-sm leading-6">{COPY.fallbackUsed(event.reason)}</p>;
    case "error":
      return <p className="text-sm leading-6 text-red-lamp">{event.message}</p>;
    case "done":
      return <p className="text-sm leading-6 text-frost">Stream complete.</p>;
  }
}

function FaceoffDot({ state, promoted }: { state: "complete" | "streaming"; promoted: boolean }) {
  if (promoted) {
    return (
      <span className="flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border border-line-red/40">
        <span className="h-2.5 w-2.5 rounded-full bg-line-red" />
      </span>
    );
  }
  if (state === "streaming") {
    return (
      <span className="streaming-dot h-2.5 w-2.5 rounded-full bg-sodium shadow-[0_0_10px_rgba(232,179,75,0.55)]" />
    );
  }
  return <span className="h-2.5 w-2.5 rounded-full border-2 border-blue-glow/80 bg-bowl" />;
}

function EventCard({
  envelope,
  isStreamingRow,
}: {
  envelope: TraceEnvelope;
  isStreamingRow: boolean;
}) {
  const promoted = VERDICT_TYPES.includes(envelope.event.type);
  return (
    <li className="log-row relative grid grid-cols-[4rem_1.375rem_1fr] gap-x-3">
      {isStreamingRow && (
        <span aria-hidden="true" className="absolute -left-4 inset-y-0 w-0.5 bg-sodium" />
      )}
      <span className="pt-0.5 text-right font-mono text-xs tabular-nums text-frost">
        #{String(envelope.seq).padStart(2, "0")}
      </span>
      <span className="relative z-10 flex items-start justify-center pt-1">
        <FaceoffDot state={isStreamingRow ? "streaming" : "complete"} promoted={promoted} />
      </span>
      <div className="min-w-0">
        <span
          className={`font-display text-[15px] font-semibold uppercase tracking-[0.08em] ${
            promoted ? "text-ice" : "text-frost"
          }`}
        >
          {EVENT_TITLE[envelope.event.type]}
        </span>
        <EventBody event={envelope.event} />
        <details className="mt-1.5">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.08em] text-frost hover:text-ice">
            Raw event
          </summary>
          <p className="mt-1.5 text-xs leading-5 text-frost">{COPY.fiction}</p>
          <pre className="mt-1.5 overflow-x-auto rounded-well bg-well p-3 text-[11px] leading-relaxed text-frost">
            {JSON.stringify(envelope, null, 2)}
          </pre>
        </details>
      </div>
    </li>
  );
}

export function ActivityPanel({
  events,
  status,
  streamText,
  onRetry,
}: {
  events: TraceEnvelope[];
  status: TraceStreamStatus;
  streamText: string;
  onRetry?: () => void;
}) {
  // Ledger clock: stamp each envelope with its client arrival time relative
  // to the first frame of its request. Write-once per key, so the render-time
  // ref mutation is idempotent (StrictMode-safe). This is a UI measurement of
  // stream arrival, not an external data value.
  const arrivalsRef = useRef<Map<string, number>>(new Map());
  const startsRef = useRef<Map<string, number>>(new Map());
  if (typeof performance !== "undefined") {
    for (const envelope of events) {
      const key = `${envelope.requestId}:${envelope.seq}`;
      if (!arrivalsRef.current.has(key)) {
        if (!startsRef.current.has(envelope.requestId)) {
          startsRef.current.set(envelope.requestId, performance.now());
        }
        arrivalsRef.current.set(key, performance.now() - startsRef.current.get(envelope.requestId)!);
      }
    }
  }

  const cardEvents = events.filter((e) => e.event.type !== "response_chunk");
  const lastEnvelope = cardEvents.at(-1);
  const lastSeq = lastEnvelope?.seq ?? -1;
  const totalMs = lastEnvelope
    ? arrivalsRef.current.get(`${lastEnvelope.requestId}:${lastEnvelope.seq}`)
    : undefined;

  // Open while the trace streams in (the streaming rows are part of the show),
  // auto-collapse once it completes. A manual toggle wins over that default
  // for the rest of this plan; the next fresh stream (a new plan, or a retry)
  // clears the override and starts the cycle over.
  const [open, setOpen] = useState(true);
  const userToggledRef = useRef(false);
  const prevStatusRef = useRef<TraceStreamStatus>(status);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === "streaming" && prevStatus !== "streaming") {
      userToggledRef.current = false;
      setOpen(true);
    } else if (status === "done" && !userToggledRef.current) {
      setOpen(false);
    }
  }, [status]);

  return (
    <section aria-label="Decision log" className="flex flex-col gap-4 rounded-card border border-steel bg-boards p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold uppercase tracking-[0.06em] text-ice">
          Decision log
        </h2>
        <div className="flex items-center gap-2">
          <p
            aria-live="polite"
            className={`flex items-center gap-2 text-sm ${
              status === "error"
                ? "rounded-card border border-red-lamp/40 bg-red-lamp/10 px-3 py-1.5 text-red-lamp"
                : "text-frost"
            }`}
          >
            {status === "streaming" && (
              <span aria-hidden="true" className="streaming-dot h-2 w-2 rounded-full bg-sodium" />
            )}
            {STATUS_MESSAGE[status]}
            {status === "done" && totalMs !== undefined && totalMs >= 100 && (
              <span className="font-mono text-xs tabular-nums text-sodium">{formatElapsed(totalMs)}</span>
            )}
          </p>
          {(status === "stalled" || status === "error") && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-well border border-steel-bright px-2 py-0.5 text-xs font-semibold text-ice motion-safe:transition-colors hover:bg-glass"
            >
              Retry
            </button>
          )}
        </div>
      </div>
      <details className="log-details" open={open}>
        {/* preventDefault cancels the native toggle so React alone owns `open`;
            a programmatic open change can then never masquerade as user intent
            (the native toggle event fires for programmatic changes too). */}
        <summary
          onClick={(e) => {
            e.preventDefault();
            userToggledRef.current = true;
            setOpen((o) => !o);
          }}
          className="log-summary flex cursor-pointer list-none items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-[0.08em] text-frost hover:text-ice [&::-webkit-details-marker]:hidden"
        >
          {COPY.decisionLogSummary(cardEvents.length)}
        </summary>
        <div className="log-details-body mt-4 flex flex-col gap-4">
          {streamText && (
            <p className="rounded-card border border-steel bg-well/60 p-3 text-sm leading-6 text-ice/90">{streamText}</p>
          )}
          <ol className="log-list flex flex-col gap-5">
            {cardEvents.map((envelope) => (
              <EventCard
                key={envelope.seq}
                envelope={envelope}
                isStreamingRow={status === "streaming" && envelope.seq === lastSeq}
              />
            ))}
          </ol>
        </div>
      </details>
    </section>
  );
}
