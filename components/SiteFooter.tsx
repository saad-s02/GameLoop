import { COPY } from "@/lib/copy";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-black/10 px-4 py-4 text-xs text-black/60">
      <div className="mx-auto flex max-w-3xl flex-col gap-1">
        <p>{COPY.nonAffiliation}</p>
        <p>{COPY.fiction}</p>
        <p>
          {COPY.gtfsAttribution}{" "}
          <a href={COPY.gtfsLicenceUrl} className="underline" target="_blank" rel="noreferrer">
            Licence
          </a>{" "}
          (snapshot {COPY.gtfsSnapshotDate}).
        </p>
      </div>
    </footer>
  );
}
