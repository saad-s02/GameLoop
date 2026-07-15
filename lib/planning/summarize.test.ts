import { describe, expect, it } from "vitest";
import { loadShowcaseGame } from "../data/load";
import { redirectSummary } from "./summarize";

describe("redirectSummary", () => {
  it("names the requested event and what Harbourview actually hosts tonight", () => {
    const s = redirectSummary("a basketball game", loadShowcaseGame("2025030413"));
    expect(s).toBe(
      "You asked about a basketball game. Tonight Harbourview Arena hosts hockey: Vegas Golden Knights versus Carolina Hurricanes, puck drop 19:30. Planning your night around it.",
    );
  });
});
