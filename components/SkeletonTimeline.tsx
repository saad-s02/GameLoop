import { COPY } from "@/lib/copy";

const SKELETON_ROW_COUNT = 3;

/**
 * Fills the hero slot where Tonight's Plan will land while a plan streams in
 * and no plan is on screen yet (see app/plan/page.tsx: this only renders
 * when there's no prior feasible plan already on screen to dim via
 * .replan-dim -- a replan over an existing plan keeps that plan visible
 * instead of stacking this underneath it).
 *
 * Same .ice-sheet-surfaced geometry as the real hero (see globals.css) so
 * the swap to the finished plan doesn't jump more than necessary. Every
 * placeholder bar below is decorative scaffolding, not information, so the
 * whole row list is aria-hidden; the one real content here is the heading
 * text, read once like any other heading -- no extra live region, since
 * ActivityPanel's own aria-live status already announces stream progress.
 */
export function SkeletonTimeline() {
  return (
    <div className="ice-sheet-surfaced p-6">
      <h2 className="mb-4 font-display text-2xl font-bold tracking-wide text-ice md:text-3xl">
        {COPY.planBuildingHeading}
      </h2>
      <ol aria-hidden="true" className="itinerary-list flex flex-col gap-2.5">
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
          <li key={i} className="grid grid-cols-[1.25rem_1fr] gap-x-3">
            <span className="relative z-10 flex items-start justify-center pt-4">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-steel-bright bg-boards" />
            </span>
            <div className="min-w-0 rounded-card border border-steel bg-boards p-3.5">
              <div className="flex items-center gap-2">
                <span className="skeleton-bar h-5 w-14" />
                <span className="skeleton-bar h-5 w-40 max-w-[55%]" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
