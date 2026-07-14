import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { PlanApiInputSchema, PlanRequest, PlanRequestSchema } from "@/lib/planning/schemas";
import { createTraceStream, SSE_HEADERS } from "@/lib/trace/sse";
import { verifyAccess } from "@/lib/server/access";
import { evaluate } from "@/lib/planning/evaluate";
import { loadPlannerInput } from "@/lib/planning/adapters";
import { decisionSummary, fallbackNarrative } from "@/lib/planning/summarize";
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
      // 1. constraint contract: demo fixtures, or live extraction with a precomputed-chip fallback.
      let request: PlanRequest;
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

      emit({ type: "request_parsed", constraints: request.constraints, clarificationsNeeded: request.clarificationsNeeded });

      if (request.offTopic) {
        emit({ type: "decision", summary: "This request is outside game-night planning, so GameLoop stops here." });
        emit({ type: "done" });
        close();
        return;
      }
      if (request.clarificationsNeeded.length > 0) {
        emit({
          type: "decision",
          summary: `Need clarification before planning: ${request.clarificationsNeeded.map((c) => c.question).join(" ")}`,
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
