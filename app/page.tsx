import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold">GameLoop</h1>
        <p className="max-w-md text-sm opacity-70">
          An adaptive game-day copilot demo. Plan your night at Harbourview Arena, or relive a real Stanley Cup Playoffs game.
        </p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/plan"
          className="flex flex-col gap-2 rounded-lg border border-black/10 p-6 motion-safe:transition-colors hover:border-black/30"
        >
          <span className="text-lg font-semibold">Plan My Night</span>
          <span className="text-sm opacity-70">
            Tell us about your group and we will build a step-by-step arrival, food, and seating plan.
          </span>
        </Link>
        <Link
          href="/relive"
          className="flex flex-col gap-2 rounded-lg border border-black/10 p-6 motion-safe:transition-colors hover:border-black/30"
        >
          <span className="text-lg font-semibold">Relive the Game</span>
          <span className="text-sm opacity-70">
            Pick a showcase game and get a Personal Game Memory built from the real play-by-play.
          </span>
        </Link>
      </div>
    </main>
  );
}
