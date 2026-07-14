import { createAnthropic } from "@ai-sdk/anthropic";

export const anthropic = createAnthropic({}); // reads ANTHROPIC_API_KEY

export const MODELS = {
  extraction: "claude-haiku-4-5-20251001", // dated snapshot, guaranteed constant
  narrative: "claude-sonnet-5", // dateless ID IS the pinned snapshot
} as const;

export const THINKING_DISABLED = { anthropic: { thinking: { type: "disabled" as const } } };

export const CALL_LIMITS = {
  extraction: { maxOutputTokens: 1024, maxRetries: 1 },
  explanation: { maxOutputTokens: 2048, maxRetries: 1 },
  recap: { maxOutputTokens: 2048, maxRetries: 1 },
} as const;
