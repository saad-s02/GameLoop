# GameLoop design language: The Lit Sheet

Locked 2026-07-15, overnight styling session. Dark only. This document is the contract for every visual decision on the branch; tokens live in `app/globals.css` under `@theme`.

## Thesis

At night an arena is a dark bowl with one bright thing in it: the ice. The page is the bowl, a deep cold blue-charcoal under a faint lamp field. The Decision Log is the ice sheet, the only surface on the page that is lighter than its surroundings, with a red center line painted under the frost. Rink paint (red line, blue line) is structure, never decoration: the log's spine, the focus ring, the diff semantics. The single warm hue is scoreboard sodium amber, and it always means attention. Nothing glows except the thing that is currently live.

Three independent design directions were drafted (broadcast package, rink materiality, scoreboard print heritage) and this language is a synthesis: the material inversion of the lit sheet, the scorer's ledger clock rail, and the one-warm-hue discipline.

## Palette

| Token | Hex | Role |
|---|---|---|
| `bowl` | `#0c121b` | Page background. Never pure black. Carries the fixed lamp-field gradient. |
| `boards` | `#141d29` | Default card surface. 1px `steel` border. |
| `glass` | `#1c2735` | Raised surface: hover, active, sticky header. Gets an inset top light catch. |
| `well` | `#0a0f16` | Inset wells: raw JSON, quoted input, clock housings. |
| `ice` | `#e9f0f6` | Primary text. About 13:1 on boards. |
| `frost` | `#93a3b5` | Muted text. About 6.3:1 on boards. Reduced-opacity frost variants are banned for text below 24px (they fall under AA); small labels use full-strength frost, which holds AA down to badge sizes. |
| `line-red` | `#b33a31` | Rink paint. Decorative only, never text: the log spine, face-off dots. |
| `line-blue` | `#3d6fb0` | Rink paint. Structural blue: selection tint, connectors. |
| `red-lamp` | `#f28b82` | Legible red: violated text, LIVE badge. About 5.4:1 on boards. |
| `blue-glow` | `#7fa9dc` | Links, focus ring, SNAPSHOT badge. About 5.8:1 on bowl. |
| `sodium` | `#e8b34b` | The only warm hue: traded status, the streaming node, light pool. |
| `ice-green` | `#6fcf8e` | Satisfied status only. Frosted, not neon. About 7.9:1 on boards. |
| `steel` | `rgb(148 170 196 / 0.12)` | Default 1px surface border. `steel-bright` at 0.3 for hover and emphasis. |

Status colors are always icon plus text, never color alone. SIMULATED provenance additionally carries the page's only dashed border, so fabricated data reads differently even in grayscale.

## Typography

Three voices, three jobs, all self-hosted through next/font:

- Display: Big Shoulders (variable). Arena signage. The wordmark, section headers in caps with tracking, the memory card rank numerals, event type eyebrows in the log.
- Body: Barlow 400/500/600. All prose, labels, buttons. Same signage DNA as the display face, so the page reads as one system.
- Mono: IBM Plex Mono 400/500/600 with tabular numerals. Every clock, score, period stamp, id, badge, and the ledger gutter. Game data is recognizable anywhere on the page by its voice.

Scale: h1 32/36 display 700 caps; section headers 20/26 display 600 caps, tracking 0.06em; eyebrows 12/16 mono 500 caps, tracking 0.12em; body 15/24; small 13/20; badges 11/16 mono 500 caps; memory ranks 44/44 display 700.

## Surfaces, radius, borders, shadows

Ladder: bowl page, boards cards, glass raised, well inset. The Decision Log alone gets the Ice treatment: a vertical gradient slightly lighter than boards topped with a frost veil, `radius-sheet`, a brighter top edge, and the deepest shadow. The memory card shares `radius-sheet` as the second hero.

Radius: 6px wells and inputs, 10px cards, 16px the two hero sheets, full round only for chips. Borders: every surface edge is 1px `steel`; raised surfaces add an inset top light catch; dashed is reserved for SIMULATED. Shadows are cold and downward only (`shadow-rink`, `shadow-sheet`). Glow budget for the whole app: the live streaming node and the LIVE badge dot. No text glow, no border glow.

## Motion

Tokens: `--t-micro` 120ms (hover, chip pops), `--t-move` 240ms (entrances, dims), `--t-settle` 480ms (orchestrated moments); easing `--ease-glide` cubic-bezier(0.22, 1, 0.36, 1), a skate-stop deceleration.

The three scripted moments:
1. SSE entrances: log rows fade and rise 6px over `t-move`; each face-off dot docks onto the spine; the newest dot pulses until its row completes. The stagger is the stream itself, no artificial delays.
2. Replan: the old plan dims and desaturates over `t-move`, the new plan settles in over `t-settle`, then kept/replaced/dropped badges pop at `t-micro` with 60ms offsets.
3. Memory card: rank numerals and score digits reveal through an overflow mask over `t-settle` with small left-to-right staggers; period and clock stamps fade in after their row lands.

Every animation sits behind a motion-safe guard. Reduced motion gets instant opacity-only state changes, and nothing pulses.

## Signature

The painted line under the lit ice. One 2px red center line runs the Decision Log's full height, rendered beneath a frost veil so it reads as paint under ice. Each streamed event docks onto it with a face-off dot: hollow blue ring when complete, solid pulsing sodium while streaming. The final decision row is promoted with a larger dot inside a hairline face-off circle. To the left of the spine, a mono ledger gutter stamps each event with its elapsed clock, and the header clock freezes when the stream closes, leaving the total time visible as proof of speed.

## What was considered and rejected

A red goal-line sweep behind the decision title (second signature device, cut for restraint). Big Shoulders for body text (display face, poor at paragraph sizes). A neon accent on near-black (the templated dark-UI look this language exists to avoid). Light-theme support (dark only is locked for the demo).
