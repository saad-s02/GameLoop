# GameLoop

GameLoop is a demo of an adaptive game-day copilot: a fan describes their group and night out in plain language, and the app builds a step by step arrival, food, and seating plan for a game at Harbourview Arena, adjusting live as conditions change.

## Live demo

The app is deployed at [gameloop-gilt.vercel.app](https://gameloop-gilt.vercel.app). It sits behind a simple access code gate (`/enter`) backed by a signed cookie; there is no public signup flow. This is a personal demo project and the deployment may be taken down at any time.

## Key features

- **Constraint based planning.** Free text about a group (party size, kids, dietary needs, arrival time, budget) is extracted into a structured request and run through a deterministic planning core, not left to model improvisation.
- **Provenance on every external value.** Transit times, venue data, and game state are each tagged live, snapshot, or simulated, and the UI renders that tag next to the value it describes.
- **Disruption handling.** The planner reacts to injected disruptions (for example a transit delay) and produces a merged replan rather than starting over.
- **Conversational refinement.** The plan lives in a chat style workspace: users can answer inline clarifying questions (for example "how many adults and how many children?") and issue follow up refinements that merge into the existing plan.
- **Real nearby places.** A dietary aware "near the venue" card is backed by real place data rather than invented venues.
- **Session memory.** A memory panel tracks facts learned about the group across the conversation.

## Tech stack

- [Next.js](https://nextjs.org/) 16 (App Router) with React 19 and TypeScript in strict mode.
- [Vercel AI SDK](https://sdk.vercel.ai/) v7 (`ai` 7.0.26) with `@ai-sdk/anthropic` for model calls (Claude Haiku 4.5 for extraction, Claude Sonnet 5 for narration).
- [Zod](https://zod.dev/) 4 for schema validation at every boundary (requests, tool results, memory, model outputs).
- Tailwind CSS 4 for styling.
- [Vitest](https://vitest.dev/) for unit and component tests, [Playwright](https://playwright.dev/) for end to end smoke tests.

## Architecture

The deterministic planning core lives in `lib/planning` and `lib/games`: candidate generation, disruption handling, merging, scoring, and summarization all run as plain TypeScript with no model in the loop. AI is used only at the edges, in `lib/ai`: one call extracts a structured plan request from free text (Claude Haiku), and another narrates the plan in prose (Claude Sonnet, thinking disabled for latency). `lib/trace` streams the planner's reasoning to the client over Server-Sent Events so the UI can show the decision log as it happens. Zod schemas validate every boundary crossing, from the incoming request through model output to what the client renders.

## Getting started

Install dependencies:

```bash
npm install
```

Create a `.env.local` with the following variables:

```
ANTHROPIC_API_KEY=sk-ant-...
ACCESS_CODE=<code used to unlock /enter>
ACCESS_COOKIE_SECRET=<secret used to sign the access cookie>
```

Run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Testing

- `npm test` runs the Vitest suite (`lib/**/*.test.ts` and `components/**/*.test.tsx`), covering the planning core, games/moments engine, chat turn logic, data adapters, and key components.
- `npm run smoke` runs the Playwright end to end suite (`e2e/*.spec.ts`) against a locally built and started app. The Playwright config spins up the app itself with a fixed `ACCESS_CODE` (`letmein`) and an intentionally invalid `ANTHROPIC_API_KEY`, so the scripted demo flows exercise the deterministic fallback paths and make zero live model calls.

## Project structure

```
app/          Next.js App Router routes: landing page, /enter (access gate),
              /plan (chat workspace), /how-it-works, and the API routes
              (/api/access, /api/plan, /api/warmup)
components/   React components for the chat workspace, itinerary timeline,
              constraints strip, reasoning disclosure, and related UI
lib/planning  Deterministic planning core: candidates, disruptions, merge,
              evaluate, summarize, time math, venue graph, schemas
lib/games     Game state client, normalization, and the moments (key play)
              scoring engine
lib/ai        Model layer: pinned model ids, structured output schemas,
              and prompts for extraction and narration
lib/trace     SSE event types and streaming helpers for the live decision log
lib/chat      Conversation turn state for the chat workspace
lib/data      Fixture and adapter data: showcase game, venue, transit
              snapshot, and real nearby places
lib/server    Access code cookie handling, recap helpers, and route logic
e2e/          Playwright smoke specs (scripted demo sequence and
              conversational flows)
```

## Known limitations and scope

This build supports a single flow: planning a night out for one showcase game at one venue. An earlier design (see `PRD.md`) also specified a second "Relive the Game" mode with a post-game recap experience; that mode was cut from the shipped app and no longer has any routes, though a few historical references remain in planning docs and a schema literal. Game data and venue overlays are a mix of real, snapshot, and simulated sources rather than live production feeds, and each value is labeled accordingly in the UI rather than presented as uniformly live.

## Status

This is a personal demo and portfolio project, not a maintained product. No license file is included.
