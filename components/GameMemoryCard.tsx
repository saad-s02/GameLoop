"use client";

import { useEffect, useState } from "react";
import { GameMemory, MomentPackage } from "@/lib/planning/schemas";
import { SourceBadge } from "./SourceBadge";

export function GameMemoryCard({ memory, pkg }: { memory: GameMemory; pkg: MomentPackage }) {
  const [canShare, setCanShare] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const rows = memory.momentBlurbs
    .map((b) => {
      const moment = pkg.moments.find((m) => m.id === b.momentId);
      return {
        momentId: b.momentId,
        text: b.text,
        rank: moment?.rank ?? Number.MAX_SAFE_INTEGER,
        headline: moment?.headline ?? b.momentId,
        clock: moment?.memberPlays[0]?.clock,
        periodLabel: moment?.memberPlays[0]?.periodLabel,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  const copy = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(memory.copyText);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ text: memory.copyText });
    }
  };

  return (
    <article className="flex flex-col gap-4 rounded-sheet border border-steel bg-boards p-5 shadow-sheet">
      <header className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold leading-7 text-ice">{memory.headline}</h2>
        <p className="flex items-center gap-2 text-sm text-frost">
          <span aria-hidden="true" className="text-ice-green">&#10003;</span>
          <span>
            Verified against the game record:{" "}
            <span className="font-mono text-[13px] tabular-nums text-ice">{memory.scoreLine}</span>
          </span>
        </p>
      </header>

      <ol className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.momentId} className="grid grid-cols-[3rem_1fr] gap-x-3 rounded-card border border-steel bg-glass/50 p-3.5">
            <span
              aria-hidden="true"
              className={`memory-rank row-span-2 self-start text-right font-display text-4xl font-bold leading-none ${
                row.rank === 1 ? "text-sodium" : "text-frost/70"
              }`}
            >
              {row.rank === Number.MAX_SAFE_INTEGER ? "" : row.rank}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="sr-only">Rank {row.rank === Number.MAX_SAFE_INTEGER ? "unknown" : row.rank}.</span>
              <span className="text-[15px] font-semibold leading-5 text-ice">{row.headline}</span>
              {row.clock && (
                <span className="font-mono text-xs tabular-nums text-frost">
                  {row.periodLabel} {row.clock}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-6 text-ice/90">{row.text}</p>
          </li>
        ))}
      </ol>

      {memory.yourNight && (
        <div className="rounded-card border border-steel bg-well/60 p-3.5">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-frost">
              Your night
            </span>
            <SourceBadge source="snapshot" title="Built from the verified game record" />
            <SourceBadge source="simulated" title="Seat zone is fictional venue detail" />
          </div>
          <p className="text-sm leading-6 text-ice/90">{memory.yourNight}</p>
        </div>
      )}

      <p className="text-sm leading-6 text-frost">{memory.reflection}</p>

      <div className="flex flex-col gap-2.5 rounded-card border border-steel bg-well/60 p-3.5">
        <p className="text-sm leading-6 text-ice/90">{memory.copyText}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-well border border-steel-bright px-3 py-1.5 text-sm font-medium text-ice motion-safe:transition-colors hover:bg-glass"
          >
            {copyState === "copied" ? "Copied" : "Copy"}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={share}
              className="rounded-well border border-steel-bright px-3 py-1.5 text-sm font-medium text-ice motion-safe:transition-colors hover:bg-glass"
            >
              Share
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
