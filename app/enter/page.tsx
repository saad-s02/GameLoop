"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function EnterPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "invalid" | "error">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("checking");
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.push("/plan");
        return;
      }
      setStatus(res.status === 401 ? "invalid" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-16">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-sheet border border-steel bg-boards p-6 shadow-rink">
        <div className="flex flex-col gap-1.5 text-center">
          <p aria-hidden="true" className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-frost">
            Gate check
          </p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-ice">
            Enter access code
          </h1>
          <p className="text-sm text-frost">This demo is private. Enter the code you were given.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ice">
            Access code
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={100}
              required
              autoFocus
              className="rounded-well border border-steel bg-well/70 px-3 py-2 text-base text-ice motion-safe:transition-colors focus:border-steel-bright"
            />
          </label>
          <button
            type="submit"
            disabled={status === "checking" || code.length === 0}
            className="cta-ready rounded-well bg-ice px-4 py-2 text-sm font-semibold text-bowl outline outline-2 outline-offset-2 outline-blue-glow/35 motion-safe:transition-colors hover:bg-ice/90 hover:outline-blue-glow/65 disabled:cursor-not-allowed disabled:opacity-50 disabled:outline-transparent disabled:hover:outline-transparent"
          >
            {status === "checking" ? "Checking…" : "Enter"}
          </button>
          <p aria-live="polite" className="text-sm text-red-lamp">
            {status === "invalid" && "That code was not recognized. Please try again."}
            {status === "error" && "Something went wrong. Please try again."}
          </p>
        </form>
      </div>
    </main>
  );
}
