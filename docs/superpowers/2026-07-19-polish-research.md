# Polish research: why GameLoop feels unfinished, and the ranked plan (2026-07-19)

Method: four parallel audit agents (visual critique over 22 production screenshots, code-level completeness audit, live UX walk on prod at desktop and 390px mobile, and web research into 2026 AI-product UI patterns), synthesized by an adversarial judge ranking by wow per effort. 26 findings total, 8 verified techniques, all implementable with zero new dependencies. Fresh walk screenshots live in the session scratchpad under polish-walk; QA screenshots under qa-run.

## Diagnosis

The app is styled but not composed. Every individual surface is well executed in isolation, so the Lit Sheet design system is real and consistently applied. The root cause of the "not wowed, feels incomplete" reaction is that page-level composition inverts the product's own priority: the one elevated surface in the entire app (.ice-sheet) is spent on a 17-row developer decision log that renders first and measures about 1973px tall, while Tonight's Plan, the thing the user actually asked for, renders second as a plain h2 with flat rows (about 711px, no card chrome, no accent). A first-time user scrolls three screens of internal telemetry, studded with leaked plan IDs, pipe-delimited keys, and raw float scores, before reaching the payoff, which is rendered with less visual confidence than the trace that produced it.

The Relive recap proves the system can produce a finished-feeling screen (big display headline, colored rank numerals, prose-only summary). The fix is not a new visual language. It is redistributing that same hero confidence onto the planning flow and demoting the reasoning trace to an inspectable artifact.

## Signature move

Flip the hero. Reassign the elevated .ice-sheet surface from the Decision Log to Tonight's Plan, reorder so the plan renders immediately after What We Heard, and collapse the 17-row log into a single summary strip ("Plan built from 17 signals. View reasoning") using a native details element. One change fixes the hierarchy inversion, the card-sameness fatigue, and the scroll-depth problem at once, and deletes zero functionality that QA already passed.

Important: this deliberately reverses the DESIGN.md locked thesis ("the Decision Log alone gets the Ice treatment"). It needs explicit owner sign-off as a conscious reversal, not a tweak.

## Ranked plan

### 1. Flip the hero (extreme wow per effort, hours)

In app/plan/page.tsx: move the Tonight's Plan block (currently lines 379 to 399) to render immediately after the constraint contract and assumptions, before ActivityPanel (currently line 359). Wrap the plan in the .ice-sheet surface so it visibly outranks every utility section. Wrap ActivityPanel in a native details element whose summary reads as a status chip ("Plan built from 17 signals. View reasoning"), full log intact inside. Remove ActivityPanel's own ice-sheet treatment so only the plan carries hero weight. Reveal animation on details[open] goes inside the existing reduced-motion block.

Risk: reverses the DESIGN.md thesis (needs sign-off). Playwright specs that assert log rows are visible on load must expand the details first. Structural spec change, not styling.

### 2. Strip leaked internals from every always-visible panel (extreme, hours)

Four concrete edits, all copy or props:
1. ConsideredRejected.tsx line 50: replace runnerUp.candidateId (renders as gate-1|stand-harbour-fresh|18:15|pickup-after-seating) with a derived human label from fields already on ItineraryPlan.
2. ConsideredRejected.tsx lines 26 and 54 to 57, ActivityPanel.tsx lines 96 to 97: demote raw float scores (score 3085.5) into the Raw Event details or reframe as the existing prose differentiator (saves 2 walking minutes).
3. MemoryPanel.tsx line 93: remove session.selectedPlanId (plan-f3968f8b41b5) from the persistent sidebar or move it under a collapsed technical detail row.
4. Route the "(Deterministic summary; the narrative model was unavailable.)" caveat and ActivityPanel.tsx line 121 through lib/copy.ts with honest, friendly wording. The current phrasing implies a failure that never happened (the call is skipped by design in demo mode and for infeasible plans), which the production QA run on 2026-07-19 also flagged.

Risk: lib/copy.ts is test-frozen, so this is a copy-change commit with test updates bundled, kept separate from pure styling commits.

### 3. Real vertical timeline for the itinerary (high, hours)

In ItineraryTimeline.tsx, reuse the existing .log-list spine pattern (vertical line plus docking dots, already built for the log) for Tonight's Plan: a container ::before line down a left gutter, a filled dot per stop, and a small inline SVG glyph per event type (train, gate, seat, food, whistle) beside each mono timestamp. Color dots with existing accent tokens per phase (ice-green arrival, sodium transit, red-lamp game time), always paired with glyph and label since color alone can never carry meaning. Line must be solid; dashed is reserved for SIMULATED. Optional scroll-driven reveal via animation-timeline: view() behind an @supports guard, inside the reduced-motion block.

### 4. Tonight's-game context strip and a CTA that stops reading as disabled (high, hours)

Add a slim band above the plan form: a mono sodium eyebrow reading, for example, "TONIGHT. Golden Knights at Hurricanes. Puck drop in 3h 41m", from the same SNAPSHOT game data /relive already uses, with its provenance badge. Fix the primary CTA (app/plan/page.tsx line 322, app/enter/page.tsx lines 55 to 61): add a blue-glow ring to the ready state so it is visually distinct from the true disabled state. Fill the MemoryPanel "Nothing saved yet" box with a three-line preview of the fields it will populate. Countdown math uses normalized minutes from event start, never time-string comparison.

### 5. Design the 3 to 6 second generation wait (high, hours)

Before the first trace frame arrives (useTraceStream.ts line 58), render two or three skeleton rows shaped like the new itinerary timeline with a shimmer keyframe inside the reduced-motion block and a static fallback outside it. Optionally stage present-tense status copy ("Reading your request", "Checking the venue", "Finalizing plan") as a single in-place string, not a scrolling log. Note: the live UX walk observed feedback within roughly 300 to 400ms on the warm path, so validate on a cold call before over-investing.

### 6. One accent per screen, and make the lamp field visible (medium, hours)

Raise the body lamp-field gradient alphas (globals.css lines 66 to 69) from 0.04 and 0.05 to roughly 0.08 to 0.10 warm and 0.06 to 0.07 cool. Deploy sodium at scale where the design already sanctions attention: the countdown, the plan timestamps, a left accent bar on the streaming log row, section eyebrows. One accent per route context (sodium or red-lamp on landing tied to the countdown, ice-green on results tied to the finalized plan). Re-verify AA contrast for text over the brightened lamp zone.

### 7. Let the display face carry one hero sentence (high, hours)

Above the itinerary, one large Big Shoulders outcome sentence in plain language, for example "In by 18:30, seated before warmups", the same treatment the Relive recap already proves out. If the sentence is generated or templated it may touch lib/copy.ts.

### 8. Mobile finish pass (high, minutes)

SiteHeader nav: stop the tabs wrapping mid-label at 390px (whitespace-nowrap or shorter mobile labels). Raise chip and button tap targets to the 44px minimum at the mobile breakpoint (demo chips are 34px, Plan my night 36px, Clear Memory 26px). Add motion-safe transition-colors to the active-nav swap (SiteHeader.tsx lines 36 to 38).

### 9. Make genuine errors look like errors (high, minutes)

Extend the Retry button condition (ActivityPanel.tsx line 236) to fire on status error, not just stalled, and give the error status message the red-lamp tinting the infeasible-plan card already uses.

### 10. Severity chips: dot plus word instead of bang ladder (medium, minutes)

Replace "!!! HARD", "!! HIGH", "! MEDIUM" with a colored dot plus the word (red-lamp for hard, sodium for high, frost for medium). The bang ladder reads as linter output. Bundle with the rank 2 copy commit to amortize the frozen-copy test updates.

### 11. Secondary page parity: Relive cards and How It Works intro (medium, hours)

Give the two Relive showcase cards a small accent tag reflecting the drama in their copy, and tighten the trailing gap. Add a two-line plain-language lead to How It Works explaining what LIVE, SNAPSHOT, and SIMULATED mean for a visitor's plan, before the technical detail (which stays for the portfolio audience).

### 12. Entrance polish with @starting-style (medium, minutes)

Soft staged fade and rise on first paint for the landing hero and itinerary rows using native @starting-style plus a base transition, nested inside the existing reduced-motion block. Baseline supported since 2026 at roughly 85 to 90 percent global; degrades to instant state elsewhere.

## Deliberately dropped

- View Transitions API for the form-to-results swap: rank 1 removes the jarring cut it would smooth, and it needs an experimental next.config flag. Low marginal wow for real config risk.
- Responsive decision-log grid pass: rank 1 collapses the log by default, so its narrow-screen layout stops being a first-impression surface.
- Dead keyframes remediation: refuted by the code lens. All four globals.css keyframes are wired to real elements.
- Broad homepage rework: the lenses refuted the bare-homepage hypothesis; only the missing tonight's-matchup line survives and it is folded into rank 4.
- Uniform palette brightening: rejected in favor of rank 6 single-accent discipline, which is safer for AA and more finished-feeling.

## Technique references (all zero-dep, sources verified by the research agent)

- Progressive disclosure of agent reasoning (Claude, ChatGPT, Perplexity collapsed-trace pattern): docs.claude-mem.ai/progressive-disclosure, mindstudio.ai progressive-disclosure writeup.
- @starting-style entrances: web.dev/blog/baseline-entry-animations, joshwcomeau.com/css/starting-style.
- Scroll-driven animations (animation-timeline: view()): MDN scroll-driven animations guide, developer.chrome.com/blog/scroll-triggered-animations. Firefox still flag-gated; @supports guard required.
- Pure CSS vertical timeline (::before spine plus dot markers): freefrontend.com/css-timelines and equivalents; framework-agnostic.
- Single saturated accent on true-grey dark surfaces (ESPN-style AA-tuned sports discipline): aydesign.ai dark-dashboard patterns 2026, qodequay.com dark-mode dashboards.
- Skeleton screens over spinners (controlled-study backed): LogRocket skeleton design guide, ResearchGate skeleton-perception study.
- Status-line narration over raw logs during generation: shipped behavior in Claude, Perplexity, v0.
- View Transitions in Next 16 (dropped, documented for later): nextjs.org/docs/app/guides/view-transitions.

## Sequencing recommendation

Wave 1 (one session): ranks 1, 2, 3, plus the minutes-scale ranks 8 and 9. This is the entire "instrumentation console" fix.
Wave 2: ranks 4, 5, 7 (the liveness and confidence layer).
Wave 3: ranks 6, 10, 11, 12 (the last five percent).

Every wave keeps the standing gates green (vitest, build, playwright), with copy-change commits kept separate from styling commits per the freeze protocol. Rank 1 requires the owner to consciously approve reversing the DESIGN.md decision-log thesis before work starts.
