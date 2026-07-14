import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLiveShowcaseGame } from "./client";

function rawPbpFixture() {
  return {
    id: 2099999999,
    gameDate: "2026-01-01",
    regPeriods: 3,
    homeTeam: { id: 1, abbrev: "HOM", placeName: { default: "Home" }, commonName: { default: "Homers" } },
    awayTeam: { id: 2, abbrev: "AWY", placeName: { default: "Away" }, commonName: { default: "Awayers" } },
    rosterSpots: [],
    plays: [],
    gameOutcome: { lastPeriodType: "REG" },
  };
}

function rawBoxFixture() {
  return {
    awayTeam: { abbrev: "AWY" },
    homeTeam: { abbrev: "HOM" },
    playerByGameStats: {
      awayTeam: { goalies: [] },
      homeTeam: { goalies: [] },
    },
  };
}

describe("fetchLiveShowcaseGame", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NHL_API_BASE;
  });

  it("fetches pbp and boxscore concurrently and normalizes into a ShowcaseGame with source live", async () => {
    process.env.NHL_API_BASE = "https://mock.test";
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes("/play-by-play")) {
        return new Response(JSON.stringify(rawPbpFixture()), { status: 200 });
      }
      if (href.includes("/boxscore")) {
        return new Response(JSON.stringify(rawBoxFixture()), { status: 200 });
      }
      throw new Error(`unexpected url: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const game = await fetchLiveShowcaseGame("2099999999");
    expect(game.source).toBe("live");
    expect(game.gameId).toBe("2099999999");
    expect(game.homeTeam.abbrev).toBe("HOM");
    expect(game.awayTeam.abbrev).toBe("AWY");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calledUrls = fetchMock.mock.calls.map((c) => c[0]!.toString());
    expect(calledUrls).toContain("https://mock.test/v1/gamecenter/2099999999/play-by-play");
    expect(calledUrls).toContain("https://mock.test/v1/gamecenter/2099999999/boxscore");
  });

  it("rejects when the play-by-play fetch returns a non-2xx status", async () => {
    process.env.NHL_API_BASE = "https://mock.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (url.toString().includes("/play-by-play")) return new Response("not found", { status: 404 });
        return new Response(JSON.stringify(rawBoxFixture()), { status: 200 });
      }),
    );
    await expect(fetchLiveShowcaseGame("2099999999")).rejects.toThrow();
  });

  it("rejects when the network fetch itself fails", async () => {
    process.env.NHL_API_BASE = "https://mock.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(fetchLiveShowcaseGame("2099999999")).rejects.toThrow("network down");
  });
});
