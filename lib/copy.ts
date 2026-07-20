export const COPY = {
  nonAffiliation:
    "GameLoop is an independent demo, not affiliated with or endorsed by the NHL, its teams, or any venue.",
  fiction:
    "Game results and plays shown are real, from the NHL's public record. Harbourview Arena, its gates, concessions, and seat map are fictional, simulated for this demo.",
  gtfsAttribution:
    "Contains information licensed under the Open Government Licence - Ontario - Metrolinx.",
  gtfsLicenceUrl: "https://www.metrolinx.com/en/about-us/open-data/licence",
  gtfsSnapshotDate: "2026-07-07",
  dietaryDisclaimer: (need: string) =>
    `Listed as offering a ${need} item. Cross-contact information is unavailable; confirm with venue staff.`,
  answerUseThis: "Use this",
  answerAdultsLabel: "Adults",
  answerChildrenLabel: "Children",
  followUpHeading: "Change something or add a detail",
  followUpPlaceholder: "e.g. actually we arrive at 6, add wheelchair access, cheaper food",
  followUpDemoNote: "Free-text changes use the live model. In demo mode, use the quick chips.",
  followUpSend: "Update plan",
  historyHeading: "What you have told us",
  assumedHeading: "Assumed for this plan",
  decisionLogSummary: (signalCount: number) =>
    `Plan built from ${signalCount} signal${signalCount === 1 ? "" : "s"} · View reasoning`,
} as const;
