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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold">Enter access code</h1>
          <p className="text-sm opacity-70">This demo is private. Enter the code you were given.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Access code
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={100}
              required
              autoFocus
              className="rounded border border-black/20 px-3 py-2 text-base"
            />
          </label>
          <button
            type="submit"
            disabled={status === "checking" || code.length === 0}
            className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "checking" ? "Checking…" : "Enter"}
          </button>
          <p aria-live="polite" className="text-sm text-rose-700">
            {status === "invalid" && "That code was not recognized. Please try again."}
            {status === "error" && "Something went wrong. Please try again."}
          </p>
        </form>
      </div>
    </main>
  );
}
