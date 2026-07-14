import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

let lastBody;
const anthropic = createAnthropic({
  fetch: async (url, init) => {
    lastBody = typeof init?.body === "string" ? init.body : undefined;
    return fetch(url, init);
  },
});

const disabled = { anthropic: { thinking: { type: "disabled" } } };

// (a) thinking-disable key path
const t0 = Date.now();
await generateText({
  model: anthropic("claude-sonnet-5"),
  prompt: "Reply with the single word OK.",
  maxOutputTokens: 64,
  maxRetries: 1,
  providerOptions: disabled,
});
const body1 = JSON.parse(lastBody);
console.log("(a) latency ms:", Date.now() - t0);
console.log("(a) thinking in request body:", JSON.stringify(body1.thinking ?? "ABSENT"));
console.log("(a) max_tokens in body:", body1.max_tokens);

// (b) + (c) Output.object mechanism and zod 4 round-trip
const schema = z.object({
  items: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), n: z.number() }),
    z.object({ kind: z.literal("b"), s: z.string(), opt: z.string().optional() }),
  ])),
});
const t1 = Date.now();
const r2 = await generateText({
  model: anthropic("claude-sonnet-5"),
  output: Output.object({ schema }),
  prompt: 'Return items: one kind a with n 1, then one kind b with s "x" and no opt.',
  maxOutputTokens: 256,
  maxRetries: 1,
  providerOptions: disabled,
});
const body2 = JSON.parse(lastBody);
console.log("(b) latency ms:", Date.now() - t1);
console.log(
  "(b) mechanism:",
  body2.output_config ? "native output_config" : body2.tools?.length ? "forced-tool emulation" : "UNKNOWN, inspect body",
);
console.log("(b) output_config:", JSON.stringify(body2.output_config ?? null)?.slice(0, 200));
console.log("(b) tool_choice:", JSON.stringify(body2.tool_choice ?? null));
console.log("(b) thinking on structured call:", JSON.stringify(body2.thinking ?? "ABSENT"));
console.log("(c) parsed output:", JSON.stringify(r2.output));
console.log("(c) zod re-parse ok:", schema.safeParse(r2.output).success);
