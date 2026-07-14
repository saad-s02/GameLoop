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

function EventBody({ event }: { event: TraceEvent }) {
  switch (event.type) {
    case "request_parsed":
      return (
        <p className="text-sm">
          Parsed {event.constraints.length} constraint{event.constraints.length === 1 ? "" : "s"}
          {event.clarificationsNeeded.length > 0 ? `, ${event.clarificationsNeeded.length} clarification(s) needed.` : "."}
        </p>
      );
    case "constraint_adjusted":
      return (
        <p className="text-sm">
          You said {event.requested}; {event.reason} Resolved to {event.resolved}.
        </p>
      );
    case "data_requested":
      return <p className="text-sm">Called <span className="font-mono">{event.tool}</span>.</p>;
    case "data_received":
      return (
        <p className="flex items-center gap-2 text-sm">
          <span className="font-mono">{event.tool}</span> returned in {event.latencyMs.toFixed(0)} ms
          <SourceBadge source={event.source} />
        </p>
      );
    case "candidates_summary":
      return (
        <p className="text-sm">
          Evaluated {event.evaluated} candidate{event.evaluated === 1 ? "" : "s"}, {event.feasible} feasible.
        </p>
      );
    case "candidate_evaluated":
      return (
        <p className="text-sm">
          <span className="font-mono">{event.planId}</span> scored {event.score.toFixed(1)}
          {event.violations.length > 0 ? ` (${event.violations.join("; ")})` : ""}
        </p>
      );
    case "decision":
      return <p className="text-sm">{event.summary}</p>;
    case "plan_result":
      return (
        <p className="text-sm">
          {event.result.feasible ? "A feasible plan was selected." : "No feasible plan was found."}
        </p>
      );
    case "response_chunk":
      return <p className="text-sm text-black/60">Narrative text streaming…</p>;
    case "moment_package":
      return <p className="text-sm">{event.pkg.moments.length} moment(s) packaged: {event.pkg.scoreLine}</p>;
    case "recap_result":
      return <p className="text-sm">Personal Game Memory generated.</p>;
    case "fallback_used":
      return <p className="text-sm">Fell back to a deterministic summary: {event.reason}</p>;
    case "error":
      return <p className="text-sm text-rose-700">{event.message}</p>;
    case "done":
      return <p className="text-sm text-black/60">Stream complete.</p>;
  }
}

function EventCard({ envelope }: { envelope: TraceEnvelope }) {
  return (
    <li className="rounded-lg border border-black/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{EVENT_TITLE[envelope.event.type]}</span>
        <span className="text-xs text-black/40">#{envelope.seq}</span>
      </div>
      <EventBody event={envelope.event} />
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-black/50">Raw event</summary>
        <p className="mt-1 text-xs text-black/50">{COPY.fiction}</p>
        <pre className="mt-1 overflow-x-auto rounded bg-black/5 p-2 text-xs">
          {JSON.stringify(envelope, null, 2)}
        </pre>
      </details>
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
  const cardEvents = events.filter((e) => e.event.type !== "response_chunk");

  return (
    <section aria-label="Decision log" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">Decision log</h2>
        <p aria-live="polite" className="text-sm">
          {STATUS_MESSAGE[status]}
          {status === "stalled" && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-2 rounded border border-black/20 px-2 py-0.5 text-xs font-semibold"
            >
              Retry
            </button>
          )}
        </p>
      </div>
      {streamText && (
        <p className="rounded-lg border border-black/10 bg-black/[0.02] p-3 text-sm">{streamText}</p>
      )}
      <ol className="flex flex-col gap-2 text-sm">
        {cardEvents.map((envelope) => (
          <EventCard key={envelope.seq} envelope={envelope} />
        ))}
      </ol>
    </section>
  );
}
