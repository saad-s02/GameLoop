import venueJson from "./venue.json";
import transitJson from "./transit-snapshot.json";
import { TransitOption, TransitOptionSchema, Venue, VenueSchema } from "../planning/schemas";

export function loadVenue(): Venue { return VenueSchema.parse(venueJson); }
export function loadTransit(): TransitOption[] {
  return (transitJson as { options: unknown[] }).options.map((o) => TransitOptionSchema.parse(o));
}
// loadShowcaseGame moved to ./showcaseGame.ts (belt-and-suspenders for Wave 2 review
// I-1): keeping it here would pull the showcase-game-a/b.json fixtures into any
// bundle that reaches loadVenue, including client bundles that only need the venue.
export function listShowcaseGames() {
  return [
    { gameId: "2025030413", label: "Stanley Cup Final Game 3 (2OT thriller)" },
    { gameId: "2025030313", label: "Eastern Conference Final Game 3 (OT winner)" },
  ];
}
