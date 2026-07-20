import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { ReliveApiInputSchema } from "@/lib/planning/schemas";
import { createTraceStream, SSE_HEADERS } from "@/lib/trace/sse";
import { verifyAccess } from "@/lib/server/access";
import { loadShowcaseGame } from "@/lib/data/showcaseGame";
import { buildMomentPackage } from "@/lib/games/moments";
import { fetchLiveShowcaseGame } from "@/lib/games/client";
import { generateRecap } from "@/lib/ai/outputs";
import { buildDeterministicRecap, resolveSessionContext } from "@/lib/server/recap";

const BODY_CHAR_CAP = 10_000;
const REQUEST_BUDGET_MS = 30_000;

export async function POST(req: NextRequest) {
  if (!verifyAccess(req.cookies.get("gl_access")?.value, process.env.ACCESS_COOKIE_SECRET!)) {
    return Response.json({ error: "access code required" }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > BODY_CHAR_CAP) return Response.json({ error: "body too large" }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const parsed = ReliveApiInputSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const input = parsed.data;

  const requestId = randomUUID();
  const { stream, emit, close } = createTraceStream(requestId);
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(REQUEST_BUDGET_MS)]);

  (async () => {
    try {
      // 1. load the game: snapshot fixture, or live (only when both requested and env-gated),
      // falling back to the snapshot on any live failure.
      let game;
      if (input.live && process.env.LIVE_GAMES === "1") {
        try {
          game = await fetchLiveShowcaseGame(input.gameId);
        } catch {
          emit({ type: "fallback_used", reason: "live fetch timed out; snapshot shown" });
          game = loadShowcaseGame(input.gameId);
        }
      } else {
        game = loadShowcaseGame(input.gameId);
      }

      // 2. re-validate session memory: invalid or stale memory is dropped, never fatal.
      const { session, dropped } = resolveSessionContext(input.sessionContext, input.gameId);
      if (dropped) {
        emit({ type: "fallback_used", reason: "saved plan memory was invalid or expired; showing a general recap" });
      }

      // 3. moment package.
      const pkg = buildMomentPackage(game);
      emit({ type: "moment_package", pkg });

      // 4. recap (skipped in demo mode: deterministic recap built from the package headlines).
      emit({ type: "decision", summary: "Generating recap" });

      let memory;
      if (input.demo) {
        memory = buildDeterministicRecap(pkg, session);
      } else {
        try {
          memory = await generateRecap(pkg, session, { signal });
        } catch {
          emit({ type: "fallback_used", reason: "recap failed; deterministic summary shown" });
          memory = buildDeterministicRecap(pkg, session);
        }
      }

      emit({ type: "recap_result", memory });
      emit({ type: "done" });
    } catch (err) {
      emit({
        type: "error",
        message: err instanceof Error && err.name === "TimeoutError" ? "Request timed out." : "Something went wrong.",
      });
    } finally {
      close();
    }
  })();

  return new Response(stream, { headers: SSE_HEADERS });
}
