import { performance } from "node:perf_hooks";
import { loadShowcaseGame, loadTransit, loadVenue } from "../data/load";
import { DisruptionId, PlanRequest, TraceEvent } from "./schemas";
import { PlannerInput, applyDisruptions } from "./disruptions";

const SHOWCASE_GAME_ID = "2025030413";

function timed<T>(
  trace: TraceEvent[],
  tool: string,
  source: "simulated" | "snapshot",
  fn: () => T,
): T {
  trace.push({ type: "data_requested", tool, input: {} });
  const start = performance.now();
  const result = fn();
  const latencyMs = performance.now() - start;
  trace.push({ type: "data_received", tool, latencyMs, source });
  return result;
}

/**
 * Wraps loadVenue/loadTransit/loadShowcaseGame(SHOWCASE_GAME_ID), applies the given disruptions,
 * and returns the ready-to-evaluate PlannerInput plus the data_requested/data_received trace
 * events for the four simulated tool calls.
 */
export function loadPlannerInput(
  request: PlanRequest,
  disruptions: DisruptionId[] = [],
): { input: PlannerInput; trace: TraceEvent[] } {
  const trace: TraceEvent[] = [];

  const game = timed(trace, "get_event_context", "simulated", () => loadShowcaseGame(SHOWCASE_GAME_ID));
  const venue = timed(trace, "search_concessions", "simulated", () => loadVenue());
  const transitOptions = timed(trace, "get_transit_options", "snapshot", () => loadTransit());
  timed(trace, "get_gate_conditions", "simulated", () => venue.gates);

  const baseInput: PlannerInput = {
    venue,
    transitOptions,
    request,
    game: {
      gameId: game.gameId,
      doorsOpenAt: game.doorsOpenAt,
      warmupStartAt: game.warmupStartAt,
      puckDropAt: game.puckDropAt,
    },
    transitDelayMinutes: 0,
  };

  const input = disruptions.length > 0 ? applyDisruptions(baseInput, disruptions) : baseInput;

  return { input, trace };
}
