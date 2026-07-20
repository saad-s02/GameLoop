import { DisruptionId, PlanRequest, TransitOption, Venue } from "./schemas";

export interface PlannerGame {
  gameId: string;
  doorsOpenAt: string;
  warmupStartAt: string;
  puckDropAt: string;
}

export interface PlannerInput {
  venue: Venue;
  transitOptions: TransitOption[];
  request: PlanRequest;
  game: PlannerGame;
  /** Disruption-only. Minutes added to the resolved transit arrival after snap. 0 for baseline. */
  transitDelayMinutes: number;
}

/**
 * Pure: never mutates `input`. Returns a new PlannerInput with the named disruptions applied.
 */
export function applyDisruptions(input: PlannerInput, disruptions: DisruptionId[]): PlannerInput {
  const next: PlannerInput = structuredClone(input);

  for (const d of disruptions) {
    switch (d) {
      case "train-plus-18": {
        next.transitDelayMinutes += 18;
        break;
      }
      case "gate1-wait-22": {
        const gate1 = next.venue.gates.find((g) => g.id === "gate-1");
        if (gate1) {
          for (const band of gate1.waitProfile) band.waitMinutes = 22;
        }
        break;
      }
      case "gf-stand-closed": {
        next.venue.stands = next.venue.stands.filter((s) => s.id !== "stand-harbour-fresh");
        break;
      }
      case "milestone-puck-drop": {
        next.request.constraints = next.request.constraints.map((c) =>
          c.type === "seated_by" ? { ...c, value: { milestone: "puck_drop" } } : c,
        );
        break;
      }
      case "add-accessibility": {
        const has = next.request.constraints.some((c) => c.type === "accessibility");
        if (!has) {
          next.request.constraints = [
            ...next.request.constraints,
            {
              type: "accessibility",
              value: { need: "step-free" },
              priority: "hard",
              sourceText: "Added during demo",
            },
          ];
        }
        break;
      }
      case "july25-weekend-service": {
        // The verified 2026-07-25/26 weekend: Ontario Line construction at
        // Exhibition reduces Lakeshore West service (UP Express is replaced
        // by GO buses that weekend and is not modeled in this snapshot).
        // Modeled as Lakeshore West dropping to its West Harbour base
        // trips; Lakeshore East is unaffected per the same research pass.
        // Source: research/2026-07-25-real-data/report.md section 3.
        next.transitOptions = next.transitOptions.filter(
          (o) => !o.routeId.endsWith("-LW") || o.origin.includes("West Harbour"),
        );
        break;
      }
    }
  }

  return next;
}
