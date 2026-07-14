# Phase 0 Verification, Agent 4: npm package versions and AI SDK API surface

Verified 2026-07-13 (Monday evening) by direct command execution and same-day doc fetches. Local build machine: Node v22.17.0, npm 10.9.2 (from `node --version` and `npm --version`).

## Pinned-versions table

All versions resolved via `npm view <pkg> version` on 2026-07-13. These are the `latest` dist-tag values that a fresh install of `<pkg>@latest` would resolve today.

| Package | Exact version | Evidence command |
|---|---|---|
| next | 16.2.10 | `npm view next version` |
| ai | 7.0.26 | `npm view ai version` |
| @ai-sdk/anthropic | 4.0.14 | `npm view @ai-sdk/anthropic version` |
| @anthropic-ai/sdk | 0.111.0 | `npm view @anthropic-ai/sdk version` |
| zod | 4.4.3 | `npm view zod version` |
| vitest | 4.1.10 | `npm view vitest version` |
| @playwright/test | 1.61.1 | `npm view @playwright/test version` |
| tailwindcss | 4.3.2 | `npm view tailwindcss version` |
| create-next-app | 16.2.10 | `npm view create-next-app version` |

`npm view next dist-tags` (full picture): `latest: 16.2.10`, `canary: 16.3.0-canary.85`, `preview: 16.3.0-preview.6`, `backport: 15.5.20`, plus historical tags (`next-15-3: 15.3.9`, `next-14: 14.2.35`, etc.). The `beta` tag is a stale `16.0.0-beta.0`; `latest` is unambiguously a 16.x stable.

`npm view ai dist-tags` (relevant entries): `latest: 7.0.26`, `ai-v6: 6.0.225`, `ai-v5: 5.0.212`, `beta: 7.0.0-beta.187`. `ai@latest` resolves to major 7, so per the PRD rule "pin the resolved major," the pinned major is **7**.

`npm view @ai-sdk/anthropic dist-tags`: `latest: 4.0.14`, `ai-v6: 3.0.96`, `ai-v5: 2.0.85`. The provider major that pairs with ai v7 is **4.x** (confirmed by matching internals: `ai@7.0.26` depends on `@ai-sdk/provider@4.0.3` and `@ai-sdk/provider-utils@5.0.9`, and `@ai-sdk/anthropic@4.0.14` depends on the same `@ai-sdk/provider@4.0.3` and `@ai-sdk/provider-utils@5.0.9`).

## Verdicts on PRD claims

### PRD 11 / 0.9: "Next.js 16 (current stable; scaffold with npx create-next-app@latest)"

**CONFIRMED.** `npm view next version` returns 16.2.10 and the `latest` dist-tag is 16.2.10. `create-next-app@latest` is 16.2.10, so `npx create-next-app@latest` scaffolds Next 16.2.10. Commit the lockfile as the PRD says; the canary/preview line is already 16.3, so an unpinned re-install weeks later could drift within 16.x (patch/minor only, low risk for a 3-day build).

### PRD 7 / 11: "AI SDK latest + Anthropic provider" for streaming transport

**CONFIRMED with ADJUSTMENT.** The AI SDK still handles streaming transport with a first-party Anthropic provider, so the architecture holds. But `ai@latest` is now **major 7**, and the v6/v7 API surface differs from the v4/v5-era patterns most training data contains. The specific deltas are listed in the next section and should be codified in CLAUDE.md so Claude Code does not emit stale API calls.

- Provider package name: **CONFIRMED** as `@ai-sdk/anthropic`. Docs (https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) quote: install via `pnpm add @ai-sdk/anthropic`, then `import { anthropic } from '@ai-sdk/anthropic';` and `const model = anthropic('claude-3-haiku-20240307');`. Custom config uses `import { createAnthropic } from '@ai-sdk/anthropic';`.

### PRD 11: Zod compatibility

**CONFIRMED.** `npm view ai@7.0.26 peerDependencies` returns `{ zod: '^3.25.76 || ^4.1.8' }` and `@ai-sdk/anthropic@4.0.14` has the identical peer range. `zod@latest` is 4.4.3, which satisfies `^4.1.8`. No conflict.

### PRD 7: model routing (Haiku 4.5 / Sonnet 5)

**UNVERIFIED (risk note, model IDs are outside this agent's npm scope).** The Anthropic provider docs page fetched today lists example model IDs `claude-haiku-4-5`, `claude-sonnet-4-6`, and `claude-sonnet-4-5-20250929`; the fetched page content did not surface a "Sonnet 5" ID string. This does not contradict the PRD (the provider passes through any valid model ID string), but it reinforces the PRD's own instruction: pin exact model IDs in `lib/ai/models.ts` only after confirming strings at docs.claude.com. Defer to the agent covering the Anthropic model catalog.

## AI SDK v7 API surface (the names to build against)

All quotes fetched 2026-07-13 from ai-sdk.dev, which banners "AI SDK 7 is now available."

**Streaming text.** Function: `streamText`, `import { streamText } from 'ai'`.
Doc quote (https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text): "Streams text generations from a language model."
Consumption: `textStream` is an `AsyncIterableStream<string>`; the full event stream property is `stream` typed `AsyncIterable<TextStreamPart<TOOLS>> & ReadableStream<TextStreamPart<TOOLS>>`. Note: **`fullStream` was renamed to `stream` in v7.** Migration guide quote (https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0): "The full event stream returned by `streamText` has been renamed from `fullStream` to `stream`".

**Structured object generation (this is the big change).** `generateObject` and `streamObject` are deprecated. Migration guide 6.0 quote (https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0): "`generateObject` and `streamObject` have been deprecated (PR #10754). They will be removed in a future version." and "Use `generateText` and `streamText` with an `output` setting instead."
The current documented pattern (https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data): "The AI SDK standardises structured object generation across model providers using the `output` property on `generateText` and `streamText`."

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model: anthropic('<pinned-model-id>'),
  output: Output.object({
    schema: z.object({ name: z.string(), age: z.number().nullable() }),
  }),
  prompt: '...',
});
```

Doc quote for `Output.object` (https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object, which now documents the Output API): "Output specification for typed object generation using schemas. The output is validated against the provided schema to ensure type safety." Schema parameter type: `FlexibleSchema<OBJECT>`; Zod schemas are accepted directly ("You can use Zod schemas, Valibot, or JSON schemas to specify the shape of the data that you want").

**Streaming structured output.** Structured data guide quote: "With `streamText` and `output`, you can stream the model's structured response as it is generated." The streaming result exposes `partialOutputStream` (replaces v5's `partialObjectStream`) for incomplete objects and `elementStream` for completed, validated array elements.

**Returning a stream from a Next.js route handler.** The `streamText` result still exposes `toUIMessageStreamResponse: (options?: ResponseInit & UIMessageStreamOptions) => Response` and `toTextStreamResponse: (init?: ResponseInit) => Response` in the v7 reference. However, migration guide 7.0 states: "The `toUIMessageStream`, `toUIMessageStreamResponse`... methods on the `streamText` result are now deprecated" in favor of stateless alternatives imported directly from `'ai'`. They work in v7 (deprecated, not removed). For GameLoop this is low-stakes: the PRD's Decision Log uses a hand-written TraceEvent stream, and the model-facing streaming can consume `textStream` or `stream` directly inside that custom SSE route. If the result-method helpers are used, expect deprecation warnings, not breakage.

### Breaking-change risk summary vs PRD assumptions

- **ADJUSTMENT:** the PRD's "structured extraction (model)" and "structured recap (model)" steps must be written as `generateText` + `Output.object({ schema })` (or `streamText` + `output` with `partialOutputStream`), not `generateObject`/`streamObject`. The old names are deprecated in v6+ and slated for removal; more importantly, code generated from stale training data will mix eras. Put the v7 names in CLAUDE.md.
- **ADJUSTMENT:** `ai@7` is ESM-only. Migration guide 7.0 quote: "All AI SDK packages are now ESM-only. The `require()` function is no longer supported." Fine for Next 16 App Router and Vitest 4, but any CommonJS eval-runner script must be ESM (`.mts` or `"type": "module"`).
- No BLOCKER: streaming transport with the Anthropic provider is fully supported in v7, which is what the PRD architecture actually depends on.

## Node.js and peer-dependency notes

Engines, via `npm view <pkg> engines`:

| Package | engines.node |
|---|---|
| ai@7.0.26 | `>=22` |
| @ai-sdk/anthropic@4.0.14 | `>=22` |
| next@16.2.10 | `>=20.9.0` |
| vitest@4.1.10 | `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` |
| @playwright/test@1.61.1 | `>=18` |
| zod@4.4.3 | (none declared) |
| tailwindcss@4.3.2 | (none declared) |
| @anthropic-ai/sdk@0.111.0 | (none declared) |

Migration guide 7.0 quote: "AI SDK 7.0 requires Node.js 22 or later" and "Node.js 18 and 20 are no longer supported."

- **Build machine:** Node v22.17.0, npm 10.9.2. Satisfies every constraint, including the strictest (`ai` at `>=22`). No action needed locally.
- **Deployment note:** ensure the Vercel project's Node.js runtime is set to 22.x (Vercel default for new projects is currently 22, but verify in project settings since `ai@7` hard-requires it).
- **Peer conflicts:** none found. `next@16.2.10` peers accept `react ^18.2.0 || ^19.0.0` (create-next-app 16 scaffolds React 19) and optionally `@playwright/test ^1.51.1` (1.61.1 satisfies). `vitest@4.1.10` peers (`vite ^6 || ^7 || ^8`, `@types/node ^20 || ^22 || >=24`) are all optional/satisfiable. The single zod range `^3.25.76 || ^4.1.8` shared by `ai` and `@ai-sdk/anthropic` is met by zod 4.4.3.
- `@anthropic-ai/sdk` (0.111.0) is only needed if calling the Anthropic API directly without the AI SDK; with `ai` + `@ai-sdk/anthropic` it is redundant for this build. No conflict either way.

## Recommended pins for package.json (evidence-backed, install-time decision left to the team)

next 16.2.10, ai 7.0.26, @ai-sdk/anthropic 4.0.14, zod 4.4.3, vitest 4.1.10, @playwright/test 1.61.1, tailwindcss 4.3.2, Node 22.x runtime.
