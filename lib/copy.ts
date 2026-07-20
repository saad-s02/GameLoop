import { ItineraryPlan, PriorityTier } from "@/lib/planning/schemas";
import { PUCK_DROP_CLOCK, toNormalizedMinutes } from "@/lib/planning/time";

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
  /**
   * Puck-drop value for the /plan tonight's-game eyebrow: a live countdown
   * only inside a sane pre-game window (strictly after now, at most 12
   * hours out), otherwise the static scheduled time. A demo fixture's game
   * night rarely lands on the real calendar date, so only time-of-day is
   * compared, in normalized minutes from puck drop, never a time-string
   * comparison (CLAUDE.md: all time math in normalized minutes). `prefix`
   * is the frost label text; `value` is the sodium mono figure.
   */
  puckDropEyebrow: (
    nowClock: string,
    puckDropClock: string = PUCK_DROP_CLOCK,
  ): { mode: "countdown" | "static"; prefix: string; value: string } => {
    const minutesUntil = -toNormalizedMinutes(nowClock, puckDropClock);
    if (minutesUntil > 0 && minutesUntil <= 12 * 60) {
      const h = Math.floor(minutesUntil / 60);
      const m = minutesUntil % 60;
      return { mode: "countdown", prefix: "Puck drop in", value: h === 0 ? `${m}m` : `${h}h ${m}m` };
    }
    return { mode: "static", prefix: "Puck drop", value: puckDropClock };
  },
  /** MemoryPanel empty state: an invitation, not a dead end. The literal
   * "Nothing saved yet." phrase stays verbatim (the demo smoke spec asserts
   * on it); the preview names the three field groups the panel will fill in. */
  memoryEmptyLead: "Nothing saved yet. Plan a night and this remembers it for next time.",
  memoryEmptyPreviewItems: ["Party", "Dietary needs", "Seat section and arrival"],
} as const;
