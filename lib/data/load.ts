import venueJson from "./venue.json";
import transitJson from "./transit-snapshot.json";
// TASK6: import gameA from "./showcase-game-a.json";
// TASK6: import gameB from "./showcase-game-b.json";
import { ShowcaseGame, ShowcaseGameSchema, TransitOption, TransitOptionSchema, Venue, VenueSchema } from "../planning/schemas";

export function loadVenue(): Venue { return VenueSchema.parse(venueJson); }
export function loadTransit(): TransitOption[] {
  return (transitJson as { options: unknown[] }).options.map((o) => TransitOptionSchema.parse(o));
}
export function loadShowcaseGame(gameId: string): ShowcaseGame {
  // TASK6: uncomment once lib/data/showcase-game-a.json and showcase-game-b.json land, then delete the throw below.
  // if (gameId === "2025030413") return ShowcaseGameSchema.parse(gameA);
  // if (gameId === "2025030313") return ShowcaseGameSchema.parse(gameB);
  throw new Error(`showcase games not available yet (TASK6 pending): ${gameId}`);
}
export function listShowcaseGames() {
  return [
    { gameId: "2025030413", label: "Stanley Cup Final Game 3 (2OT thriller)" },
    { gameId: "2025030313", label: "Eastern Conference Final Game 3 (OT winner)" },
  ];
}

// keep referenced for future TASK6 uncomment (avoids unused-import lint failure until wired)
void ShowcaseGameSchema;
