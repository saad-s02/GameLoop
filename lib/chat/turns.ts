import { PlanResult, TraceEnvelope } from "../planning/schemas";

/** Mirrors components/useTraceStream's TraceStreamStatus without importing a client module into lib. */
export type TurnStatus = "idle" | "streaming" | "stalled" | "done" | "error";

/** One user request and the assistant activity it produced. Frozen for past turns; the live turn re-renders as frames land. */
export interface ChatTurn {
  id: number;
  userText: string;
  envelopes: TraceEnvelope[];
  streamText: string;
  status: TurnStatus;
}

export interface TurnAdjustment {
  field: string;
  requested: string;
  resolved: string;
  reason: string;
}
export interface TurnAssumption {
  field: string;
  assumed: string;
  reason: string;
}
export interface TurnClarification {
  field: string;
  question: string;
}

export interface AssistantSegments {
  /** The honest event-mismatch redirect line, rendered at the top of the turn. */
  redirect?: string;
  adjustments: TurnAdjustment[];
  assumptions: TurnAssumption[];
  /** Blocking question; renders as a question bubble with inline steppers. */
  clarification?: TurnClarification;
  /** Terminal decision text for streams that end without a plan, an error, or a question. */
  body?: string;
  planResult?: PlanResult;
  errorMessage?: string;
  /** Everything except response_chunk, for the reasoning disclosure. */
  logEnvelopes: TraceEnvelope[];
}

const REDIRECT_PREFIX = "You asked about ";

/**
 * Pure composition of one assistant turn from its stream envelopes. The rules
 * mirror app/api/plan/route.ts's emission order; the narrative streamText is
 * handled by the caller (it is separate accumulator state, not an envelope).
 */
export function composeAssistantTurn(envelopes: TraceEnvelope[]): AssistantSegments {
  const logEnvelopes = envelopes.filter((e) => e.event.type !== "response_chunk");
  const adjustments: TurnAdjustment[] = [];
  const assumptions: TurnAssumption[] = [];
  let redirect: string | undefined;
  let clarification: TurnClarification | undefined;
  let planResult: PlanResult | undefined;
  let errorMessage: string | undefined;
  let lastDecision: string | undefined;

  for (const { event } of envelopes) {
    switch (event.type) {
      case "request_parsed":
        clarification = event.clarificationsNeeded[0];
        break;
      case "constraint_adjusted":
        adjustments.push({
          field: event.field,
          requested: event.requested,
          resolved: event.resolved,
          reason: event.reason,
        });
        break;
      case "assumption_made":
        assumptions.push({ field: event.field, assumed: event.assumed, reason: event.reason });
        break;
      case "decision":
        if (redirect === undefined && event.summary.startsWith(REDIRECT_PREFIX)) {
          redirect = event.summary;
        } else {
          lastDecision = event.summary;
        }
        break;
      case "plan_result":
        planResult = event.result;
        break;
      case "error":
        errorMessage = event.message;
        break;
      default:
        break;
    }
  }

  const body =
    planResult === undefined && errorMessage === undefined && clarification === undefined
      ? lastDecision
      : undefined;

  return { redirect, adjustments, assumptions, clarification, body, planResult, errorMessage, logEnvelopes };
}
