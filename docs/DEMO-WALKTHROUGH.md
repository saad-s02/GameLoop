# GameLoop live demo walkthrough

A screen-by-screen script for the interview. Every button label below is the
exact on-screen text. Read this alongside the architecture notes. If anything
on screen does not match this file, trust the screen and narrate around it.

Live URL: https://gameloop-gilt.vercel.app
Access code: letmein
Demo mode path: /plan?demo=1 (zero live model calls, fully deterministic)

The recorded game the app anchors on: Golden Knights 5, Hurricanes 4 in double
overtime, Stanley Cup Final Game 3, real NHL play-by-play, provenance SNAPSHOT.
Game night clock: doors 17:45, warmups 18:40, puck drop 19:30.

---

## 1. Pre-demo checklist

Do this in the five minutes before you share your screen.

- Open https://gameloop-gilt.vercel.app in a clean browser window. Have this
  file and the architecture notes open in a second window you can glance at.
- Go to the gate: at /enter, type `letmein` into the field labelled
  **Access code**, click **Enter**. You land on /plan. This proves the cookie
  is set before you are on camera.
- Put the demo into deterministic mode: navigate to `/plan?demo=1`. In demo
  mode the planner makes zero calls to Anthropic. There is no model warmup to
  run and nothing to wait on. The narrative you will see streams from a
  deterministic fallback, paced as SSE frames so it reads like live typing.
- Confirm the composer shows the four suggested-prompt chips, starting with
  **Family + gluten-free**. Below them you will see a disabled text box and a
  note about the live model. There is no send button in demo mode, that is
  correct.
- Know the recovery move: if any screen wedges, reload the page, and if you get
  bounced to /enter re-type `letmein` and click **Enter**. Stay on
  `/plan?demo=1`. Worst case, talk through this file and the plan panel that is
  already on screen. Nothing here depends on a network call to the model, so a
  reload always brings you back to a working, deterministic state.
- The access code is disposable for this interview. It is fine to say it out
  loud. It is not a durable secret.

---

## 2. The 30-second opening pitch (say this before clicking)

"GameLoop is an adaptive game-day copilot. The pitch is not another chatbot.
The idea is bounded, responsible agentic software: the model has exactly two
jobs, turn a fan's plain-language request into a validated set of constraints,
and turn the verified result back into prose. Everything in between, the
feasibility checks, the time arithmetic, the ranking, the replanning, is
deterministic code that I can test byte-for-byte. The other thing you will see
throughout is honesty about data. Every value on screen is tagged LIVE,
SNAPSHOT, or SIMULATED, and the app never hides which is which. What I am
running right now is the deterministic demo mode, so nothing you see depends on
a live model call. I can switch to real Anthropic calls at the end if you want
to see the same UI drive a live model."

Then start clicking.

---

## 3. The demo beats, in order

Follow this top to bottom. The main spine matches the end-to-end e2e smoke
test, so it is the proven continuous path. One director's note: the refinement
beat (step 4) moves the arrival time, so there is a quick reset back to the
clean baseline before the disruption story. If you would rather keep one
unbroken conversation thread, move step 4 to after the disruptions instead.
Both orders are fine; the reset keeps every disruption re-snap visually crisp.

| # | CLICK (exact label / action) | SAY (the talking point) | HIGHLIGHT (point at this) | WHY IT MATTERS (the engineering) |
|---|---|---|---|---|
| 1 | At /enter, type `letmein` in **Access code**, click **Enter**. Then go to `/plan?demo=1`. | "This is gated by a shared access code for the demo. Now I am in the deterministic demo workspace." | The **Enter** button, then the two-region workspace: **Conversation** on the left, **Plan panel** on the right. | The gate is an HMAC-signed cookie, compared in constant time, checked on the model-calling routes (/api/plan, /api/warmup). Only that surface is protected, which is the only thing worth protecting. |
| 2 | Click the suggested prompt **Family + gluten-free**. | "I am not typing. This is a preset request: a dad, two kids, one gluten-free, a train stated at 6:18, and warmups matter more than food variety. Watch the plan build as the reasoning streams." | The user turn appears reading "I'm bringing my dad and two kids...". The reasoning log streams folded. The **Plan panel** fills with **Tonight's plan**, and the transit step shows **18:15** with a **SNAPSHOT** badge. | The whole trace is one Zod-validated SSE envelope stream. The narrative is paced into frames so the deterministic reply streams instead of popping in. The reasoning log stays folded so the streaming reply is never pushed off screen; it raises a completion invite (an unread dot and a brief glow) instead. |
| 3 | Click the folded reasoning summary (reads **Plan built from N signals · View reasoning**) to expand it. | "This log is not the model thinking out loud. It is the deterministic core's own steps: the constraints it parsed, the data it loaded and where that data came from, how many candidates it scored, and the one it picked." | The rows: **Request parsed**, the **Data received** rows each with a SourceBadge, the candidates summary, and the **Constraint adjusted** row reading "You said 6:18; No scheduled arrival at 18:18; nearest real GO arrival, GTFS snapshot 2026-07-07. Resolved to 18:15 (Lakeshore West)." Point at the **SNAPSHOT** badge on the transit data. (The plan panel echoes the same snap as the transit step note "nearest scheduled arrival is 18:15 (Lakeshore West).") | Provenance is a Zod enum baked into the data schema, not a render-time decoration. The fan said 6:18, which is not a real scheduled time. The planner snaps it to the real 18:15 Lakeshore West arrival from the GTFS snapshot rather than pretending the stated time was achievable. That is the honesty mechanism working in public. |
| 4 | Click the quick chip **Arriving at 6:00 instead**. | "Now a conversational change. I say we are arriving at six instead. The plan does not rebuild from scratch, it replans and shows me exactly what changed." | The itinerary now shows **18:12** and the label **Lakeshore East**. Steps carry **kept** and **replaced** badges. The turn closes with "Updated in your follow-up." The composer note says free-text changes use the live model and to use the quick chips. | The replan diff pairs an invalidated step with its replacement of the same kind, so the UI can say a step was replaced, not just dropped and re-added. The chip carries a typed constraint delta, so this refinement is zero model calls even in live mode. Free-text follow-ups are the one path that needs the model, so demo mode disables that textarea honestly rather than faking it. |
| 5 | Click **Reset**, then from /plan?demo=1 click **Family + gluten-free** again. | "Let me reset to the clean baseline so the next changes read clearly." | Back to the **18:15** Lakeshore West baseline in the **Plan panel**. | Reset clears the single localStorage key and reloads. The re-run reproduces the identical plan, because the planId is a deterministic hash of the candidate plus the disruption set. Same input, byte-identical output. |
| 6 | Click the disruption **July 25 weekend service**. | "This one is real. On the actual weekend of July 25, there is GO Transit construction at the station that thins out the Lakeshore West service. Watch the plan re-snap to a different real train." | The transit step changes from **18:15** to **18:12** and the label reads **Lakeshore East**. The turn shows "18:12 (Lakeshore East)". Steps show **replaced** or **dropped**. | This is the one disruption grounded in a real research pass, not an authored what-if. The provenance discipline extends even to how the synthetic scenario was designed. The planner re-runs the whole snap against the filtered schedule, so 6:18 now lands on the real 18:12 Lakeshore East train. |
| 7 | Click the disruption **Train delayed +18 min**. | "Now stack a delay on top. Eighteen minutes. Watch it make an honest trade instead of pretending everything still fits." | Arrival becomes **18:30**. Expand the reasoning on this turn: it reports "traded: seated_by". The seating now slips past the 18:40 warmups it was protecting. | The disruption is a pure function that clones its input and never mutates it. Feasibility gates only on hard constraints; a softer preference like being seated by warmups is reported as traded, not silently broken. All time math is normalized minutes from puck drop, never clock-string comparison, which is why stacking 18:12 plus 18 gives a correct 18:30. |
| 8 | Scroll the **Plan panel** to the card **Real places near the arena**. | "Separate from the planner, this is real research. Real restaurants near the real station the fictional arena stands in for. Notice how careful the claims are." | The card names **WVRST** with the note about a **dedicated fryer**, tagged **FRIENDLY** and **SNAPSHOT**, accessed **2026-07-20**. The lead says the planner does not choose or rank these. | Each dietary claim carries its own evidence tier: certified, self-described, or friendly. Certified is only printed when a named certifier is on record for that exact outlet. Nut-free and dairy-free are hard-blocked to an honest absence line, because the research found no citable policy. This data never touches the model prompts or the planner, so the never-name-the-real-city rule stays intact. |
| 9 | Point at the panel **What GameLoop remembers**. | "The app remembers this party for next time, on this device only." | The memory panel shows the party, dietary needs, and seat and arrival that were just planned. | Memory is written to localStorage only after a feasible plan validates against a schema, with a seven-day expiry. The model has no memory-write path at all. Code decides what gets remembered, which is the same bounded principle end to end. |
| 10 | Click **Reset**. | "And a clean reset takes it back to nothing saved." | The page returns home. Go back to /plan and the memory panel reads "Nothing saved yet. Plan a night and this remembers it for next time." | Reset removes the one app localStorage key and does a full reload, so there is no stale client state to leak between runs. |

Optional beat, if there is time and interest: from a fresh `/plan?demo=1`, click
the suggested prompt **Short on details**. The request is deliberately vague, so
the plan asks back, inline in the thread: "How many adults and how many children
are going?" Fill the **Adults** and **Children** steppers (1 and 2), click
**Use this**. The answer becomes a user turn reading "1 adult, 2 children", the
plan merges and replans with "Added in your follow-up.", and the unstated food
timing shows up as an "assumed" card with its own provenance. This shows the
clarification loop and that the app never guesses a party size it was not told.

---

## 4. Themes to keep hammering

Weave these in repeatedly. They are the point of the whole build.

- Provenance honesty. Every value is LIVE, SNAPSHOT, or SIMULATED, rendered by
  one component, driven by a Zod enum on the data itself. SIMULATED is the only
  dashed border in the app, so fabricated data reads as fabricated even in
  grayscale. The 6:18 snap and the real-restaurant evidence tiers are the same
  honesty mechanism in two places.
- Deterministic core, AI only at the edges. The model translates language in
  and prose out. It never does arithmetic and never picks the plan. Feasibility,
  scoring, ranking, and memory writes are all testable code.
- Normalized-minute time math. Everything is minutes from puck drop, never a
  clock-string comparison. Puck drop is zero, doors is minus 105, warmups is
  minus 50. This kills an entire class of timezone and off-by-one bugs.
- Zod at every boundary. Requests, tool results, memory, model outputs, and
  every single SSE frame are validated. A malformed frame is dropped, not fatal.
- SSE transparency. The reasoning log is the deterministic planner's real
  decisions streamed live, with concrete reproducible numbers, not a paraphrase
  of model thinking.
- Adaptive replanning. Disruptions rerun the whole pipeline and never silently
  drop a hard constraint. When something has to give, it is reported as a trade,
  with the diff shown.

---

## 5. Anticipated questions, with short answers

- "Is this hitting the model live right now?" No. In demo mode the planner makes
  zero model calls by a structural branch in the route, not a mock. I can switch
  to live mode at the end to show the same UI drive real Anthropic calls.
- "Why deterministic instead of letting the model reason about trade-offs?" The
  workflow is closed-world and known in advance, so an open agent loop adds
  failure surface without adding capability. Code decides feasibility and
  ranking, testably. The model does the two things it is actually good at.
- "Why does the prompt say 6:18 if that is not a real train time?" It is the
  fan's stated belief, not a fact the app repeats. The planner snaps it to the
  nearest real scheduled arrival, 18:15 Lakeshore West, and shows that with its
  SNAPSHOT provenance and the reason for the adjustment.
- "Is the data real or synthetic?" Mixed and disclosed per field. The game and
  its play-by-play are real NHL data, snapshotted because it is the offseason.
  The transit times are real GO Transit GTFS data. The arena, gates,
  concessions, and seats are simulated, because that operational data only
  exists inside an organization like yours. That is the plug-in point.
- "What happens when a request is impossible?" The app never guesses. It returns
  an explicit explanation naming the exact violation, plus the best feasible
  alternative found by relaxing only the constraint that is universally
  blocking, never a plan that quietly violates something.
- "How do you stop the model hallucinating a venue or game fact?" The narration
  step only ever receives already-verified, schema-validated structure, and the
  numbers are handed to it pre-phrased. It can misword a sentence but cannot bend
  a walking-minutes figure. Two invariants are enforced in code, not prompt text.
- "Where is the second mode the PRD mentions?" Relive the Game was cut on July 20
  to keep the demo focused. It was a clean end-to-end removal. The moment-ranking
  engine underneath it is still fully built and unit-tested, it just has no live
  UI. That was a deliberate scope decision, not an abandoned feature.
- "How many tests?" 287 unit tests across 33 files, all green, TDD for the
  deterministic core with exact-output fixtures pinned against the real game.
  Four end-to-end tests across two spec files run against a deliberately
  poisoned Anthropic key, so the demo path is proven to never depend on a live
  call.

---

## 6. Honest caveats to volunteer, and how each is a strength

Raise these before you are asked. Volunteering them reads as discipline.

- The venue is fictional by design. Harbourview Arena, its gates, concessions,
  and seat map are simulated. That is deliberate: it avoids any trademark or
  logo risk while keeping the game and transit data honestly real, and the
  simulated feed is exactly the adapter contract that would plug into real
  operational data you already hold.
- Demo mode is deterministic on purpose. This is not a limitation hiding a
  flaky app. A live demo in front of an interviewer must not fail, and Sonnet's
  default latency behavior plus first-use grammar compilation make a live path
  an inherent latency risk. Demo mode sidesteps all of it while running the
  exact same UI and the exact same deterministic core.
- It is the offseason, so the app anchors a real recorded game. The live NHL
  schedule returns zero games today and all week. Rather than fake a live game,
  the app replays a real, played Stanley Cup Final game through the fictional
  arena, with its real doors, warmups, and puck-drop times.
- There is a single showcase game. That is a focus decision, not a ceiling. The
  live NHL fetch path is real, tested, and timeout-bounded; the app just always
  loads the committed snapshot because that specific real game is the anchor and
  there is no live game to fetch right now.

---

## 7. If it breaks

- First move: reload the page. Nothing in the demo path depends on a live model
  call, so a reload returns you to a working deterministic state.
- If you get bounced to /enter, re-type `letmein` into **Access code** and click
  **Enter**, then go back to `/plan?demo=1`.
- Stay in demo mode (`/plan?demo=1`) for the whole scripted walk. Do not switch
  to live mode until the very end, and only if you choose to.
- If a specific chip or disruption misbehaves, click **Reset** and re-run
  **Family + gluten-free** to get back to the clean 18:15 baseline, then
  continue.
- Last resort: the plan panel already on screen is a complete, valid plan. Talk
  through it and this file. The provenance badges, the itinerary, and the
  reasoning log are all there to narrate without clicking anything further.
