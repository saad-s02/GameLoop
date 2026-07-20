import { DietaryNeed } from "@/lib/planning/schemas";
import { EvidenceTier, RealNearbyEntry, filterRealNearby } from "@/lib/data/realNearbySchema";
import { COPY } from "@/lib/copy";
import { SourceBadge } from "./SourceBadge";

// Tier chips pair the visible tier word with a tone; the word carries the
// meaning, color is reinforcement only. All solid borders: dashed stays
// exclusive to SIMULATED, and this card is research SNAPSHOT data.
const TIER_STYLE: Record<EvidenceTier, string> = {
  certified: "border-ice-green/40 bg-ice-green/10 text-ice-green",
  "self-described": "border-sodium/40 bg-sodium/10 text-sodium",
  friendly: "border-steel-bright bg-glass text-frost",
};

/**
 * The real-places footer card: research data presented by the UI, labeled as
 * such, never model output. Renders only after a feasible plan lands (the
 * panel gates it); receives already-validated entries from the server page
 * and filters them by the plan's dietary needs.
 */
export function NearbyRealOptions({ entries, needs }: { entries: RealNearbyEntry[]; needs: DietaryNeed[] }) {
  const selection = filterRealNearby(entries, needs);
  return (
    <section aria-label="Real places near the arena" className="flex flex-col gap-3 rounded-card border border-steel bg-boards p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">
          {COPY.realNearbyHeading}
        </h2>
        <SourceBadge source="snapshot" title="Research notes, accessed 2026-07-20" />
      </div>
      <p className="text-[13px] leading-5 text-frost">{COPY.realNearbyLead}</p>
      {selection.kind === "absence" ? (
        <p className="rounded-card border border-sodium/40 bg-sodium/10 p-3 text-sm leading-6 text-ice">
          {COPY.realNearbyAbsence(selection.need)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {selection.picks.map((e) => (
            <li key={e.id} className="rounded-card border border-steel bg-well/60 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-ice">{e.name}</span>
                <span className="font-mono text-xs tabular-nums text-frost">
                  {e.walkMinutes} min walk &middot; {e.priceLevel}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] leading-5 text-frost">
                {e.rating
                  ? `${e.rating.value.toFixed(1)} / 5 (${e.rating.source}). ${e.rating.reviewNote}.`
                  : "Rating not captured in this research pass."}
              </p>
              {e.evidence
                .filter((ev) => needs.length === 0 || needs.includes(ev.need))
                .map((ev) => (
                  <p key={`${e.id}-${ev.need}`} className="mt-1.5 flex flex-wrap items-start gap-1.5 text-[13px] leading-5 text-ice/90">
                    <span
                      className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${TIER_STYLE[ev.tier]}`}
                    >
                      {ev.need} &middot; {COPY.evidenceTierLabel(ev.tier)}
                    </span>
                    <span className="min-w-0 flex-1">{ev.line}</span>
                  </p>
                ))}
              <p className="mt-1.5 font-mono text-[11px] text-frost">
                Accessed {e.accessedAt} &middot;{" "}
                <a className="underline hover:text-ice" href={e.sourceUrl} target="_blank" rel="noreferrer">
                  source
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-4 text-frost">{COPY.realNearbyWalkNote}</p>
    </section>
  );
}
