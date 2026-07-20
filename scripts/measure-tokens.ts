// scripts/measure-tokens.ts
//
// Deviation from the Task 14 brief: the brief names this file scripts/measure-tokens.mjs, but a
// plain .mjs file cannot resolve the project's relative TS imports (lib/data/showcaseGame,
// lib/games/moments) without a build step, and shelling out defeats the point of a calibration
// script. This is written as scripts/measure-tokens.ts instead and run the same way as
// evals/run-plan-evals.ts, under tsx:
//   node --env-file=.env.local --import tsx scripts/measure-tokens.ts
//
// Reads lib/data/showcase-game-a.json (via lib/data/showcaseGame's loadShowcaseGame), builds the
// Fixture A moment package via lib/games/moments, and sends that package as a single user
// message to the Anthropic count_tokens endpoint. Prints input_tokens and exits non-zero when
// the count is at or above the 4000-token budget.

import { loadShowcaseGame } from "../lib/data/showcaseGame";
import { buildMomentPackage } from "../lib/games/moments";

const TOKEN_BUDGET = 4000;
const SHOWCASE_GAME_ID = "2025030413"; // Fixture A, lib/data/showcase-game-a.json
const COUNT_TOKENS_URL = "https://api.anthropic.com/v1/messages/count_tokens";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-5";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. Run with node --env-file=.env.local --import tsx scripts/measure-tokens.ts");
    process.exitCode = 1;
    return;
  }

  const game = loadShowcaseGame(SHOWCASE_GAME_ID);
  const pkg = buildMomentPackage(game);

  const res = await fetch(COUNT_TOKENS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: JSON.stringify(pkg) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`count_tokens request failed: HTTP ${res.status} ${text}`.replace(/\s+/g, " ").trim());
    process.exitCode = 1;
    return;
  }

  const body = (await res.json()) as { input_tokens: number };
  console.log(`input_tokens: ${body.input_tokens}`);

  if (body.input_tokens >= TOKEN_BUDGET) {
    console.error(`Token count ${body.input_tokens} is at or above the ${TOKEN_BUDGET} token budget.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Fixture A moment package fits the ${TOKEN_BUDGET} token budget.`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`measure-tokens failed: ${msg.replace(/\s+/g, " ").trim()}`);
  process.exitCode = 1;
});
