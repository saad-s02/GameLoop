"use client";

import { useState } from "react";
import { Constraint, PriorityTier } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";

const PRIORITY_STYLE: Record<PriorityTier, string> = {
  hard: "border-red-lamp/40 bg-red-lamp/10 text-red-lamp",
  high: "border-sodium/40 bg-sodium/10 text-sodium",
  medium: "border-steel-bright bg-glass text-ice/90",
  low: "border-steel bg-glass/60 text-frost",
};
// Dot color per tier, always paired with the mono-caps word from
// COPY.severityLabel below: color alone never carries the meaning.
const PRIORITY_DOT: Record<PriorityTier, string> = {
  hard: "bg-red-lamp",
  high: "bg-sodium",
  medium: "bg-frost",
  low: "bg-frost",
};

function PriorityChip({ priority }: { priority: PriorityTier }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${PRIORITY_STYLE[priority]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[priority]}`} />
      {COPY.severityLabel(priority)}
    </span>
  );
}

function summarizeConstraint(c: Constraint): string {
  switch (c.type) {
    case "arrival":
      return `Arriving by ${c.value.mode}, stated "${c.value.statedClock}" (${c.value.normalizedClock})`;
    case "seated_by":
      return `Seated by ${c.value.milestone.replace("_", " ")}`;
    case "dietary":
      return `Dietary: ${c.value.need} (${c.value.severity})`;
    case "budget":
      return `Budget: max $${c.value.maxTotalCad} CAD total`;
    case "accessibility":
      return `Accessibility: ${c.value.need.replace("-", " ")}`;
    case "party":
      return `Party: ${c.value.adults} adult${c.value.adults === 1 ? "" : "s"}, ${c.value.children} child${c.value.children === 1 ? "" : "ren"}`;
    case "noise":
      return `Noise: ${c.value.preference.replace("-", " ")}`;
    case "food_preference":
      return `Food preference: ${c.value.preference.replace("-", " ")}${c.value.detail ? ` (${c.value.detail})` : ""}`;
  }
}

function PartyAnswerForm({ onAnswer }: { onAnswer: (a: { constraints: Constraint[]; historyText: string }) => void }) {
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const summary = `${adults} adult${adults === 1 ? "" : "s"}, ${children} child${children === 1 ? "" : "ren"}`;
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onAnswer({
          constraints: [
            {
              type: "party",
              value: { adults, children },
              priority: "hard",
              sourceText: `Answered inline: ${summary}`,
            },
          ],
          historyText: summary,
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-ice">
        {COPY.answerAdultsLabel}
        <input
          type="number"
          min={0}
          max={20}
          value={adults}
          onChange={(e) => setAdults(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
          className="w-20 rounded-well border border-steel bg-well/70 px-2 py-1.5 font-mono text-sm tabular-nums text-ice focus:border-steel-bright"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ice">
        {COPY.answerChildrenLabel}
        <input
          type="number"
          min={0}
          max={20}
          value={children}
          onChange={(e) => setChildren(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
          className="w-20 rounded-well border border-steel bg-well/70 px-2 py-1.5 font-mono text-sm tabular-nums text-ice focus:border-steel-bright"
        />
      </label>
      <button
        type="submit"
        className="rounded-well bg-ice px-3 py-1.5 text-sm font-semibold text-bowl motion-safe:transition-colors hover:bg-ice/90"
      >
        {COPY.answerUseThis}
      </button>
    </form>
  );
}

export function ConstraintContract({
  constraints,
  clarificationsNeeded = [],
  onAnswer,
}: {
  constraints: Constraint[];
  clarificationsNeeded?: { field: string; question: string }[];
  onAnswer?: (answer: { constraints: Constraint[]; historyText: string }) => void;
}) {
  return (
    <section aria-label="Constraint contract" className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">
        What we heard
      </h2>
      <ul className="flex flex-col gap-2">
        {constraints.map((c, i) => (
          <li key={`${c.type}-${i}`} className="rounded-card border border-steel bg-boards p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ice">{summarizeConstraint(c)}</span>
              <PriorityChip priority={c.priority} />
            </div>
            <p className="mt-1 text-[13px] italic leading-5 text-frost">&ldquo;{c.sourceText}&rdquo;</p>
          </li>
        ))}
      </ul>
      {clarificationsNeeded.length > 0 && (
        <ul className="flex flex-col gap-2">
          {clarificationsNeeded.map((q, i) => (
            <li
              key={`${q.field}-${i}`}
              className="flex items-start gap-2 rounded-card border border-sodium/40 bg-sodium/10 p-3.5 text-sm text-sodium"
            >
              <span aria-hidden="true">?</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span>
                  <strong>Needs more info ({q.field}):</strong> {q.question}
                </span>
                {onAnswer && q.field === "party" && <PartyAnswerForm onAnswer={onAnswer} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
