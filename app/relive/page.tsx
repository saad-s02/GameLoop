"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  return (
    <Suspense fallback={null}>
      <RelivePageInner />
    </Suspense>
  );
}

function RelivePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demo = searchParams.get("demo") === "1";
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
    setSubmittedBody({ mode: "relive", gameId, live, demo, sessionContext: readStoredSession() ?? undefined });
  };

  const onLiveSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!liveGameId.trim()) return;
    submitGame(liveGameId.trim(), true);
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ice">Relive the Game</h1>
        <p className="text-sm text-frost">Pick a showcase game and get a Personal Game Memory built from the real play-by-play.</p>
      </div>

      <section aria-label="Showcase games" className="flex flex-col gap-3">
        {games.map((g) => (
          <div key={g.gameId} className="flex flex-col gap-2 rounded-card border border-steel bg-boards p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-semibold text-ice">{g.label}</span>
              <button
                type="button"
                disabled={status === "streaming"}
                onClick={() => submitGame(g.gameId, false)}
                className="rounded-well bg-ice px-3 py-1.5 text-sm font-semibold text-bowl motion-safe:transition-colors hover:bg-ice/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Relive this game
              </button>
            </div>
            <p className="text-xs leading-5 text-frost">{COPY.fiction}</p>
          </div>
        ))}
      </section>

      {ENABLE_LIVE_GAME && (
        <form onSubmit={onLiveSubmit} className="flex flex-col gap-2 rounded-card border border-steel-bright p-4">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-frost">
            Experimental: live game lookup
          </span>
          <div className="flex gap-2">
            <input
              aria-label="NHL game id"
              value={liveGameId}
              onChange={(e) => setLiveGameId(e.target.value)}
              placeholder="NHL game id"
              className="flex-1 rounded-well border border-steel bg-well/70 px-3 py-2 text-sm text-ice placeholder:text-frost"
            />
            <button
              type="submit"
              disabled={status === "streaming"}
              className="rounded-well border border-steel-bright px-3 py-2 text-sm font-medium text-ice motion-safe:transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-50"
            >
              Fetch
            </button>
          </div>
        </form>
      )}

      {submittedBody && <ActivityPanel events={events} status={status} streamText="" onRetry={retry} />}

      {memory && pkg && (
        <div ref={resultsRef} tabIndex={-1} aria-label="Personal Game Memory" className="flex scroll-mt-20 flex-col gap-2">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-frost">
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
