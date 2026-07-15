import { COPY } from "@/lib/copy";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-steel px-6 py-5 text-xs leading-5 text-frost">
      <div className="mx-auto flex max-w-5xl flex-col gap-1.5">
        <p>{COPY.nonAffiliation}</p>
        <p>{COPY.fiction}</p>
        <p>
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
      </div>
    </footer>
  );
}
