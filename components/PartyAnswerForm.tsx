"use client";

import { useState } from "react";
import { Constraint } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";

export function PartyAnswerForm({ onAnswer }: { onAnswer: (a: { constraints: Constraint[]; historyText: string }) => void }) {
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
