# Phase 0 Verification: Anthropic Model IDs, Pricing, and API Capabilities

**Agent 3, adversarial verification swarm. Verified: Monday, July 13, 2026 (evening).**
All evidence fetched today from primary documentation. Note on hosts: `docs.claude.com` returns a `301 Moved Permanently` to `platform.claude.com`; the canonical documentation host is now `platform.claude.com`. All URLs below are the canonical form.

---

## Verdict table

| # | PRD claim (Sections 7 and 9) | Verdict | Evidence (URL and quoted line) |
|---|---|---|---|
| 1 | "Haiku 4.5 is $1/$5 per MTok" | **CONFIRMED** | https://platform.claude.com/docs/en/about-claude/pricing.md: "\| Claude Haiku 4.5 \| $1 / MTok \| $1.25 / MTok \| $2 / MTok \| $0.10 / MTok \| $5 / MTok \|" |
| 2 | "Sonnet 4.6 $3/$15" | **CONFIRMED** | https://platform.claude.com/docs/en/about-claude/pricing.md: "\| Claude Sonnet 4.6 \| $3 / MTok \| $3.75 / MTok \| $6 / MTok \| $0.30 / MTok \| $15 / MTok \|" |
| 3 | "Sonnet 5 launched June 30, 2026 at introductory $2/$10 through August 31" | **CONFIRMED** | https://platform.claude.com/docs/en/release-notes/api.md, entry dated **June 30, 2026**: "We've launched **Claude Sonnet 5** (`claude-sonnet-5`), the next generation of our Sonnet model family, at introductory pricing of $2 / $10 per MTok through August 31, 2026 (standard $3 / $15 thereafter)." Corroborated by https://platform.claude.com/docs/en/about-claude/pricing.md: "Introductory pricing of $2/$10 per million input/output tokens is in effect through August 31, 2026, after which the standard pricing of $3/$15 per million input/output tokens will take effect." |
| 4 | "Pin exact model IDs in `lib/ai/models.ts` after confirming strings at docs.claude.com" (IDs are confirmable) | **CONFIRMED** (with host note) | https://platform.claude.com/docs/en/about-claude/models/overview.md, Latest models comparison table: Claude API ID for Sonnet 5 is "claude-sonnet-5"; Claude API ID for Haiku 4.5 is "claude-haiku-4-5-20251001", alias "claude-haiku-4-5". Note: docs.claude.com now 301-redirects to platform.claude.com. |
| 5 | Haiku 4.5 supports tool use and structured outputs ("Use strict tool/output schemas") | **CONFIRMED** | Tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md pricing table row: "\| Claude Haiku 4.5 \| `auto`, `none` ... `any`, `tool` \| 496 tokens ... 588 tokens \|". Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md lists Claude Haiku 4.5 as generally available on the Claude API. |
| 6 | Sonnet 5 supports tool use and structured outputs | **CONFIRMED** | Tool use: same tool-use pricing table row: "\| Claude Sonnet 5 \| `auto`, `none` ... `any`, `tool` \| 354 tokens ... 474 tokens \|". Release note (June 30, 2026): "Claude Sonnet 5 supports a 1M token context window, 128k max output tokens, and the same set of tools and platform features as Claude Sonnet 4.6, except Priority Tier". Structured outputs: structured-outputs.md lists Claude Sonnet 5 as generally available. |
| 7 | "Full demo plus testing lands under $5 on any routing" | **UNVERIFIED** (cost projection, not a documentation fact) | Risk note: the per-token rates that feed this arithmetic are all confirmed above, and at intro pricing $5 buys 2.5M Sonnet 5 input tokens or 500K output tokens, so the projection has enormous headroom at interview scale. Caveat: Sonnet 5 uses a new tokenizer that "produces approximately 30% more tokens for the same text" (pricing.md), so token estimates carried over from older models undercount slightly. Still nowhere near $5 for a 3-evening build. |

**Flags: no BLOCKER findings. Three ADJUSTMENT findings, listed at the bottom.**

---

## 1. Pinned model IDs

Source: https://platform.claude.com/docs/en/about-claude/models/overview.md and https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions.md

### Claude Haiku 4.5 (pre-4.6 naming generation: dated snapshot plus alias)

| Form | String | Doc line |
|---|---|---|
| Full pinned ID | `claude-haiku-4-5-20251001` | Models overview table: "**Claude API ID** ... claude-haiku-4-5-20251001" |
| Alias | `claude-haiku-4-5` | Models overview table: "**Claude API alias** ... claude-haiku-4-5" |

The versioning page explains the alias semantics: "On the Claude API, these models also have shorter aliases (for example, `claude-sonnet-4-5`) that point to the most recent dated snapshot for that minor version." And: "This guarantee covers model IDs, not the convenience aliases that the Claude API accepts for some earlier models."

**Recommendation for production pinning: use the dated snapshot `claude-haiku-4-5-20251001`** in `lib/ai/models.ts`, since only the dated ID carries the "underlying model remains constant" guarantee for the pre-4.6 generation. For a 3-day demo the alias is fine in practice, but the dated ID costs nothing and removes the ambiguity.

### Claude Sonnet 5 (the model the PRD calls "Sonnet 5"; 4.6-generation-and-later naming)

| Form | String | Doc line |
|---|---|---|
| Canonical pinned ID (dateless) | `claude-sonnet-5` | Models overview table: "**Claude API ID** ... claude-sonnet-5" (ID and alias columns are identical) |

There is **no dated snapshot ID** for Sonnet 5, and the dateless ID is not an evergreen pointer. Quoting model-ids-and-versions.md: "A common misconception is that dateless model IDs such as `claude-sonnet-4-6` behave as evergreen pointers that route to the latest or best-performing version. That is not the case. For the 4.6 generation and later, the dateless ID is the canonical model ID for that release. It maps to a single, fixed model snapshot. Anthropic does not update the weights or configuration of an existing model ID. When an updated version is available, it ships under a new model ID."

**Recommendation: pin `claude-sonnet-5` exactly as written.** It is itself the snapshot. Never append a date suffix (a constructed ID like `claude-sonnet-5-20260630` would 404).

Suggested `lib/ai/models.ts` values:

```ts
export const MODELS = {
  extraction: "claude-haiku-4-5-20251001", // dated snapshot, guaranteed constant
  narrative: "claude-sonnet-5",            // dateless ID IS the pinned snapshot
} as const;
```

---

## 2. Capability confirmation: tool use and structured outputs

### Tool use (both models)

Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md

- Tool definitions use `name`, `description`, and **`input_schema`** (JSON Schema). Doc example: `"name": "get_weather", "description": "Get the current weather for a given location.", "input_schema": {"type": "object", "properties": {...}, "required": ["location"]}`.
- Client tools return `stop_reason: "tool_use"` with `tool_use` blocks; you reply with `tool_result` blocks. Doc line: "**Client tools** (including user-defined tools and tools with Anthropic-defined schemas, such as `bash` and `text_editor`) run in your application. Claude responds with `stop_reason: \"tool_use\"` and one or more `tool_use` blocks."
- **Forced tool choice** exists: default is `tool_choice: {"type": "auto"}`; "To require a tool call rather than rely on prompting, set `tool_choice`" (options include `{"type": "any"}` and `{"type": "tool", "name": ...}`; `disable_parallel_tool_use: true` limits to one call per turn, shown in the doc's own example).
- Both models appear in the per-model "Tool use system prompt token count" table (Sonnet 5: 354 to 474 tokens; Haiku 4.5: 496 to 588 tokens), which only lists tool-use-capable models.
- The June 30 release note states Sonnet 5 supports "the same set of tools and platform features as Claude Sonnet 4.6, except Priority Tier."

### Structured outputs (both models)

Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md

- Two distinct mechanisms, both GA (no beta header):
  - **JSON outputs**: `output_config.format` with `{"type": "json_schema", "schema": {...}}`. Doc line: "**JSON outputs** (`output_config.format`): Get Claude's response in a specific JSON format."
  - **Strict tool use**: `strict: true` on the tool definition. Doc line: "**Strict tool use** (`strict: true`): Guarantee schema validation on tool names and inputs." Also from tool-use overview: "Add `strict: true` to your custom tool definitions to ensure Claude's tool calls always match your schema exactly."
- Supported models list explicitly includes **Claude Sonnet 5** and **Claude Haiku 4.5** on the Claude API.
- Naming drift warning for the build: the old top-level `output_format` parameter is deprecated. Doc line: "The `output_format` parameter has moved to `output_config.format`, and beta headers are no longer required. The old beta header (`structured-outputs-2025-11-13`) and `output_format` parameter will continue working for a transition period." Use `output_config.format` in new code. (Relevant if the AI SDK's Anthropic provider still emits the old parameter; verify at integration time.)
- Assistant prefill is **not** a viable alternative on current models: https://platform.claude.com/docs/en/api/errors.md: "Prefilling assistant messages is not supported for this model." (400 on Sonnet 4.6-generation and later; Haiku 4.5 still allows it, but do not rely on it.)

### Schema latency note (feeds the 12s budget)

structured-outputs.md: "**First request latency:** The first time you use a specific schema, there is additional latency while the grammar compiles" and "**Automatic caching:** Compiled grammars are cached for 24 hours from last use, making subsequent requests much faster." Practical consequence: **warm both schemas (PlanRequest extraction and recap) with one throwaway request before the demo** so grammar compilation never lands inside the live 12-second window. Also note: "Changing the `output_config.format` parameter will invalidate any prompt cache for that conversation thread."

---

## 3. Pricing (verified today)

Source: https://platform.claude.com/docs/en/about-claude/pricing.md (all rows quoted from the Model pricing table)

| Model | Input / MTok | Output / MTok | Cache write 5m | Cache hit | Batch (50% off) |
|---|---|---|---|---|---|
| Claude Haiku 4.5 | $1 | $5 | $1.25 | $0.10 | $0.50 / $2.50 |
| Claude Sonnet 5 (through Aug 31, 2026) | $2 | $10 | $2.50 | $0.20 | $1 / $5 |
| Claude Sonnet 5 (starting Sep 1, 2026) | $3 | $15 | $3.75 | $0.30 | $1.50 / $7.50 |
| Claude Sonnet 4.6 | $3 | $15 | $3.75 | $0.30 | $1.50 / $7.50 |

Introductory pricing end date, quoted from the pricing page note: "Introductory pricing of $2/$10 per million input/output tokens is in effect through August 31, 2026, after which the standard pricing of $3/$15 per million input/output tokens will take effect."

Launch date, quoted from https://platform.claude.com/docs/en/release-notes/api.md under the heading "### June 30, 2026": "We've launched **Claude Sonnet 5** (`claude-sonnet-5`), the next generation of our Sonnet model family, at introductory pricing of $2 / $10 per MTok through August 31, 2026 (standard $3 / $15 thereafter)."

Tokenizer caveat affecting cost math and the PRD's `estimateTokens(reducedPayload) < 4000` assertion: pricing.md: "Claude Opus 4.7 and later Opus models, Claude Fable 5, Claude Mythos 5, Claude Mythos Preview, and Claude Sonnet 5 use a newer tokenizer ... This tokenizer produces approximately 30% more tokens for the same text. ... Claude Sonnet 4.6 and earlier models use the previous tokenizer." Haiku 4.5 uses the older tokenizer; Sonnet 5 uses the new one, so the same reduced payload costs ~30% more tokens on Sonnet 5 than a Haiku-calibrated estimate suggests.

---

## 4. Latency guidance relevant to the 12-second seeded-path budget

### max_tokens: no default, hard cap, streaming thresholds

- `max_tokens` is a required Messages API parameter; there is no documented server-side default. It is a hard cap on total output including thinking: adaptive-thinking docs: "Use `max_tokens` as a hard limit on total output (thinking + response text)." Model maximums today: Sonnet 5 "Max output: 128k tokens"; Haiku 4.5 "Max output: 64k tokens" (models overview).
- For GameLoop's short structured outputs, set small explicit values (extraction ~1-2K, explanation/recap ~2-4K). Small `max_tokens` also keeps you clear of every timeout class below.

### Streaming recommendations and timeout behavior

Source: https://platform.claude.com/docs/en/api/errors.md and https://platform.claude.com/docs/en/build-with-claude/streaming.md

- "Consider using the streaming Messages API or Message Batches API for long running requests, especially those over 10 minutes."
- "Avoid setting a large `max_tokens` value without using the streaming Messages API or Message Batches API: Some networks may drop idle connections after a variable period of time, which can cause the request to fail or timeout without receiving a response from Anthropic."
- "The SDKs validate that your non-streaming Messages API requests are not expected to exceed a 10-minute timeout. They also set a socket option for TCP keep-alive."
- 504 exists as a server-side outcome: "504 - `timeout_error`: The request timed out while processing. Consider using streaming for long-running requests."
- Streaming page: "This is especially useful for requests with large `max_tokens` values, where the SDKs require streaming to avoid HTTP timeouts."
- **Retry interaction with the 12s budget:** errors.md: "The official SDKs automatically retry transient failures (such as connection errors, rate limits, and 5xx server errors) with exponential backoff, twice by default, honoring the `retry-after` header when present." Two automatic retries with backoff can silently blow a 12s budget. For the demo path, set `max_retries` to 0 or 1 on the client (or rely on the PRD's AbortSignal propagation plus the seeded fallback) so a transient 529 degrades to the fallback within budget instead of stalling.

### Thinking defaults (the largest hidden latency lever)

Source: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking.md

- **Sonnet 5 thinks by default.** "Claude Sonnet 5 (claude-sonnet-5), adaptive thinking is on by default; pass `thinking: {type: \"disabled\"}` to turn it off. Manual `{type: \"enabled\"}` is rejected with a 400 error." And from the mode table: Disabled is "When you don't need extended thinking and want the lowest latency."
- **Effort defaults to high on Sonnet 5.** Models overview: "On Claude Sonnet 5, it defaults to `high` on the Claude API and Claude Code. Set `effort` explicitly to use a different level." At `high`, "Claude almost always thinks."
- **Haiku 4.5 does not support adaptive thinking** (models overview: Adaptive thinking "No", Extended thinking "Yes"). Omitting the `thinking` parameter on Haiku 4.5 means no thinking at all, which is the fast path the extraction step wants. Comparative latency rows: Haiku 4.5 "Fastest", Sonnet 5 "Fast".
- **Thinking display and time-to-first-token:** on Sonnet 5, `thinking.display` defaults to `"omitted"`. Adaptive-thinking docs: "Setting `display: \"omitted\"` is useful when your application doesn't surface thinking content to users. The primary benefit is **faster time-to-first-text-token when streaming:** The server skips streaming thinking tokens entirely and delivers only the signature." The default already favors GameLoop (the Decision Log deliberately shows no model thinking).
- Prompt-based tuning is documented: appending guidance such as "Extended thinking adds latency and should only be used when it will meaningfully improve answer quality" reduces thinking frequency, but the deterministic levers (disabled, or adaptive plus `output_config: {effort: "low"|"medium"}`) are the reliable ones for a demo.

### Concrete budget recommendation for GameLoop

- Extraction (Haiku 4.5): no `thinking` parameter, `strict: true` tool schema or `output_config.format`, `max_tokens` ~1024, stream. Well inside the 4s contract target.
- Explanation and recap (Sonnet 5): explicitly set either `thinking: {type: "disabled"}` or `thinking: {type: "adaptive"}` plus `output_config: {effort: "low"}` (measure both against quality), `max_tokens` 2-4K, stream, warm the JSON schema before the demo. Leaving the defaults (adaptive on, effort high) is the single most likely way to breach 12 seconds.

---

## 5. ADJUSTMENT flags (nothing invalidates the PRD; these tighten it)

1. **ADJUSTMENT: Sonnet 5 defaults are latency-hostile to the 12s budget.** Adaptive thinking is on by default and `effort` defaults to `high` on the Claude API. The PRD's latency budget (Section 7) never mentions thinking configuration. Add to `lib/ai/models.ts` or the prompt config: explicit `thinking: {type: "disabled"}` or `effort: "low"/"medium"` for the plan-explanation and recap calls, and warm the structured-output schemas once at deploy time (first-use grammar compilation adds latency; compiled grammars cache for 24 hours).
2. **ADJUSTMENT: Sonnet 5's new tokenizer produces ~30% more tokens for the same text than Sonnet 4.6 and Haiku 4.5.** The PRD's `estimateTokens(reducedPayload) < 4000` test and any cost math should baseline against the Sonnet 5 tokenizer (use the `count_tokens` endpoint with `model: "claude-sonnet-5"`), or the same payload will undercount on the narrative model. Cost impact at demo scale is trivial; the test assertion is the real exposure.
3. **ADJUSTMENT (wording only): `docs.claude.com` 301-redirects to `platform.claude.com`.** PRD Sections 7 and 9 say "verify at docs.claude.com"; the redirect works, but /how-it-works or any committed reference should cite the canonical host. Also worth one line in DECISIONS.md: for Haiku 4.5 pin the dated snapshot `claude-haiku-4-5-20251001` (aliases are convenience pointers for pre-4.6 models); for Sonnet 5 the dateless `claude-sonnet-5` is itself the pinned snapshot. Minor related fact: Priority Tier is not available on Claude Sonnet 5 (June 30 release note); the PRD does not use Priority Tier, so no action.
