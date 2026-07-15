import { PlanResult, ShowcaseGame } from "./schemas";

// Deterministic text, used as the Decision Log decision event AND the narrative fallback.
export function decisionSummary(result: PlanResult): string {
  if (!result.feasible) return `No feasible plan: ${result.violations.join("; ")}.`;
  const p = result.plan!;
  const traded = p.constraintOutcomes.filter((o) => o.status === "traded").map((o) => o.constraint.type);
  return (
    `Selected ${p.candidateId} (score ${p.score.toFixed(1)}): seated ${p.seatedAtMinutes <= -50 ? "before warmups" : "after warmups"}, ` +
    `${p.walkingMinutes} min walking, ${p.waitMinutes} min waiting` +
    (traded.length ? `; traded: ${traded.join(", ")}` : "") +
    "."
  );
}

export function redirectSummary(requested: string, game: ShowcaseGame): string {
  const away = `${game.awayTeam.placeName} ${game.awayTeam.commonName}`;
  const home = `${game.homeTeam.placeName} ${game.homeTeam.commonName}`;
  return `You asked about ${requested}. Tonight Harbourview Arena hosts hockey: ${home} at ${away}, puck drop ${game.puckDropAt}. Planning your night around it.`;
}

export function fallbackNarrative(result: PlanResult): string {
  if (!result.feasible) {
    return (
      `This request cannot be satisfied as stated: ${result.violations.join("; ")}. ` +
      `The closest feasible alternative is shown below the Decision Log. (Deterministic summary; the narrative model was unavailable.)`
    );
  }
  const p = result.plan!;
  return (
    `${decisionSummary(result)} Enter at ${p.steps.find((s) => s.kind === "gate")?.title ?? "the gate"}, ` +
    `seated by ${p.steps.find((s) => s.kind === "seat")?.clock ?? ""}. (Deterministic summary; the narrative model was unavailable.)`
  );
}
