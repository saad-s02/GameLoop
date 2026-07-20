import { ItineraryPlan, PriorityTier, SourceClass } from "@/lib/planning/schemas";
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

// A Relive showcase label always carries its drama as a trailing
// parenthetical (lib/data/load.ts listShowcaseGames, e.g. "Stanley Cup
// Final Game 3 (2OT thriller)"). Both the card's mono-caps tag and its
// accent read from this same parenthetical so neither can drift into
// stating a fact the label doesn't already carry.
const SHOWCASE_LABEL_PAREN = /\(([^)]+)\)/;

const PROVENANCE_PLAIN: Record<SourceClass, string> = {
  live: "Checked right now.",
  snapshot: "From a saved copy of the real schedule.",
  simulated: "Invented for this demo.",
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
  /** Hero-slot heading for SkeletonTimeline, shown while Tonight's Plan
   * streams in and no plan is on screen yet. A title, not a narration line:
   * the decision log's streaming rows already narrate progress underneath. */
  planBuildingHeading: "Building tonight's plan",
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
  /**
   * Relive showcase card (app/relive/page.tsx) mono-caps tag: the card's
   * own label parenthetical, upper-cased verbatim (e.g. "2OT thriller" ->
   * "2OT THRILLER"). Restates what the label already says instead of
   * inventing new drama; undefined when a label carries no parenthetical
   * to derive from.
   */
  showcaseGameTag: (label: string): string | undefined => {
    const match = label.match(SHOWCASE_LABEL_PAREN);
    return match ? match[1]!.toUpperCase() : undefined;
  },
  /**
   * Relive showcase card accent: "loud" (red-lamp stripe) for a
   * multi-overtime finish, "quiet" (blue-glow stripe) otherwise. Read from
   * the same parenthetical as showcaseGameTag (a leading digit before "OT",
   * e.g. "2OT thriller"), so the accent always matches what the tag says.
   */
  showcaseGameAccent: (label: string): "loud" | "quiet" => {
    const match = label.match(SHOWCASE_LABEL_PAREN);
    return match && /^\dOT\b/i.test(match[1]!) ? "loud" : "quiet";
  },
  /**
   * How It Works (app/how-it-works/page.tsx) plain-language lead: sits
   * above the page's existing technical detail and speaks to a parent who
   * just got a plan, not the portfolio audience the rest of the page
   * serves. Two sentences, no jargon.
   */
  provenanceLead:
    "Your plan mixes real information with a few practical stand-ins made just for this demo. These three tags, used throughout the app, tell you which is which.",
  /** One plain sentence per provenance badge, paired inline with the actual
   * SourceBadge on the How It Works plain-language lead so the visual
   * vocabulary is taught, not just described. */
  provenancePlainExplain: (source: SourceClass): string => PROVENANCE_PLAIN[source],
} as const;
