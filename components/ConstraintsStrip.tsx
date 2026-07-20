import { Constraint, ConstraintOutcome } from "@/lib/planning/schemas";

const STATUS_STYLE: Record<ConstraintOutcome["status"], string> = {
  satisfied: "border-ice-green/40 bg-ice-green/10 text-ice-green",
  traded: "border-sodium/40 bg-sodium/10 text-sodium",
  violated: "border-red-lamp/40 bg-red-lamp/10 text-red-lamp",
};
const STATUS_ICON: Record<ConstraintOutcome["status"], string> = {
  satisfied: "✓", // check mark
  traded: "⇄", // left-right arrows
  violated: "✗", // x mark
};
const STATUS_LABEL: Record<ConstraintOutcome["status"], string> = {
  satisfied: "satisfied",
  traded: "traded",
  violated: "violated",
};

const TYPE_LABEL: Record<Constraint["type"], string> = {
  arrival: "Arrival",
  seated_by: "Seated by",
  dietary: "Dietary",
  budget: "Budget",
  accessibility: "Accessibility",
  party: "Party",
  noise: "Noise",
  food_preference: "Food",
};

/** A word-or-two value summary per constraint type, deliberately terser than a full sentence. */
function summarizeValue(c: Constraint): string {
  switch (c.type) {
    case "arrival":
      return c.value.normalizedClock;
    case "seated_by":
      return c.value.milestone.replace("_", " ");
    case "dietary":
      return c.value.need;
    case "budget":
      return `$${c.value.maxTotalCad} max`;
    case "accessibility":
      return c.value.need.replace("-", " ");
    case "party":
      return `${c.value.adults} adult${c.value.adults === 1 ? "" : "s"}, ${c.value.children} child${c.value.children === 1 ? "" : "ren"}`;
    case "noise":
      return c.value.preference === "quieter-preferred" ? "quieter" : "no preference";
    case "food_preference":
      return c.value.preference.replace("-", " ");
  }
}

/**
 * Horizontal strip of one chip per constraint outcome: type, a word-or-two value
 * summary, and the satisfied/traded/violated status as an icon plus a plain-text
 * label (never color alone). Mirrors the chip styling conventions used by
 * ItineraryTimeline's DiffBadge and NearbyRealOptions' evidence tier chips.
 */
export function ConstraintsStrip({ outcomes }: { outcomes: ConstraintOutcome[] }) {
  if (outcomes.length === 0) return null;

  return (
    <section aria-label="Constraints strip" className="mb-3">
      <ul className="flex flex-wrap gap-2">
        {outcomes.map((o, i) => (
          <li
            key={`${o.constraint.type}-${i}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[o.status]}`}
          >
            <span aria-hidden="true">{STATUS_ICON[o.status]}</span>
            <span className="font-semibold">{TYPE_LABEL[o.constraint.type]}:</span>
            <span className={o.status === "violated" ? "line-through" : undefined}>{summarizeValue(o.constraint)}</span>
            <span>{STATUS_LABEL[o.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
