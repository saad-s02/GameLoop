# Agent 7: Adversarial Claim Sweep (Phase 0 Verification)

Scope: every factual/external claim in PRD.md not owned by Agents 1 to 6 (NHL payloads/Fixture A, Fixture B, Anthropic models/pricing, npm/AI SDK versions, Vercel platform specifics, GO Transit GTFS), plus all internal inconsistencies in the document. PRD read twice end to end before this sweep.

Verdict key: CONFIRMED, CORRECTED, UNVERIFIED (exactly one per claim, per the ground rules).

---

## Section A: Claims verdict table

| # | Claim (PRD location) | Verdict | Evidence pointer | Matters before Thursday |
|---|---|---|---|---|
| 1 | Sec 9: NHL endpoint characterized as "undocumented," "observed to be accessible without authentication," "not an officially supported developer API" | CONFIRMED | Community projects independently describe it the same way: github.com/dword4/nhlapi ("Documenting the publicly accessible portions of the NHL API"), github.com/Zmalski/NHL-API-Reference ("Unofficial reference for the NHL API endpoints"). No NHL-published developer portal or ToS found. Wording is hedged, does not claim authorization or endorsement, does not overclaim legality. | Yes (legal/compliance framing used verbatim on /how-it-works) |
| 2 | Sec 6.4: localStorage "persistence across sessions" (implicit assumption behind 7-day expiry design) | CONFIRMED | MDN, developer.mozilla.org/en-US/docs/Web/API/Window/localStorage: "the stored data is saved across browser sessions." | Yes |
| 3 | Sec 6.4: localStorage is per-origin scoped | CONFIRMED | MDN: Storage object is for "the Document's origin"; also protocol-specific ("localStorage data is specific to the protocol of the document"). | Yes |
| 4 | Sec 6.4 (implicit): localStorage availability in private/incognito browsing | CONFIRMED (informational; PRD makes no explicit contrary claim) | MDN: "localStorage data for a document loaded in a 'private browsing' or 'incognito' session is cleared when the last 'private' tab is closed." Available during the session, wiped after — consistent with treating it as non-durable, untrusted state. | Low |
| 5 | Sec 6.4: "Client storage (localStorage) is treated as untrusted input and re-validated server-side" | CONFIRMED | Standard web security posture: localStorage is readable/writable by any script in the origin (including injected/XSS scripts) and trivially editable via DevTools, so "untrusted" is the correct framing. MDN documents no built-in integrity or access control beyond same-origin isolation. | Yes |
| 6 | Sec 6.4 (implicit): localStorage size limits | CONFIRMED — no explicit numeric limit claimed in the PRD. Typical per-origin quota (commonly several MB) vastly exceeds a `SessionContext` record's size, so no realistic overflow risk. | MDN localStorage page; PRD makes no numeric claim to check. | No |
| 7 | Sec 11: "native Web Share API where supported" for share output | CONFIRMED — correctly hedged, does not overclaim universal support | MDN developer.mozilla.org/en-US/docs/Web/API/Navigator/share: gated behind secure context (HTTPS) and user activation; MDN itself flags "This feature is not Baseline because it does not work in some of the most widely-used browsers." caniuse/web.dev: desktop Chrome support landed at Chrome 128 (Aug 2024) and is inconsistent across desktop platforms (a filed mdn/browser-compat-data issue is titled "not fully supported in desktop Chrome," citing Linux gaps); desktop Safari has supported it since Safari 12.1 (2019); Firefox desktop is behind a flag / unsupported by default. | Yes (used as the demo "closer" on a laptop; PRD's copy-text fallback correctly covers the gap) |
| 8 | Sec 11: html-to-image Safari risk noted, mitigation is "keep the card fully local (system fonts, no remote assets) and test Safari" | CONFIRMED — risk is real and the PRD's specific mitigation targets the right failure class | github.com/bubkoo/html-to-image issues #211, #348, #361, #461 ("Blank Image in Safari"), #488, #214 (SVG-embedded images fail in Safari), #147 (CORS-enabled remote images not rendered in Safari); a dedicated repro repo exists: github.com/urbancamo/html-to-image-safari-failure. Reported failure modes are specifically remote/CORS images, SVG-embedded images, and first-call-renders-blank — all avoided by "fully local, system fonts, no remote assets." | Yes for the cut-line feature specifically (already lowest priority in the cut order) |
| 9 | Sec 12: accessibility items (reduced-motion, focus management, aria-live/screen-reader announcements for streaming status, keyboard operability, semantic ordered list, contrast) are coherent and technically achievable | CONFIRMED — nothing listed is impossible | MDN developer.mozilla.org/.../prefers-reduced-motion: standard CSS media feature, Baseline "widely available... since January 2020." MDN ARIA live regions guide: "ARIA live regions... provide a way to programmatically expose dynamic content changes... announced by assistive technologies" — the standard mechanism for exactly the "streaming status" use case. | Yes |
| 10 | Sec 10: Maple Leafs missed the 2026 playoffs, finished last in the Atlantic | CONFIRMED | Live fetch of `https://api-web.nhle.com/v1/standings/2026-04-16` (HTTP 200): Toronto Maple Leafs, Atlantic divisionSequence 8 of 8, 78 points, 32-36-14, gamesPlayed 82 (full season), clinchIndicator "e" (eliminated). Corroborated by NHL.com: "Why Toronto Maple Leafs are eliminated from 2025-2026 postseason race." | Yes (embarrassment risk if wrong in the room) |
| 11 | Sec 10: "first miss since 2016" | CONFIRMED | NHL.com headline verbatim: "Maple Leafs miss playoffs for 1st time since 2016 due to Marner departure, defensive woes." Independent corroboration from Daily Faceoff, Yahoo Sports, nationaltoday.com all citing the same 2016 baseline (nine consecutive playoff appearances ending). | Yes |
| 12 | Sec 10: drafted Gavin McKenna first overall in June 2026 | CONFIRMED | NHL.com: "McKenna selected No. 1 by Maple Leafs in 2026 NHL Draft" and "McKenna arrives in Toronto after being No. 1 pick in 2026 NHL Draft." Held at KeyBank Center, Buffalo (same venue as the 2016 draft that produced Auston Matthews — a nice, verified callback if it comes up). | Yes |
| 13 | Header + Sec 14/15: "Thursday July 16, 2026" for the interview | CONFIRMED | `node -e "new Date('2026-07-16T12:00:00').getUTCDay()"` → Thursday. Also confirmed 2026-07-13 = Monday, 2026-07-15 = Wednesday, matching the "build window" framing. | Yes |
| 14 | Sec header: "Build window: Monday evening July 13 to Wednesday night July 15" | CONFIRMED | Same calendar computation as #13; Mon→Wed precedes the Thursday demo with no gap or overlap error. | Yes |
| 15 | Sec 6.1: scoring formula (`hardConstraintsSatisfied*1000 + high*100 + medium*20 + low*5 - walkingMinutes*0.5 - estimatedWaitMinutes - budgetOveragePenalty`) is internally consistent (tiers dominate in order) | CONFIRMED, with one design note | Tier spacing (1000/100/20/5) gives each tier enough headroom that no plausible combination of lower tiers can overturn a higher-tier difference (e.g., even 8 satisfied high-priority constraints = 800 < 1000, one hard constraint). Soft penalty terms (walking minutes, wait minutes) are small relative to tier gaps by construction. Design note (not a bug): since "any hard-constraint violation marks a candidate infeasible" already filters candidates before scoring, `hardConstraintsSatisfied` is likely constant across the surviving candidate set and contributes no differentiation to the ranking — the term appears vestigial given the infeasibility filter. | No (harmless) |
| 16 | Sec 8: `estimateTokens(reducedPayload) < 4000` is a plausible test assertion | **UNVERIFIED — flagged at-risk** | I cannot measure Agent 1's actual committed Fixture A JSON (not yet in `research/raw/` at sweep time), so this is a plausibility estimate, not a measurement. I constructed a synthetic `NormalizedPlay[]` array shaped like Fixture A (9 goals, ~65 shots, ~10 penalties, 10 period markers for a 2OT game = 94 events, matching the PRD's own event-type list) plus a representative `ReducedBoxScore` (40 skaters) and serialized to JSON: 16,503 chars for the play array alone → ≈4,126 tokens at the standard "~4 chars/token" heuristic, and ≈4,999 tokens combined with the box score. That is at or over the 4000-token budget using only the fields the PRD itself defines, before accounting for real players' names/IDs (likely longer than my synthetic ones) or whether "shot" means shots-on-goal only or all shot attempts (which would raise the event count further). Fixture A is explicitly the highest-event "torture test" game, so it is the worst case for this assertion, not a typical one. Risk note: if Agent 1's actual reduced Fixture A payload lands near or above 4000 tokens, the Sec 8 test will need either a higher threshold, a smaller field set, or restricting the assertion to the moment package rather than the full normalized array (see Inconsistency #9 below on this exact ambiguity). | **Yes — blocks a Tuesday test assertion if it fails; verify against the real committed fixture before writing that test.** |
| 17 | Sec 6.1: primary demo prompt length vs the 1,000-char input cap (Sec 7) | CONFIRMED, large margin | `node -e` character count: primary demo prompt = 157 characters (≈15.7% of the cap). The Sec 13 eval-case input string is 60 characters. No risk of the cap ever being hit by seeded content. | No |
| 18 | 7-day expiry consistency between Sec 6.4 (`expiresAt: string; // 7 days`) and Sec 12 ("7-day expiry") | CONFIRMED | Both sections state 7 days; no numeric mismatch. | No |
| 19 | Sec 1: interviewer's "published engineering philosophy (plan-before-fetch retrieval, context managed with intent, smarter architecture over brute force)" | UNVERIFIED | A general web search surfaced a paraphrase attributed to Sandra Leon describing a four-pattern framework ("cache, plan, compress, constrain") and a "smarter architecture, not more GPUs" framing that would substantiate this claim closely — but a follow-up targeted search could not pin a single citable primary-source URL/quote for it, so per the evidence bar (URL + exact quoted line) this stays UNVERIFIED rather than CONFIRMED. There is a real lead here, just not one I could nail down cheaply. | Yes for rapport framing, but low downside if dropped — it's a talking point, not a functional claim, and easy to soften in the room ("this is how I read your public writing") if pressed. |
| 20 | Sec: interviewer identity, "Sandra Leon (VP Software Engineering & AI)," MLSE | CONFIRMED | ZoomInfo and LinkedIn independently list "Sandra Leon... AI Vice President, Software Engineering at MLSE," Toronto — title and org match the PRD exactly. | Yes |
| 21 | Timing budgets internally consistent across Sec 2, Sec 7, Sec 12 (12s plan / 8s replan / 15s recap / 750ms first event / 4s contract / 20s live and fallback) | CONFIRMED, with one clarity note | 12s (plan) and 8s (replan) appear identically in Sec 2 and Sec 12. Sec 7's "hard request timeout 30s" comfortably bounds Sec 12's 20s live/fallback ceilings. No numeric contradiction found. Clarity note: Sec 7's "per-external-tool timeout 4s" and Sec 12's "constraint contract under 4s" are different quantities (a tool timeout vs. a pipeline-stage latency budget) that happen to share the number 4 — not a contradiction, but worth a one-line disambiguation in the doc so a reader doesn't assume they're the same knob. | No |

**Summary counts: 21 claims examined. CONFIRMED: 19. CORRECTED: 0. UNVERIFIED: 2 (#16 estimateTokens budget, #19 interviewer philosophy attribution).**

---

## Section B: Internal inconsistencies

### 1. BLOCKER — Eval example contradicts the extraction contract's own "ask, don't guess" rule

Quote (Sec 6.1): "unstated values are not invented (party size missing means ask, not guess)."

Quote (Sec 13):
```json
{
  "input": "Two kids, one gluten-free, train at 6:18, seated for warmups",
  "expect": {
    "partySize": 4,
    "children": 2,
    ...
```

Contradiction: the eval input never states an adult count — no "dad," no "I'm bringing," no adult noun at all — yet the expected output asserts `partySize: 4`, which requires inventing 2 adults. This directly violates the rule stated four sections earlier in the same document. It also looks like a transcription artifact: `partySize: 4` and `children: 2` only add up correctly for the full primary demo prompt ("I'm bringing my dad and two kids...", Sec 6.1), not for the shorter string actually placed in the Sec 13 JSON. The eval case appears to have been abbreviated from the demo prompt without updating the expected output to match the new (adult-free) input.

Why this is a blocker, not a nitpick: the eval suite is explicitly promoted to "a core deliverable" (Sec 0 item 8) and the eval report is called out as evidence that "outranks any commit graph" (Sec 13). If this case ships as written, either (a) the extraction pipeline is built to correctly refuse/ask on this input and the eval fails against its own written expectation, or (b) the pipeline is built to satisfy the eval and quietly violates the documented "ask, don't guess" rule for every future user who mentions kids without stating adult count — a real product/trust bug, not just a test bug.

Proposed resolution: replace the Sec 13 eval input with the full primary demo prompt text (which does state "my dad," making `partySize: 4` derivable), or change the expected output for the abbreviated input to assert a clarification/ask behavior (e.g., `mustProduceFeasiblePlan: false` with a `needsClarification: "party"` type expectation) consistent with the Sec 6.1 rule. Either fix should land before Tuesday's "first eval run" gate.

### 2. ADJUSTMENT — Sonnet 4.6 pricing listed with no corresponding routing path

Quote (Sec 7): "Haiku 4.5 for constraint extraction if it passes the eval set; Sonnet 5 for plan explanation and recap. If routing adds friction, Sonnet 5 throughout... Pin exact model IDs in `lib/ai/models.ts`..."

Quote (Sec 9): "Current rates: Haiku 4.5 $1/$5 per MTok; **Sonnet 4.6 $3/$15**; Sonnet 5 intro $2/$10 through Aug 31, 2026."

Contradiction: Sec 7's architecture routes only to Haiku 4.5 and Sonnet 5 (with a stated fallback of "Sonnet 5 throughout" — never Sonnet 4.6). Sec 9's pricing table nonetheless prices Sonnet 4.6, a model the architecture never calls. This reads as a leftover from an earlier draft (Sec 0 item 9 records "Stack corrected: ... Sonnet 5 available for narrative generation," implying a model swap happened during the v0.1→v1.0 revision that wasn't fully propagated to Sec 9's pricing table).

Proposed resolution: drop the Sonnet 4.6 row from Sec 9 unless it is being kept intentionally as a documented fallback option, in which case Sec 7 should say so explicitly. (Whether $3/$15 is the currently correct Sonnet 4.6 rate is Agent 3's domain; this entry is flagged purely for the cross-section mismatch.)

### 3. ADJUSTMENT — `shootout-attempt` is a defined event type with no defined handler

Quote (Sec 6.2 type): `type: "goal" | "shot" | "penalty" | "period-start" | "period-end" | "shootout-attempt";`

Quote (Sec 6.2 prose): "Shootouts are labeled separately and never ranked as goals."

Quote (Sec 6.2, `scoreGoal` signature): `function scoreGoal(p: NormalizedPlay, ctx: GameContext): number` — only described as scoring goals; no analogous function or sequence detector is defined for `shootout-attempt` events, and `find_key_moments` (Sec 8, "Deterministic (always runs)") is never described as producing a shootout summary.

Contradiction/gap: the schema explicitly carries a `shootout-attempt` variant, and the prose promises shootouts are "labeled separately," but no downstream consumer (scoring function, sequence detector, or UI treatment) is specified for that label. In practice this is low-risk because Sec 10 deliberately selects fixtures that avoid shootouts (Fixture A ends in 2OT; Fixture B is described as "a single OT winner"), so the gap likely never executes in the demo. But if the Fixture B search ("any clean one-goal OT game from the 2026 playoffs is acceptable") ever turns up a shootout game, or if the live-data flag is used as the closer ("pick any real game"), the pipeline has no defined behavior for that event type.

Proposed resolution: either explicitly state "shootout-attempt events are recorded but excluded from `find_key_moments` and never rendered" (a one-line spec addition, cheap), or add a minimal shootout summary path. Given the cut order already deprioritizes the live game picker, the one-line exclusion note is the pragmatic fix.

### 4. ADJUSTMENT — "matters more than" pairwise ordering cannot be losslessly expressed by a 4-value priority enum

Quote (Sec 6.1 type): `priority: "hard" | "high" | "medium" | "low";`

Quote (Sec 6.1 prose): "'matters more than' creates a priority ordering."

Quote (primary demo prompt, Sec 6.1): "seeing warmups matters more than having many food choices."

Contradiction: "A matters more than B" is a pairwise, relative statement about two specific constraints. The `Constraint` schema has no field for relative ordering (no `outranks` / `relativeTo` list) — only a single absolute tier per constraint drawn from 4 fixed buckets. The only way to "create a priority ordering" from a pairwise statement is to place A and B in different tiers, which works for one comparison but breaks down under multiple simultaneous or transitive comparisons (e.g., a second utterance "X matters more than warmups" would need a tier strictly above whatever tier warmups was placed in, and a longer chain of such comparisons can exceed 4 available tiers or force two constraints that should be distinguishable into the same tier). This is a real information-loss point between free text and the schema, not just a hypothetical: the scoring formula (Sec 6.1) also only consumes tier-level counts, confirming the system has no representation for relative-only orderings once a comparison can't be captured by "one tier apart."

Proposed resolution: document the approximation explicitly ("pairwise comparisons are mapped to the nearest available tier gap; ties within a tier are broken by input order") so it's a stated design decision rather than a silent gap, since the demo prompt exercises exactly this path and a reviewer may probe it.

### 5. ADJUSTMENT — `TraceEvent` doesn't carry the fields Sec 12 promises for the trace stream

Quote (Sec 12, Reliability): "request IDs; **trace schema version**; fallback reason surfaced; source timestamps..."

Quote (Sec 6.4, for contrast, showing the pattern the PRD uses elsewhere): `type SessionContext = { schemaVersion: 1; ... }`

Quote (Sec 6.3, full `TraceEvent` union): no member of the union, and no wrapper/envelope type, includes a `schemaVersion` or `requestId` field.

Contradiction: `SessionContext` explicitly models `schemaVersion: 1` as a first-class field (the pattern Sec 12 is presumably referring to for "trace schema version"), but the parallel type for the Decision Log stream — `TraceEvent` — has no such field defined anywhere in Sec 6.3. Same for "request IDs." This may simply mean these fields live in an outer SSE envelope not shown in the PRD's inline type sketch, but as written, the schema shown doesn't yet fulfill the promise made two sections later.

Proposed resolution: either add `schemaVersion` and `requestId` to a wrapper type around `TraceEvent` (cheap, and consistent with the `SessionContext` precedent already in the doc), or note explicitly that these are carried by the transport envelope rather than the event payload.

### 6. ADJUSTMENT — NHL "cache per instance" politeness strategy is undermined by the PRD's own stated reason for abandoning process-memory rate limiting

Quote (Sec 0, item 7): "In-process rate limiting replaced with Vercel WAF. **Process memory does not span serverless instances.**"

Quote (Sec 9, Vercel paragraph): "Function instance memory is not a durable cross-request session store..."

Quote (Sec 9, NHL paragraph): "Server-side calls only; **cache per instance**; be polite."

Contradiction: the PRD correctly diagnoses, twice, that per-instance memory is unreliable on Vercel Fluid compute (multiple concurrent instances, cold starts, no shared state) and uses that exact reasoning to justify moving rate limiting to Vercel WAF instead of in-process counters. The NHL politeness strategy ("cache per instance") relies on the identical mechanism — per-instance memory — for the identical reason (avoid hammering an external endpoint), without acknowledging it inherits the identical weakness. In a burst of concurrent seeded-demo traffic (or repeated cold starts during rehearsal), "cache per instance" offers materially weaker protection than the doc's own architecture reasoning would suggest.

Proposed resolution: this is low real-world risk since the live NHL adapter is explicitly experimental/feature-flagged and the primary demo path never calls it (Sec 4, Sec 16). Either drop "cache per instance" as a stated mitigation (since the SNAPSHOT-first design already makes it moot), or add one clause acknowledging it's a best-effort, non-durable optimization rather than a real politeness guarantee — for consistency with how carefully Sec 0/Sec 9 treat the identical tradeoff for rate limiting.

### 7. Minor — Section 9's own title oversells its contents

Quote (Sec 9 header): "## 9. Verified platform constraints and compliance wording"

Quote (Sec 9, Anthropic paragraph): "Pin model IDs; **verify at docs.claude.com before build**."

Quote (Sec 7): "Pin exact model IDs in `lib/ai/models.ts` **after confirming strings** at docs.claude.com."

Contradiction (mild, rhetorical): the section is titled "Verified," but its own Anthropic paragraph flags model-ID strings as not yet confirmed, to be verified before build starts. Not a factual error, just a naming mismatch — probably fine once Agent 3's verification pass lands, but as of this PRD draft the title overstates the section's contents.

Proposed resolution: none needed if Agent 3's ID-pinning work is completed before Monday's build starts (which the PRD's own plan calls for); otherwise rename to "Platform constraints and compliance wording (verification pending on model IDs)."

### 8. Minor — Ambiguous referent for the `estimateTokens(reducedPayload) < 4000` assertion

Quote (Sec 8): "Payload discipline: reduce raw game payloads to the normalized schema server-side; assert in tests `estimateTokens(reducedPayload) < 4000`."

Quote (Sec 6.2, Pipeline): "load game data -> normalize -> deterministic moment scoring -> **pass only the verified moment package** and validated SessionContext to the model -> structured recap generation -> render."

Ambiguity: Sec 8 reads naturally as applying the 4000-token budget to the full normalized schema (`NormalizedPlay[]` + `ReducedBoxScore`, i.e., the output of `normalize_play_by_play`), but Sec 6.2 says the model only ever receives the smaller, filtered "verified moment package" (the ranked output of `find_key_moments`), not the full normalized array. These are two different payload sizes — my synthetic estimate (Table row #16) puts the full normalized array alone near or over 4000 tokens, while the filtered moment package (a handful of ranked moments, not ~90+ raw events) would be far smaller and comfortably under budget. As written, it's not clear which payload the test in Sec 8 is meant to measure.

Proposed resolution: clarify in Sec 8 whether the budget applies to the full normalized array (server-side staging payload, never sent to the model) or the moment package (the payload actually sent to the model). If the intent is to bound what's sent to the model, the budget should explicitly target the moment package, and the full-array number becomes irrelevant to token cost (though possibly still worth capping for other reasons, e.g., response size/latency). This should be resolved before writing the Sec 8 payload-discipline test on Tuesday.

---

## Notes on scope discipline

No architecture changes, scaffolding, or package installs were made. All verification was read-only (curl to a public GET endpoint, WebFetch/WebSearch against public docs and news, and local `node -e` arithmetic/estimation scripts run against synthetic data, not real fixtures). Findings that touch other agents' domains (Sonnet 4.6/5 pricing accuracy, Fluid compute instance-memory specifics, Fixture A/B exact event counts) are flagged as cross-section inconsistencies only; the underlying facts remain those agents' verification responsibility.
