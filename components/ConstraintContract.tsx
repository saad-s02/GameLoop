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
  hard: "bg-rose-100 text-rose-900 border-rose-300",
  high: "bg-orange-100 text-orange-900 border-orange-300",
  medium: "bg-slate-100 text-slate-900 border-slate-300",
  low: "bg-slate-50 text-slate-700 border-slate-200",
};

function PriorityChip({ priority }: { priority: PriorityTier }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${PRIORITY_STYLE[priority]}`}
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">What we heard</h2>
      <ul className="flex flex-col gap-2">
        {constraints.map((c, i) => (
          <li key={`${c.type}-${i}`} className="rounded-lg border border-black/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{summarizeConstraint(c)}</span>
              <PriorityChip priority={c.priority} />
            </div>
            <p className="mt-1 text-sm italic text-black/60">&ldquo;{c.sourceText}&rdquo;</p>
          </li>
        ))}
      </ul>
      {clarificationsNeeded.length > 0 && (
        <ul className="flex flex-col gap-2">
          {clarificationsNeeded.map((q, i) => (
            <li
              key={`${q.field}-${i}`}
              className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
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
