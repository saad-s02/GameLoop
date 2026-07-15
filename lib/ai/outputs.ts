import { generateText, streamText, Output } from "ai";
import { GameMemory, GameMemorySchema, ExplainInput, ExplainInputSchema, MomentPackage, PlanRequest, PlanRequestSchema, SessionContext } from "../planning/schemas";
import { anthropic, CALL_LIMITS, MODELS, THINKING_DISABLED } from "./models";
import { EXPLANATION_SYSTEM, EXTRACTION_SYSTEM, RECAP_SYSTEM, REFINEMENT_SYSTEM, extractionPrompt, refinementPrompt, wrapUserData } from "./prompts";

export async function extractPlanRequest(text: string, opts: { signal?: AbortSignal } = {}): Promise<PlanRequest> {
  const r = await generateText({
    model: anthropic(MODELS.extraction),
    system: EXTRACTION_SYSTEM,
    prompt: extractionPrompt(text),
    output: Output.object({ schema: PlanRequestSchema }),
    abortSignal: opts.signal,
    ...CALL_LIMITS.extraction,
    // Haiku 4.5: no thinking parameter at all (omitting is the fast path)
  });
  return PlanRequestSchema.parse(r.output); // belt and braces: re-validate
}

/** Delta extraction for a follow-up message. Same schema as extraction, so the compiled grammar is a cache hit. */
export async function extractRefinement(text: string, opts: { signal?: AbortSignal } = {}): Promise<PlanRequest> {
  const r = await generateText({
    model: anthropic(MODELS.extraction),
    system: REFINEMENT_SYSTEM,
    prompt: refinementPrompt(text),
    output: Output.object({ schema: PlanRequestSchema }),
    abortSignal: opts.signal,
    ...CALL_LIMITS.extraction,
    // Haiku 4.5: no thinking parameter at all (omitting is the fast path)
  });
  return PlanRequestSchema.parse(r.output);
}

export async function explainPlanStream(input: ExplainInput, opts: { signal?: AbortSignal } = {}) {
  const safe = ExplainInputSchema.parse(input); // strict: throws if any game data leaked in
  const r = streamText({
    model: anthropic(MODELS.narrative),
    system: EXPLANATION_SYSTEM,
    prompt: `Explain this plan.\n${wrapUserData(JSON.stringify(safe))}`,
    providerOptions: THINKING_DISABLED,
    abortSignal: opts.signal,
    ...CALL_LIMITS.explanation,
  });
  return r.textStream;
}

export async function generateRecap(pkg: MomentPackage, session: SessionContext | null, opts: { signal?: AbortSignal } = {}): Promise<GameMemory> {
  const r = await generateText({
    model: anthropic(MODELS.narrative),
    system: RECAP_SYSTEM,
    prompt: `Write the Personal Game Memory.\n${wrapUserData(JSON.stringify({ package: pkg, session }))}`,
    output: Output.object({ schema: GameMemorySchema }),
    providerOptions: THINKING_DISABLED,
    abortSignal: opts.signal,
    ...CALL_LIMITS.recap,
  });
  const memory = GameMemorySchema.parse(r.output);
  if (memory.scoreLine !== pkg.scoreLine) throw new Error("recap scoreLine mismatch"); // caller falls back
  if (!session) delete (memory as { yourNight?: string }).yourNight; // server-side strip
  const ids = new Set(pkg.moments.map(m => m.id));
  if (memory.momentBlurbs.some(b => !ids.has(b.momentId))) throw new Error("recap references unknown moment");
  return memory;
}
