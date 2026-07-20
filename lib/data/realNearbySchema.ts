import { z } from "zod";
import { DietaryNeed, DietaryNeedSchema } from "../planning/schemas";

/**
 * Reduced research fixture schema for the real-places card. Authored from
 * research/2026-07-25-real-data/candidates.json; UI-only data, never fed to
 * the planner or the model. The three evidence tiers follow the research
 * ground rules: "certified" only when a named, checkable certifier is on
 * record for the exact outlet; "self-described" for a restaurant's own
 * claim; "friendly" for partial-menu or good-practice claims.
 */
export const EvidenceTierSchema = z.enum(["certified", "self-described", "friendly"]);
export type EvidenceTier = z.infer<typeof EvidenceTierSchema>;

export const RealNearbyEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Absent when the research pass did not capture a star value. */
  rating: z
    .object({
      value: z.number().min(0).max(5),
      source: z.string().min(1),
      reviewNote: z.string().min(1),
    })
    .optional(),
  /** Estimated from the published address, not a mapping API. */
  walkMinutes: z.number().int().positive(),
  priceLevel: z.enum(["$", "$$", "$$$"]),
  /** Confirmed open through a Saturday/Sunday pre-game evening window. */
  openWeekendEvenings: z.boolean(),
  /** Well-known quick pre-game anchor; used when no dietary need filters. */
  iconic: z.boolean(),
  evidence: z.array(
    z.object({ need: DietaryNeedSchema, tier: EvidenceTierSchema, line: z.string().min(1) }),
  ),
  sourceUrl: z.string().url(),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.literal("research-notes"),
});
export type RealNearbyEntry = z.infer<typeof RealNearbyEntrySchema>;

export const RealNearbyFileSchema = z.object({
  generatedFrom: z.string().min(1),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(RealNearbyEntrySchema).min(1),
});

/**
 * Needs the research pass found no verifiable evidence for at any candidate
 * restaurant. The card must render an honest absence statement for these,
 * never a list of options.
 */
export const UNVERIFIABLE_NEEDS: DietaryNeed[] = ["nut-free", "dairy-free"];

export type RealNearbySelection =
  | { kind: "options"; picks: RealNearbyEntry[] }
  | { kind: "absence"; need: DietaryNeed };

/**
 * Deterministic pick of two or three entries for the card. Weekend-closed
 * entries never surface. Any unverifiable need forces the absence statement.
 * With needs: entries covering more of the needs win, then shorter walk,
 * then name. Without needs: the iconic picks, nearest first.
 */
export function filterRealNearby(entries: RealNearbyEntry[], needs: DietaryNeed[]): RealNearbySelection {
  const open = entries.filter((e) => e.openWeekendEvenings);
  const absent = needs.find((n) => UNVERIFIABLE_NEEDS.includes(n));
  if (absent) return { kind: "absence", need: absent };

  if (needs.length === 0) {
    const picks = open
      .filter((e) => e.iconic)
      .sort((a, b) => a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name))
      .slice(0, 3);
    if (picks.length === 0 && open.length > 0) {
      return { kind: "options", picks: open.slice(0, 3) };
    }
    return { kind: "options", picks };
  }

  const coverage = (e: RealNearbyEntry) => needs.filter((n) => e.evidence.some((ev) => ev.need === n)).length;
  const picks = open
    .filter((e) => coverage(e) > 0)
    .sort(
      (a, b) =>
        coverage(b) - coverage(a) || a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name),
    )
    .slice(0, 3);
  if (picks.length === 0) return { kind: "absence", need: needs[0]! };
  return { kind: "options", picks };
}
