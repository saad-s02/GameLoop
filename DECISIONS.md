# DECISIONS.md: architecture decision records

## ADR-001: Bounded orchestration over an open ReAct loop

Decision: the model gets two jobs only, translate natural language into a validated constraint contract, and translate verified planner output into natural language. Code decides feasibility, arithmetic, ranking, and memory writes.

Cost stated explicitly: requests outside the eight constraint types or five disruptions get a scoped refusal, not a dynamic response. Acceptable for a closed-world venue domain, wrong for an open-ended product.

Why not template the explanation instead: the violation and trade-off space is combinatorial across eight constraint types and four priority tiers, one flexible prompt beats a template forest.

Status: accepted (PRD v1.0, spec section 14). Date: 2026-07-14.

## ADR-003: Test and script tooling dev dependencies

Decision: add tsx 4.20.3 (TS script runner for scripts/ and evals/), @testing-library/react 16.3.0 and jsdom 26.1.0 (the two component tests required by the PRD test plan). No other new dependencies without a new ADR.

Status: accepted. Date: 2026-07-14.
