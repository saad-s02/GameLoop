import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { PlanApiInputSchema, PlanRequest, PlanRequestSchema } from "@/lib/planning/schemas";
import { createTraceStream, SSE_HEADERS } from "@/lib/trace/sse";
import { verifyAccess } from "@/lib/server/access";
import { evaluate } from "@/lib/planning/evaluate";
import { loadPlannerInput } from "@/lib/planning/adapters";
import { decisionSummary, fallbackNarrative } from "@/lib/planning/summarize";
import { routeLabel } from "@/lib/planning/candidates";
import { extractPlanRequest, explainPlanStream } from "@/lib/ai/outputs";
import { buildExplainInput } from "@/lib/server/explainInput";
import demoExtractions from "@/lib/data/demo-extractions.json";

const BODY_CHAR_CAP = 10_000;
const REQUEST_BUDGET_MS = 30_000;

function demoRequest(chipId: string): PlanRequest {
  return PlanRequestSchema.parse((demoExtractions as Record<string, unknown>)[chipId]);
}

export async function POST(req: NextRequest) {
  if (!verifyAccess(req.cookies.get("gl_access")?.value, process.env.ACCESS_COOKIE_SECRET!)) {
    return Response.json({ error: "access code required" }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > BODY_CHAR_CAP) return Response.json({ error: "body too large" }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const parsed = PlanApiInputSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const input = parsed.data;

  const requestId = randomUUID();
  const { stream, emit, close } = createTraceStream(requestId);
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(REQUEST_BUDGET_MS)]);

  (async () => {
    try {
      // First-frame latency: emit before any model round-trip so the Decision Log
      // never sits empty waiting on extraction (PRD 12 / spec section 7, sub-750ms).
      emit({ type: "decision", summary: "Reading your request." });

      // 1. constraint contract: demo fixtures, or live extraction with a precomputed-chip fallback.
      // Demo mode is a zero-LLM guarantee: without a chip it refuses rather than calling the model.
      let request: PlanRequest;
      if (input.demo && !input.chipId) {
        emit({ type: "decision", summary: "Demo mode runs without model calls and uses the three preset prompts. Pick a chip to continue." });
        emit({ type: "done" });
        close();
        return;
      }
      if (input.demo && input.chipId) {
        request = demoRequest(input.chipId);
      } else {
        try {
          request = await extractPlanRequest(input.text, { signal });
        } catch {
          if (input.chipId) {
            emit({ type: "fallback_used", reason: "extraction failed; precomputed contract for this chip" });
            request = demoRequest(input.chipId);
          } else {
            emit({ type: "error", message: "Could not read that request. Try rephrasing in a sentence or two." });
            emit({ type: "done" });
            close();
            return;
          }
        }
      }

      const blocking = request.clarificationsNeeded.filter((c) => c.field === "party");
      const nonBlocking = request.clarificationsNeeded.filter((c) => c.field !== "party");
      emit({ type: "request_parsed", constraints: request.constraints, clarificationsNeeded: blocking });

      if (request.offTopic) {
        emit({ type: "decision", summary: "This request is outside game-night planning, so GameLoop stops here." });
        emit({ type: "done" });
        close();
        return;
      }

      for (const c of nonBlocking) {
        if (c.field === "budget") emit({ type: "decision", summary: "Planning without a budget cap. Add one any time in a follow-up." });
        if (c.field === "dietary") emit({ type: "decision", summary: "No dietary needs stated. Tell us any time." });
        // arrival: handled as an explicit assumption after evaluation
      }

      if (blocking.length > 0) {
        emit({
          type: "decision",
          summary: `Need one answer before planning: ${blocking.map((c) => c.question).join(" ")}`,
        });
        emit({ type: "done" });
        close();
        return;
      }

      // 2. adapters (data_requested/data_received trace events for the four simulated/snapshot tool calls).
      const { input: plannerInput, trace: adapterTrace } = loadPlannerInput(request);
      for (const e of adapterTrace) emit(e);

      // 3. deterministic planner. Disruptions are applied inside evaluate(), never pre-applied by
      // loadPlannerInput here, so a prior-plan diff can be recomputed against the true baseline.
      const result = evaluate(plannerInput, { disruptions: input.disruptions, priorPlanId: input.priorPlanId });

      for (const a of result.adjustments) emit({ type: "constraint_adjusted", ...a });
      emit({ type: "candidates_summary", evaluated: result.candidateStats.evaluated, feasible: result.candidateStats.feasible });

      // Flood control: emit candidate_evaluated for the winner, runner-up, and bestAlternative only.
      if (result.feasible && result.plan) {
        emit({ type: "candidate_evaluated", planId: result.plan.planId, score: result.plan.score, violations: [] });
        if (result.runnerUp) {
          emit({ type: "candidate_evaluated", planId: result.runnerUp.planId, score: result.runnerUp.score, violations: [] });
        }
      } else if (result.bestAlternative) {
        emit({
          type: "candidate_evaluated",
          planId: result.bestAlternative.planId,
          score: result.bestAlternative.score,
          violations: result.violations,
        });
      }

      const hasArrival = request.constraints.some((c) => c.type === "arrival");
      const hasFoodPref = request.constraints.some((c) => c.type === "food_preference");
      if (!hasArrival && result.feasible && result.plan?.transitRouteId && result.plan.transitArrival) {
        emit({
          type: "assumption_made",
          field: "arrival",
          assumed: `you can take any scheduled train, so GameLoop picked ${routeLabel(result.plan.transitRouteId)} arriving ${result.plan.transitArrival}`,
          reason: "No arrival time was given. Tell us in a follow-up if you are arriving differently.",
        });
      }
      if (!hasFoodPref && result.feasible && result.plan && result.plan.standIds.length > 0) {
        emit({
          type: "assumption_made",
          field: "food_timing",
          assumed:
            result.plan.arrivalStrategy === "pickup-en-route"
              ? "food gets picked up on the way to your seats"
              : "food gets picked up after you are seated",
          reason: "No food timing preference was given. Tell us if you want it the other way.",
        });
      }

      emit({ type: "decision", summary: decisionSummary(result) });
      emit({ type: "plan_result", result });

      // 4. explanation stream (skipped in demo mode; deterministic fallback text instead).
      if (!input.demo && result.feasible) {
        try {
          for await (const chunk of await explainPlanStream(buildExplainInput(result), { signal })) {
            emit({ type: "response_chunk", text: chunk });
          }
        } catch {
          emit({ type: "fallback_used", reason: "explanation failed; deterministic summary shown" });
          emit({ type: "response_chunk", text: fallbackNarrative(result) });
        }
      } else {
        emit({ type: "response_chunk", text: fallbackNarrative(result) });
      }

      emit({ type: "done" });
    } catch (err) {
      emit({
        type: "error",
        message: err instanceof Error && err.name === "TimeoutError" ? "Request timed out." : "Something went wrong.",
      });
    } finally {
      close();
    }
  })();

  return new Response(stream, { headers: SSE_HEADERS });
}
