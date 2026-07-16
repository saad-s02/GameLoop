import { createAnthropic } from "@ai-sdk/anthropic";

export const anthropic = createAnthropic({}); // reads ANTHROPIC_API_KEY

export const MODELS = {
  extraction: "claude-haiku-4-5-20251001", // dated snapshot, guaranteed constant
  narrative: "claude-sonnet-5", // dateless ID IS the pinned snapshot
} as const;

export const THINKING_DISABLED = { anthropic: { thinking: { type: "disabled" as const } } };

export const CALL_LIMITS = {
  // temperature 0: schema-constrained classification; reduces run-to-run variance at the
  // extraction boundary (the eval report's recorded follow-up, applied 2026-07-16).
  extraction: { maxOutputTokens: 1024, maxRetries: 1, temperature: 0 },
  explanation: { maxOutputTokens: 2048, maxRetries: 1 },
  recap: { maxOutputTokens: 2048, maxRetries: 1 },
} as const;
