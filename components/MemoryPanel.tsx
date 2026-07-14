"use client";

import { useCallback, useEffect, useState } from "react";
import { SessionContext, SessionContextSchema } from "@/lib/planning/schemas";

export const SESSION_STORAGE_KEY = "gameloop.session.v1";
export const SESSION_UPDATED_EVENT = "gameloop:session-updated";

export function readStoredSession(): SessionContext | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = SessionContextSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (new Date(parsed.data.expiresAt).getTime() < Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function Row({ label, value, provenance }: { label: string; value: string; provenance: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-black/5 py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-black/50">{label}</span>
        <span className="text-xs text-black/40">{provenance}</span>
      </div>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function MemoryPanel() {
  const [session, setSession] = useState<SessionContext | null>(null);

  const refresh = useCallback(() => setSession(readStoredSession()), []);

  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(SESSION_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(SESSION_UPDATED_EVENT, refresh);
    };
  }, [refresh]);

  const clear = () => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
  };

  return (
    <aside aria-label="What GameLoop remembers" className="flex flex-col gap-3 rounded-lg border border-black/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">What GameLoop remembers</h2>
        <button
          type="button"
          onClick={clear}
          disabled={!session}
          className="rounded border border-black/20 px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear Memory
        </button>
      </div>
      {!session ? (
        <p className="text-sm text-black/50">Nothing saved yet.</p>
      ) : (
        <div>
          <Row
            label="Party"
            value={`${session.party.adults} adult${session.party.adults === 1 ? "" : "s"}, ${session.party.children} child${session.party.children === 1 ? "" : "ren"}`}
            provenance="explicit user input"
          />
          <Row
            label="Dietary"
            value={session.dietaryRequirements.length ? session.dietaryRequirements.map((d) => d.value).join(", ") : "none stated"}
            provenance="explicit user input"
          />
          {session.seatSection && (
            <Row label="Seat section" value={`${session.seatSection}${session.viewZone ? ` (${session.viewZone})` : ""}`} provenance="from selected plan" />
          )}
          {session.arrivalChoice && (
            <Row label="Arrival" value={`${session.arrivalChoice.mode}, ${session.arrivalChoice.scheduledArrival}`} provenance="from your request" />
          )}
          <Row label="Selected plan" value={session.selectedPlanId} provenance="from selected plan" />
          <Row label="Saved" value={new Date(session.createdAt).toLocaleString()} provenance="this device" />
        </div>
      )}
    </aside>
  );
}
