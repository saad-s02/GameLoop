import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-12 px-6 py-20">
      <div className="arrive arrive-1 flex flex-col items-center gap-5 text-center">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-frost">
          Game-day copilot &middot; Harbourview Arena
        </p>
        <h1 className="font-display text-7xl font-bold uppercase leading-none tracking-wide text-ice">
          GameLoop
        </h1>
        <div aria-hidden="true" className="flex w-64 items-center gap-3">
          <span className="h-0.5 flex-1 rounded-full bg-line-blue/50" />
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-red/50">
            <span className="h-1.5 w-1.5 rounded-full bg-line-red" />
          </span>
          <span className="h-0.5 flex-1 rounded-full bg-line-blue/50" />
        </div>
        <p className="max-w-md text-[15px] leading-6 text-frost">
          An adaptive game-day copilot demo. Plan your night at Harbourview Arena.
        </p>
      </div>
      <Link
        href="/plan"
        className="group flex w-full max-w-md flex-col gap-3 rounded-card border border-steel bg-boards p-6 shadow-rink motion-safe:transition-all motion-safe:duration-[var(--t-micro)] motion-safe:hover:-translate-y-0.5 hover:border-steel-bright hover:bg-glass"
      >
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-blue-glow">
          Before puck drop
        </span>
        <span className="font-display text-2xl font-semibold uppercase tracking-wide text-ice">
          Plan My Night
        </span>
        <span className="text-sm leading-6 text-frost">
          Tell us about your group and we will build a step-by-step arrival, food, and seating plan.
        </span>
      </Link>
    </main>
  );
}
