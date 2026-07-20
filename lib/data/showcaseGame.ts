import gameA from "./showcase-game-a.json";
import gameB from "./showcase-game-b.json";
import { ShowcaseGame, ShowcaseGameSchema } from "../planning/schemas";

// Split out of lib/data/load.ts (belt-and-suspenders for Wave 2 review I-1):
// loadVenue lives in load.ts alongside only venue.json and transit-snapshot.json,
// so client code reaching loadVenue never transitively imports these showcase-game
// fixtures. Server-only callers (app/api routes, lib/planning/adapters.ts,
// lib/server/recap.ts, evals, scripts) import loadShowcaseGame from here instead.
export function loadShowcaseGame(gameId: string): ShowcaseGame {
  if (gameId === "2025030413") return ShowcaseGameSchema.parse(gameA);
  if (gameId === "2025030313") return ShowcaseGameSchema.parse(gameB);
  throw new Error(`unknown showcase game: ${gameId}`);
}
