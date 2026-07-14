import { SourceClass } from "@/lib/planning/schemas";

const LABEL: Record<SourceClass, string> = { live: "LIVE", snapshot: "SNAPSHOT", simulated: "SIMULATED" };
const STYLE: Record<SourceClass, string> = {
  live: "bg-emerald-100 text-emerald-900 border-emerald-300",
  snapshot: "bg-sky-100 text-sky-900 border-sky-300",
  simulated: "bg-amber-100 text-amber-900 border-amber-300",
};

export function SourceBadge({ source, title }: { source: SourceClass; title?: string }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-semibold tracking-wide ${STYLE[source]}`} title={title}>
      {LABEL[source]}
    </span>
  );
}
