import { SourceClass } from "@/lib/planning/schemas";

const LABEL: Record<SourceClass, string> = { live: "LIVE", snapshot: "SNAPSHOT", simulated: "SIMULATED" };
// Provenance grammar: color is reinforcement only, the visible word is the
// meaning. SIMULATED additionally carries the app's only dashed border, so
// fabricated data reads differently even in grayscale.
const STYLE: Record<SourceClass, string> = {
  live: "border-red-lamp/40 bg-red-lamp/10 text-red-lamp",
  snapshot: "border-blue-glow/40 bg-blue-glow/10 text-blue-glow",
  simulated: "border-dashed border-frost/50 bg-frost/10 text-frost",
};

export function SourceBadge({ source, title }: { source: SourceClass; title?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${STYLE[source]}`}
      title={title}
    >
      {source === "live" && <span aria-hidden="true" className="live-dot h-1.5 w-1.5 rounded-full bg-red-lamp" />}
      {LABEL[source]}
    </span>
  );
}
