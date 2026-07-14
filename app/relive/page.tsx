"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameMemory, GameMemorySchema, MomentPackage, ReliveApiInput } from "@/lib/planning/schemas";
import { listShowcaseGames } from "@/lib/data/load";
import { COPY } from "@/lib/copy";
import { useTraceStream } from "@/components/useTraceStream";
import { ActivityPanel } from "@/components/ActivityPanel";
import { GameMemoryCard } from "@/components/GameMemoryCard";
import { readStoredSession } from "@/components/MemoryPanel";

// Experimental: an arbitrary live gameId lookup, gated off by default. No task
// wires a real live source yet; this only unlocks the input, it still posts
// through the same /api/relive contract with live: true.
const ENABLE_LIVE_GAME = process.env.NEXT_PUBLIC_ENABLE_LIVE_RELIVE === "1";

export default function RelivePage() {
  const router = useRouter();
  const games = useMemo(() => listShowcaseGames(), []);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const [liveGameId, setLiveGameId] = useState("");
  const [submittedBody, setSubmittedBody] = useState<ReliveApiInput | null>(null);
  const [hadSessionAtSubmit, setHadSessionAtSubmit] = useState(false);

  const { events, status, retry, httpStatus } = useTraceStream(submittedBody ? "/api/relive" : null, submittedBody);

  useEffect(() => {
    if (httpStatus === 401) router.push("/enter");
  }, [httpStatus, router]);

  const pkgEnvelope = events.find((e) => e.event.type === "moment_package");
  const pkg: MomentPackage | undefined = pkgEnvelope?.event.type === "moment_package" ? pkgEnvelope.event.pkg : undefined;

  const recapEnvelope = events.find((e) => e.event.type === "recap_result");
  const memory: GameMemory | undefined =
    recapEnvelope?.event.type === "recap_result" ? GameMemorySchema.safeParse(recapEnvelope.event.memory).data : undefined;

  useEffect(() => {
    if (status === "done" && memory) resultsRef.current?.focus();
  }, [status, memory]);

  const submitGame = (gameId: string, live: boolean) => {
    setHadSessionAtSubmit(!!readStoredSession());
    setSubmittedBody({ mode: "relive", gameId, live, demo: false, sessionContext: readStoredSession() ?? undefined });
  };

  const onLiveSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!liveGameId.trim()) return;
    submitGame(liveGameId.trim(), true);
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Relive the Game</h1>
        <p className="text-sm opacity-70">Pick a showcase game and get a Personal Game Memory built from the real play-by-play.</p>
      </div>

      <section aria-label="Showcase games" className="flex flex-col gap-3">
        {games.map((g) => (
          <div key={g.gameId} className="flex flex-col gap-1 rounded-lg border border-black/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{g.label}</span>
              <button
                type="button"
                disabled={status === "streaming"}
                onClick={() => submitGame(g.gameId, false)}
                className="rounded bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Relive this game
              </button>
            </div>
            <p className="text-xs text-black/50">{COPY.fiction}</p>
          </div>
        ))}
      </section>

      {ENABLE_LIVE_GAME && (
        <form onSubmit={onLiveSubmit} className="flex flex-col gap-2 rounded-lg border border-dashed border-black/20 p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/50">Experimental: live game lookup</span>
          <div className="flex gap-2">
            <input
              aria-label="NHL game id"
              value={liveGameId}
              onChange={(e) => setLiveGameId(e.target.value)}
              placeholder="NHL game id"
              className="flex-1 rounded border border-black/20 px-3 py-2 text-sm"
            />
            <button type="submit" disabled={status === "streaming"} className="rounded border border-black/20 px-3 py-2 text-sm font-medium">
              Fetch
            </button>
          </div>
        </form>
      )}

      {submittedBody && <ActivityPanel events={events} status={status} streamText="" onRetry={retry} />}

      {memory && pkg && (
        <div ref={resultsRef} tabIndex={-1} className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-black/50">
            {memory.yourNight
              ? hadSessionAtSubmit
                ? "Personalized using your saved plan"
                : "Personalized (a saved plan was found)"
              : "General recap (no saved plan found)"}
          </p>
          <GameMemoryCard memory={memory} pkg={pkg} />
        </div>
      )}
    </main>
  );
}
