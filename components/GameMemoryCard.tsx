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
    <article className="flex flex-col gap-3 rounded-lg border border-black/10 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{memory.headline}</h2>
        <p className="flex items-center gap-2 text-sm text-black/60">
          <span aria-hidden="true">&#10003;</span>
          <span>Verified against the game record: {memory.scoreLine}</span>
        </p>
      </header>

      <ol className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.momentId} className="rounded-lg border border-black/10 p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-black/50">#{row.rank}</span>
              <span className="text-sm font-semibold">{row.headline}</span>
              {row.clock && (
                <span className="font-mono text-xs text-black/50">
                  {row.periodLabel} {row.clock}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm">{row.text}</p>
          </li>
        ))}
      </ol>

      {memory.yourNight && (
        <div className="rounded-lg border border-black/10 p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-black/50">Your night</span>
            <SourceBadge source="snapshot" title="Built from the verified game record" />
            <SourceBadge source="simulated" title="Seat zone is fictional venue detail" />
          </div>
          <p className="text-sm">{memory.yourNight}</p>
        </div>
      )}

      <p className="text-sm text-black/70">{memory.reflection}</p>

      <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
        <p className="text-sm">{memory.copyText}</p>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium">
            {copyState === "copied" ? "Copied" : "Copy"}
          </button>
          {canShare && (
            <button type="button" onClick={share} className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium">
              Share
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
