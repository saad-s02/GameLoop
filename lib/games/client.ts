import { buildShowcaseGame, RawBoxscore, RawPlayByPlay } from "./normalize";
import { ShowcaseGame, ShowcaseGameSchema } from "../planning/schemas";

const DEFAULT_NHL_API_BASE = "https://api-web.nhle.com";
const FETCH_TIMEOUT_MS = 4000;

function apiBase(): string {
  return process.env.NHL_API_BASE ?? DEFAULT_NHL_API_BASE;
}

/**
 * Fetches play-by-play and boxscore for `gameId` from the live NHL API (concurrently, each
 * capped at 4s via AbortSignal.timeout), and normalizes them into a ShowcaseGame with
 * source "live". Any failure -- network error, non-2xx, timeout, or a schema mismatch on the
 * normalized result -- rejects; callers are responsible for catching and falling back to the
 * snapshot fixture plus a fallback_used trace event.
 */
export async function fetchLiveShowcaseGame(gameId: string): Promise<ShowcaseGame> {
  const base = apiBase();
  const pbpUrl = `${base}/v1/gamecenter/${gameId}/play-by-play`;
  const boxUrl = `${base}/v1/gamecenter/${gameId}/boxscore`;

  const [pbpRes, boxRes] = await Promise.all([
    fetch(pbpUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    fetch(boxUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
  ]);
  if (!pbpRes.ok) throw new Error(`live play-by-play fetch failed: HTTP ${pbpRes.status}`);
  if (!boxRes.ok) throw new Error(`live boxscore fetch failed: HTTP ${boxRes.status}`);

  const [pbpText, boxText] = await Promise.all([pbpRes.text(), boxRes.text()]);
  const rawPbp = JSON.parse(pbpText) as RawPlayByPlay;
  const rawBox = JSON.parse(boxText) as RawBoxscore;

  const game = buildShowcaseGame(rawPbp, rawBox, {
    endpoint: pbpUrl,
    fetchedAt: new Date().toISOString(),
    rawBytes: { playByPlay: pbpText.length, boxscore: boxText.length },
  });

  return ShowcaseGameSchema.parse({ ...game, source: "live" as const });
}
