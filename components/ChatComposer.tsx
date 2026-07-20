"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { Constraint, INPUT_CHAR_CAP, PlanApiInput } from "@/lib/planning/schemas";
import { COPY } from "@/lib/copy";

export interface SuggestedPrompt {
  id: NonNullable<PlanApiInput["chipId"]>;
  label: string;
  text: string;
}

/** The former demo chips: full sentences that run the zero-LLM chip path. */
export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
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

export function ChatComposer({
  demo,
  disabled,
  hasPlanContext,
  onSuggestedPrompt,
  onQuickChip,
  onSubmitText,
}: {
  demo: boolean;
  disabled: boolean;
  hasPlanContext: boolean;
  onSuggestedPrompt: (prompt: SuggestedPrompt) => void;
  onQuickChip: (chip: QuickChip) => void;
  onSubmitText: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (demo || disabled || !draft.trim()) return;
    onSubmitText(draft.trim());
    setDraft("");
  };
  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section aria-label="Composer" className="flex flex-col gap-3 rounded-card border border-steel bg-boards p-4">
      {!hasPlanContext ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-frost">
            {COPY.suggestedPromptsLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                disabled={disabled}
                onClick={() => onSuggestedPrompt(prompt)}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-steel px-3 py-1.5 text-sm font-medium text-frost motion-safe:transition-colors hover:border-steel-bright hover:text-ice disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
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
      )}
      <form onSubmit={onFormSubmit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ice">
          {hasPlanContext ? "Your change" : "Your request"}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={INPUT_CHAR_CAP}
            rows={2}
            disabled={demo || disabled}
            placeholder={hasPlanContext ? COPY.followUpPlaceholder : COPY.composerFreshPlaceholder}
            className="rounded-card border border-steel bg-well/70 px-3 py-2.5 text-[15px] leading-6 text-ice placeholder:text-frost motion-safe:transition-colors focus:border-steel-bright disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        {demo ? (
          <p className="text-[13px] leading-5 text-frost">
            {hasPlanContext ? COPY.followUpDemoNote : COPY.composerFreshDemoNote}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              type="submit"
              disabled={disabled || !draft.trim()}
              className="inline-flex min-h-11 items-center justify-center self-start rounded-well bg-ice px-4 py-2 text-sm font-semibold text-bowl motion-safe:transition-colors hover:bg-ice/90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            >
              {hasPlanContext ? COPY.followUpSend : "Plan my night"}
            </button>
            <p className="font-mono text-xs tabular-nums text-frost">
              {draft.length} / {INPUT_CHAR_CAP}
            </p>
          </div>
        )}
      </form>
    </section>
  );
}
