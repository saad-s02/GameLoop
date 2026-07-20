import { ItineraryPlan, PriorityTier } from "@/lib/planning/schemas";

const MILESTONE_LABEL: Record<string, string> = {
  doors: "doors",
  warmups: "warmups",
  puck_drop: "puck drop",
};

const SEVERITY_LABEL: Record<PriorityTier, string> = {
  hard: "HARD",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

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
  fallbackUsed: (reason: string) => `Wrote a plain summary without the live narrator: ${reason}`,
  severityLabel: (priority: PriorityTier) => SEVERITY_LABEL[priority],
  /**
   * One plain-language outcome sentence for the plan hero, built only from
   * fields already on the plan (the seat step's clock, a satisfied seated_by
   * constraint outcome). Never computes a number fresh. Degrades to a shorter
   * sentence when the seated_by clause isn't available, and returns undefined
   * (no sentence) when there is no seat step at all, so an infeasible plan
   * (which has no ItineraryPlan) or a malformed one never gets an invented line.
   */
  heroSentence: (plan: ItineraryPlan | undefined): string | undefined => {
    if (!plan) return undefined;
    const seatStep = plan.steps.find((s) => s.kind === "seat");
    if (!seatStep) return undefined;

    const satisfiedSeatedBy = plan.constraintOutcomes.find(
      (o) => o.constraint.type === "seated_by" && o.status === "satisfied",
    );
    if (satisfiedSeatedBy && satisfiedSeatedBy.constraint.type === "seated_by") {
      const milestone = MILESTONE_LABEL[satisfiedSeatedBy.constraint.value.milestone] ?? satisfiedSeatedBy.constraint.value.milestone;
      return `In by ${seatStep.clock}, seated before ${milestone}.`;
    }
    return `In by ${seatStep.clock}.`;
  },
} as const;
