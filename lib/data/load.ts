import venueJson from "./venue.json";
import transitJson from "./transit-snapshot.json";
import gameA from "./showcase-game-a.json";
import gameB from "./showcase-game-b.json";
import { ShowcaseGame, ShowcaseGameSchema, TransitOption, TransitOptionSchema, Venue, VenueSchema } from "../planning/schemas";

export function loadVenue(): Venue { return VenueSchema.parse(venueJson); }
export function loadTransit(): TransitOption[] {
  return (transitJson as { options: unknown[] }).options.map((o) => TransitOptionSchema.parse(o));
}
export function loadShowcaseGame(gameId: string): ShowcaseGame {
  if (gameId === "2025030413") return ShowcaseGameSchema.parse(gameA);
  if (gameId === "2025030313") return ShowcaseGameSchema.parse(gameB);
  throw new Error(`unknown showcase game: ${gameId}`);
}
export function listShowcaseGames() {
  return [
    { gameId: "2025030413", label: "Stanley Cup Final Game 3 (2OT thriller)" },
    { gameId: "2025030313", label: "Eastern Conference Final Game 3 (OT winner)" },
  ];
}
