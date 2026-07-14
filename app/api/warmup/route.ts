import { NextRequest } from "next/server";
import { performance } from "node:perf_hooks";
import { verifyAccess } from "@/lib/server/access";
import { extractPlanRequest, generateRecap } from "@/lib/ai/outputs";
import { buildWarmupMomentPackage } from "@/lib/server/recap";

const REQUEST_BUDGET_MS = 30_000;
const WARMUP_TEXT = "warmup ping: two of us, seated by puck drop";

export async function POST(req: NextRequest) {
  if (!verifyAccess(req.cookies.get("gl_access")?.value, process.env.ACCESS_COOKIE_SECRET!)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(REQUEST_BUDGET_MS)]);
  const latencies: { extraction?: number; recap?: number } = {};

  try {
    const extractionStart = performance.now();
    await extractPlanRequest(WARMUP_TEXT, { signal });
    latencies.extraction = performance.now() - extractionStart;

    const pkg = buildWarmupMomentPackage();
    const recapStart = performance.now();
    await generateRecap(pkg, null, { signal });
    latencies.recap = performance.now() - recapStart;

    return Response.json({ ok: true, latencies });
  } catch (err) {
    // Failures surface the error's name only; never a stack trace.
    return Response.json({ ok: false, error: err instanceof Error ? err.name : "UnknownError", latencies });
  }
}
