import realNearbyJson from "./real-nearby.json";
import { RealNearbyEntry, RealNearbyFileSchema } from "./realNearbySchema";

/**
 * Server-side loader for the real-places research fixture, validated at the
 * boundary like every other fixture. Lives in its own module (the
 * showcaseGame.ts precedent) so the JSON never reaches a client bundle
 * through an unrelated lib/data import; the /plan page passes the parsed
 * entries down as props.
 */
export function loadRealNearby(): RealNearbyEntry[] {
  return RealNearbyFileSchema.parse(realNearbyJson).entries;
}
