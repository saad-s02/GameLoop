import { Venue, WaitBand } from "./schemas";
import { toNormalizedMinutes } from "./time";

export function walkMinutes(venue: Venue, from: string, to: string): number {
  const e = venue.walkingGraph.find(
    (x) => (x.from === from && x.to === to) || (x.from === to && x.to === from),
  );
  if (!e) throw new Error(`no walking edge ${from} <-> ${to}`);
  return e.minutes;
}

/** Band lookup by normalized minutes. Clamps to the first/last band outside the profile. */
export function waitAt(profile: WaitBand[], atMinutes: number): number {
  for (const b of profile) {
    if (atMinutes >= toNormalizedMinutes(b.fromClock) && atMinutes < toNormalizedMinutes(b.toClock)) return b.waitMinutes;
  }
  if (atMinutes < toNormalizedMinutes(profile[0]!.fromClock)) return profile[0]!.waitMinutes;
  return profile[profile.length - 1]!.waitMinutes;
}
