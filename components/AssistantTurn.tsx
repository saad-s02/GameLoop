"use client";

import { ChatTurn, composeAssistantTurn } from "@/lib/chat/turns";
import { Constraint } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";
import { ReasoningDisclosure } from "./ReasoningDisclosure";
import { PartyAnswerForm } from "./PartyAnswerForm";

/**
 * One assistant turn composed from its stream envelopes. Order inside the
 * turn mirrors the stream's own narrative arc: the honest redirect first,
 * then the reasoning disclosure (open while streaming, folded after), the
 * adjustment and assumption lines with their provenance, the narrative body,
 * the clarification question, and the closing confirmation.
 */
export function AssistantTurn({
  turn,
  isLive,
  onAnswer,
  onRetry,
}: {
  turn: ChatTurn;
  isLive: boolean;
  onAnswer?: (a: { constraints: Constraint[]; historyText: string }) => void;
  onRetry?: () => void;
}) {
  const seg = composeAssistantTurn(turn.envelopes);
  const heroLine =
    seg.planResult?.feasible === true
      ? COPY.turnPlanReady(COPY.heroSentence(seg.planResult.plan))
      : undefined;

  return (
    <div data-role="assistant-turn" className="turn-arrive flex flex-col gap-3">
      {seg.redirect && (
        <p className="border-l-2 border-sodium py-0.5 pl-2.5 text-sm italic leading-6 text-frost">{seg.redirect}</p>
      )}
      {turn.envelopes.length > 0 && (
        <ReasoningDisclosure envelopes={turn.envelopes} status={turn.status} onRetry={isLive ? onRetry : undefined} />
      )}
      {seg.adjustments.map((a, i) => (
        <p key={`adj-${i}`} className="text-sm leading-6 text-ice/90">
          {a.requested === "not set" ? "Not set before; " : `You said ${a.requested}; `}
          {a.reason} Resolved to {a.resolved}.
        </p>
      ))}
      {seg.assumptions.map((a, i) => (
        <p key={`${a.field}-${i}`} className="flex items-start gap-2 rounded-card border border-sodium/40 bg-sodium/10 p-3 text-sm leading-6 text-ice">
          <span aria-hidden="true" className="font-mono text-sodium">~</span>
          <span>
            <span className="mr-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-sodium">
              assumed
            </span>
            {a.assumed}. <span className="text-frost">{a.reason}</span>
          </span>
        </p>
      ))}
      {/* An infeasible result suppresses the narrative fallback: its text
          repeats the turnInfeasible line below and points at a "below the
          Decision Log" region that does not exist in the chat workspace. */}
      {turn.streamText && seg.planResult?.feasible !== false && (
        <p className="text-[15px] leading-7 text-ice/90">{turn.streamText}</p>
      )}
      {!turn.streamText && seg.body && <p className="text-[15px] leading-7 text-ice/90">{seg.body}</p>}
      {seg.clarification && (
        <div className="rounded-card border border-sodium/40 bg-sodium/10 p-3.5 text-sm text-sodium">
          <span aria-hidden="true">? </span>
          {seg.clarification.question}
          {isLive && onAnswer && seg.clarification.field === "party" && <PartyAnswerForm onAnswer={onAnswer} />}
        </div>
      )}
      {seg.errorMessage && <p className="text-sm leading-6 text-red-lamp">{seg.errorMessage}</p>}
      {heroLine && <p className="text-sm font-medium leading-6 text-ice-green">{heroLine}</p>}
      {seg.planResult && !seg.planResult.feasible && (
        <p className="text-sm leading-6 text-red-lamp">{COPY.turnInfeasible}</p>
      )}
      {turn.status === "streaming" && (
        <p className="flex items-center gap-2 text-sm text-frost">
          <span aria-hidden="true" className="streaming-dot h-2 w-2 rounded-full bg-sodium" />
          Planning&hellip;
        </p>
      )}
    </div>
  );
}
