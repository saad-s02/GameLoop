"use client";

import { FormEvent, useState } from "react";
import { Constraint, INPUT_CHAR_CAP } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";

export interface QuickChip {
  id: string;
  label: string;
  delta: Constraint;
}

/** Deterministic typed deltas: these work in demo mode and live mode with zero model calls. */
export const QUICK_CHIPS: QuickChip[] = [
  {
    id: "arrive-600",
    label: "Arriving at 6:00 instead",
    delta: {
      type: "arrival",
      value: { statedClock: "6:00", normalizedClock: "18:00", mode: "train" },
      priority: "hard",
      sourceText: "Arriving at 6:00 instead (quick answer)",
    },
  },
  {
    id: "wheelchair",
    label: "Add wheelchair access",
    delta: {
      type: "accessibility",
      value: { need: "step-free" },
      priority: "hard",
      sourceText: "Add wheelchair access (quick answer)",
    },
  },
  {
    id: "food-60",
    label: "Cap food spend at $60",
    delta: {
      type: "budget",
      value: { maxTotalCad: 60 },
      priority: "high",
      sourceText: "Cap food spend at $60 (quick answer)",
    },
  },
];

export function FollowUpComposer({
  demo,
  disabled,
  onQuickChip,
  onFollowUpText,
}: {
  demo: boolean;
  disabled: boolean;
  onQuickChip: (chip: QuickChip) => void;
  onFollowUpText: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (demo || !draft.trim()) return;
    onFollowUpText(draft.trim());
    setDraft("");
  };

  return (
    <section aria-label="Follow-up" className="flex flex-col gap-3 rounded-card border border-steel bg-boards p-4">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">
        {COPY.followUpHeading}
      </h2>
      <div className="flex flex-wrap gap-2">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => onQuickChip(chip)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-steel px-3 py-1.5 text-sm font-medium text-frost motion-safe:transition-colors hover:border-steel-bright hover:text-ice disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
          >
            {chip.label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ice">
          Your change
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={INPUT_CHAR_CAP}
            disabled={demo || disabled}
            placeholder={COPY.followUpPlaceholder}
            className="rounded-card border border-steel bg-well/70 px-3 py-2.5 text-[15px] leading-6 text-ice placeholder:text-frost motion-safe:transition-colors focus:border-steel-bright disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        {demo ? (
          <p className="text-[13px] leading-5 text-frost">{COPY.followUpDemoNote}</p>
        ) : (
          <button
            type="submit"
            disabled={disabled || !draft.trim()}
            className="inline-flex min-h-11 items-center justify-center self-start rounded-well bg-ice px-4 py-2 text-sm font-semibold text-bowl motion-safe:transition-colors hover:bg-ice/90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
          >
            {COPY.followUpSend}
          </button>
        )}
      </form>
    </section>
  );
}
