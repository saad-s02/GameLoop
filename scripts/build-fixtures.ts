import { readFileSync, writeFileSync } from "node:fs";
import { buildShowcaseGame, RawBoxscore, RawPlayByPlay } from "../lib/games/normalize";

function build(pbpPath: string, boxPath: string, outPath: string, endpointId: string) {
  const rawPbp = JSON.parse(readFileSync(pbpPath, "utf8")) as RawPlayByPlay;
  const rawBox = JSON.parse(readFileSync(boxPath, "utf8")) as RawBoxscore;
  const game = buildShowcaseGame(rawPbp, rawBox, {
    endpoint: `https://api-web.nhle.com/v1/gamecenter/${endpointId}/play-by-play`,
    fetchedAt: "2026-07-13",
    rawBytes: { playByPlay: readFileSync(pbpPath).byteLength, boxscore: readFileSync(boxPath).byteLength },
  });
  writeFileSync(outPath, JSON.stringify(game, null, 1) + "\n");
  console.log(outPath, "plays:", game.plays.length, "goals:", game.plays.filter((p) => p.type === "goal").length);
}

build("research/raw/fixture-a-pbp.json", "research/raw/fixture-a-boxscore.json", "lib/data/showcase-game-a.json", "2025030413");
build("research/raw/pbp-2025030313.json", "research/raw/fixture-b-boxscore.json", "lib/data/showcase-game-b.json", "2025030313");
