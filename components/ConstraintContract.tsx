import { Constraint, PriorityTier } from "@/lib/planning/schemas";

const PRIORITY_LABEL: Record<PriorityTier, string> = {
  hard: "HARD",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};
const PRIORITY_MARK: Record<PriorityTier, string> = {
  hard: "!!!",
  high: "!!",
  medium: "!",
  low: "-",
};
const PRIORITY_STYLE: Record<PriorityTier, string> = {
  hard: "border-red-lamp/40 bg-red-lamp/10 text-red-lamp",
  high: "border-sodium/40 bg-sodium/10 text-sodium",
  medium: "border-steel-bright bg-glass text-ice/90",
  low: "border-steel bg-glass/60 text-frost",
};

function PriorityChip({ priority }: { priority: PriorityTier }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${PRIORITY_STYLE[priority]}`}
    >
      <span aria-hidden="true">{PRIORITY_MARK[priority]}</span>
      {PRIORITY_LABEL[priority]}
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

export function ConstraintContract({
  constraints,
  clarificationsNeeded = [],
}: {
  constraints: Constraint[];
  clarificationsNeeded?: { field: string; question: string }[];
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
              <span>
                <strong>Needs more info ({q.field}):</strong> {q.question}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
