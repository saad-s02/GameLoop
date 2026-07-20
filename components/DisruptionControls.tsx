"use client";

import { DisruptionId } from "@/lib/planning/schemas";

// Exported: PlanWorkspace labels disruption user turns from this list.
export const DISRUPTIONS: { id: DisruptionId; label: string; title?: string }[] = [
  { id: "train-plus-18", label: "Train delayed +18 min" },
  { id: "gate1-wait-22", label: "Gate 1 wait rises to 22 min" },
  { id: "gf-stand-closed", label: "Gluten-free stand unavailable" },
  { id: "milestone-puck-drop", label: "Warmups -> puck drop" },
  { id: "add-accessibility", label: "Add accessibility need" },
  {
    id: "july25-weekend-service",
    label: "July 25 weekend service",
    title:
      "Sat Jul 25, 2026: Lakeshore West reduced for Exhibition Station construction; UP Express replaced by GO buses. Verified 2026-07-20, simulated against the weekday snapshot.",
  },
];

export function DisruptionControls({
  onTrigger,
  disabled = false,
}: {
  onTrigger: (id: DisruptionId) => void;
  disabled?: boolean;
}) {
  return (
    <section aria-label="Disruptions" className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">
        Try a disruption
      </h2>
      <div className="flex flex-wrap gap-2">
        {DISRUPTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            title={d.title}
            onClick={() => onTrigger(d.id)}
            className="inline-flex min-h-11 items-center justify-center rounded-well border border-steel-bright px-3 py-1.5 text-sm font-medium text-ice motion-safe:transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
          >
            {d.label}
          </button>
        ))}
      </div>
    </section>
  );
}
