# GameLoop conventions

## Subagent model policy

Choose the subagent model by task type, not by default:

- **Research** (web/docs verification, API exploration, data gathering, claim checking): `sonnet`
- **Code implementation** (writing features, tests, fixes from a clear spec): `sonnet`
- **Work that needs a model stronger than Sonnet** (hard debugging, subtle correctness review, complex synthesis): `opus`
- **Intense planning and architecture** (system design, phase plans, trade-off decisions): `fable` (main thread or fork)

When dispatching via the Agent tool, pass the `model` parameter explicitly per this policy.

## Project conventions (from PRD, applies once build starts)

- Next.js 16 App Router, TS strict. No new deps without a DECISIONS.md entry.
- Deterministic core (lib/planning, lib/games) is TDD: tests first, exact fixtures.
- Model prompts and schemas (lib/ai) are hand-reviewed; never auto-merged.
- All time math in normalized minutes from event start. Never compare time strings.
- Every external value carries a provenance field. UI must render it.
- Plan mode before any multi-file change. Only touch files named in the plan.
- Zod at every boundary: requests, tool results, memory, model outputs.
- Never commit raw NHL payloads or secrets (research/raw/ is gitignored). Fixtures are reduced JSON only.
- Write all documents in plain prose without em dashes.
