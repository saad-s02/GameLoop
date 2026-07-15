import { SourceBadge } from "@/components/SourceBadge";
import { COPY } from "@/lib/copy";

const PRODUCTION_PATHS: { label: string; detail: string }[] = [
  {
    label: "Authentication",
    detail: "production use would add real per-user account sign-in instead of the shared demo access code.",
  },
  {
    label: "Payments",
    detail: "production use would add a PCI-compliant payment processor for ticketing and food orders.",
  },
  {
    label: "Real ticketing or ordering integrations",
    detail:
      "production use would connect to the venue's actual box-office and point-of-sale systems instead of the simulated seats and stands here.",
  },
  {
    label: "Live in-game data",
    detail: "production use would replace the experimental NHL adapter with a licensed, officially supported live-data feed.",
  },
  {
    label: "Push notifications",
    detail:
      "production use would alert users to disruptions automatically instead of relying on this demo's manual disruption buttons.",
  },
  {
    label: "Video generation",
    detail: "production use would add real video or animation generation for game recaps instead of the prose-only Personal Game Memory.",
  },
  {
    label: "Mobile apps",
    detail: "production use would ship native iOS and Android apps instead of this single responsive web page.",
  },
  {
    label: "Multi-venue support",
    detail: "production use would generalize the venue graph and data adapters beyond the single fictional Harbourview Arena.",
  },
  {
    label: "Real seat maps",
    detail: "production use would replace the simulated seat sections and view zones with the venue's actual seat map.",
  },
  {
    label: "Production data licensing",
    detail: "production use would require signed licensing agreements covering every external data source used, including transit and league data.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ice">How GameLoop works</h1>
        <p className="text-sm leading-relaxed text-ice/85">
          GameLoop is a bounded orchestration. The model's job is narrow: it translates natural language into a
          validated constraint contract, and it translates verified results back into prose. Deterministic code
          decides everything else, including feasibility, arithmetic, and ranking.
        </p>
        <p className="text-sm leading-relaxed text-ice/85">
          The constraint contract card renders strictly before any plan, so a wrong reading is visible before
          compute.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">Where information comes from</h2>
        <p className="text-sm leading-relaxed text-ice/85">
          Every value shown in the app carries a source label, rendered as one of these three badges:
        </p>
        <ul className="flex flex-col gap-3">
          <li className="flex flex-wrap items-baseline gap-2 rounded-card border border-steel bg-boards p-3.5">
            <SourceBadge source="live" />
            <span className="text-sm leading-5 text-frost">
              Fetched at request time. Used only by the experimental NHL adapter.
            </span>
          </li>
          <li className="flex flex-wrap items-baseline gap-2 rounded-card border border-steel bg-boards p-3.5">
            <SourceBadge source="snapshot" />
            <span className="text-sm leading-5 text-frost">
              Real data captured once and committed with its source and fetch date. This covers game data and GO
              Transit schedule times.
            </span>
          </li>
          <li className="flex flex-wrap items-baseline gap-2 rounded-card border border-steel bg-boards p-3.5">
            <SourceBadge source="simulated" />
            <span className="text-sm leading-5 text-frost">
              Synthetic by necessity and labeled as such. This covers venue operations, data that only
              organizations like MLSE possess.
            </span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">NHL data compliance</h2>
        <p className="text-sm leading-relaxed text-ice/85">
          The prototype includes an optional adapter for an undocumented NHL web endpoint observed to be
          accessible without authentication. Because the endpoint is not an officially supported developer API,
          committed seeded fixtures are the guaranteed demonstration source. The live adapter is experimental and
          is not a production integration. The prototype minimizes intellectual-property risk with plain-text
          factual references, no logos or imagery, reduced fixtures, and a non-affiliation disclaimer. Production
          use would require review of applicable data and licensing terms.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">Transit data</h2>
        <p className="text-sm leading-relaxed text-ice/85">
          {COPY.gtfsAttribution}{" "}
          <a
            href={COPY.gtfsLicenceUrl}
            className="text-blue-glow underline decoration-blue-glow/40 underline-offset-2 motion-safe:transition-colors hover:decoration-blue-glow"
            target="_blank"
            rel="noreferrer"
          >
            Licence
          </a>{" "}
          (snapshot {COPY.gtfsSnapshotDate}).
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">Model routing</h2>
        <p className="text-sm leading-relaxed text-ice/85">
          Extraction calls use claude-haiku-4-5-20251001. Narrative calls use claude-sonnet-5, with thinking
          disabled. Structured outputs are produced through native constrained decoding, not a separate parsing
          step. Model IDs were confirmed at platform.claude.com on 2026-07-13.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ice">What production would add</h2>
        <p className="text-sm leading-relaxed text-ice/85">
          This is a demo prototype. The list below is not exhaustive, but each item names one thing a production
          build would need that this demo intentionally leaves out.
        </p>
        <ul className="flex flex-col gap-2 text-sm text-frost">
          {PRODUCTION_PATHS.map((item) => (
            <li key={item.label} className="rounded-card border border-steel bg-boards p-3.5 leading-5">
              <strong className="font-semibold text-ice">{item.label}:</strong> {item.detail}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
