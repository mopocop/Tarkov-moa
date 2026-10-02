# Design Direction — "FIELD GLASS"

> The visual concept behind Tarkov MoA: one idea, carried through every surface.
> Drafted with an AI design agent on `feat/ui-reimagine` (2026-06-11); direction,
> vetoes and the feedback round by Moacir. Updated 2026-10-02 to match the code
> that shipped. Values live in [`src/ui/tokens.css`](../src/ui/tokens.css); the
> component reference is [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).

## The problem the look has to solve

The app lives on a second monitor during a raid. It is glanced at, not read: a
player looks over for half a second, finds their arrow, finds the extract, and
looks back. So the hierarchy has one job, which is to make **what is alive**
impossible to miss and everything else quiet.

## Concept

The app is a piece of **premium military optics**: a spotting scope, a
commander's plotting table. Matte anodized metal, etched markings, one warm
**brass** accent the way illuminated reticles glow amber, and **phosphor green**
reserved exclusively for *live* signals (your position, a squadmate's fresh
ping). Everything that is alive glows; everything that is equipment stays matte.

**What it replaced.** The first version borrowed a Binance-style palette (dark
canvas, saturated yellow). It worked, but it read "crypto dashboard". Tarkov's
own identity is desaturated, warm and military, and a tool that sits next to it
should look like equipment from the same world. Brass on graphite reads
"instrument you trust in the dark". Premium here means restraint plus one
signature.

## Palette

Warm graphite with a faint olive undertone (hue ~75–80°, saturation 5–8%):

| Token | Hex | Role |
|---|---|---|
| `bg-sunken` | `#0A0B09` | map gutter, deepest wells, the spine |
| `bg` | `#121410` | app canvas |
| `surface-1` | `#1A1C17` | rail panel, cards |
| `surface-2` | `#22241E` | raised rows, inputs |
| `surface-3` | `#2C2E27` | hover, active rows |
| `border` / `border-strong` | `#2A2C24` / `#3C3F34` | hairlines / dividers |
| `text` | `#ECEEE8` | primary (warm white) |
| `text-dim` | `#9BA08F` | secondary |
| `text-faint` | `#646A58` | tertiary, etched labels |
| `accent` (brass) | `#C9A86A` | CTAs, active states, focus. Hover `#DCC18A`, pressed `#B3924F`, ink-on-brass `#171307` |
| `live` (phosphor) | `#3DDC97` | live signals ONLY: player arrow, fresh squad ping, "connected" |
| `danger` | `#E5484D` | destructive, errors, failed |
| `warn` | `#E0A336` | staleness, caution |
| `info` | `#6CB6FF` | links, transit, neutral info |
| `map-ink` / `map-label` | `#101208` / `#FFFFFF` | outlines and names drawn **on the map** |

The two map tokens are the deliberate exception. They sit on top of third-party
map art the app does not control, so they are tuned for maximum contrast over
unknown imagery, not for harmony with the chrome.

### Map signal palette

Markers are content, not chrome, so they have their own five-role palette
(`MARKER_COLORS` in [`src/poi/registry.ts`](../src/poi/registry.ts)). The roles
come from Moacir's original spec (2026-05-30); the hues were retuned in feedback
round 1 (2026-06-12) to sit in the same warm band as the chrome:

| Role | Hex | Used for |
|---|---|---|
| Y — quest gold | `#E8C254` | quest objective pins |
| G — green | `#45C878` | PMC, friendly, medical |
| B — ice blue | `#4FB8D8` | transits, your own markers |
| O — amber | `#D89A4A` | scavs, generic loot |
| R — signal red | `#E05252` | danger: sniper, cultist, boss, hazard |

Squad colors were harmonized into the same band. Their ids are the wire
contract between clients and stay fixed; only the hexes moved.

## Typography (all OFL, self-hosted via @fontsource)

- **Display — Barlow Condensed (600/700):** headings, map names, section labels,
  the big join code. Tall and military-adjacent with no stencil kitsch. Uppercase
  with wide tracking (`--track-label`) for etched micro-labels.
- **UI — Inter:** everything that is read.
- **Data — JetBrains Mono:** coordinates, timers, counts, join codes, the
  version badge. Tabular numerals always, so numbers do not jitter as they tick.

Scale (px): 12 micro-label · 13 caption · 14 body · 16 body-lg · 18 title ·
22 display-sm · 30 display. It started one notch smaller (13px body); feedback
round 1 bumped everything, because a map monitor sits further from the eye than
a code editor.

## Motion

Principles: **input is never blocked**; map pan stays 1:1 and instant; exits are
faster than entries; only transform and opacity animate; every interactive
surface acknowledges a press within 120 ms.

| Token | Value | Use |
|---|---|---|
| `dur-fast` | 120ms | hover, press-down, icon nudges |
| `dur-base` | 180ms | toggles, fades, chips |
| `dur-slow` | 260ms | panel slide, modal enter |
| `dur-grand` | 420ms | onboarding scene changes only |
| `ease-out` | `cubic-bezier(.2,0,0,1)` | the default: fast start, soft landing |
| `ease-in-out` | `cubic-bezier(.45,0,.2,1)` | modals, large surfaces |
| `ease-pop` | `cubic-bezier(.34,1.56,.64,1)` | pin drops, badge counts |

Signature moves: pressed buttons scale to `0.985`; modals rise 8px while fading
in; the rail panel slides from its own edge; placed pins pop with `ease-pop`;
squadmate pointers fade continuously with the age of their last position (live
fading to ghost), so staleness is visible without a label. All of it winds
down under `prefers-reduced-motion`: every duration token collapses to zero and
the looping ambient signals stop. One-shot feedback that carries information (a
squadmate's ping, the loading spinner) stays.

## Depth and texture

- Hairline borders plus a top-edge inner highlight
  (`inset 0 1px 0 rgba(255,255,255,.04)`): a machined edge, not glassmorphism.
- Shadows are deep, soft and rare (`elev-1..3`). Panels float over the map;
  almost nothing else floats.
- Etched labels: uppercase Barlow Condensed in `text-faint`, tracked wide.
- No gradients except the subtle brass sheen on the primary button and the
  staleness fade.

## Layout: the Operator Rail

One **control rail** owns all chrome, on one side the player picks (left by
default, chosen during onboarding, switchable in Settings). Keeping every
control on one side means the hand and the eye go to one place, and the rest of
the screen is map.

```
┌──────┬──────────────────┐              ┌──────────────────┬──────┐
│spine │  panel (356px)   │   MAP        │  panel           │spine │
│ 64px │  (collapsible)   │              │                  │      │
└──────┴──────────────────┘              └──────────────────┴──────┘
   left mode                                         right mode
```

- **Spine**, top to bottom: app mark · Quests · Intel (POI filters) · Squad ·
  spacer · update pill · sync past logs · Feedback · How to use · Settings.
- **The map is not a section.** It is the top-level selection, pinned above
  every panel, because every section is *about* the selected map.
- With no map selected, the map area shows a **deployment board** of map cards
  instead of an empty grey pane.
- Draw tools dock on the map edge next to the rail, and the floor switcher docks
  on the same side, so all controls cluster together.

## Icons — Phosphor (MIT)

Phosphor is MIT-licensed and multi-weight, so one family covers UI chrome
(regular and bold strokes) and map markers (fill). It replaced a FontAwesome Pro
kit that could not ship in a public repo. Markers are real inline SVG with
rounded stroke joins, generated from a single source in
[`src/poi/registry.ts`](../src/poi/registry.ts), so the legend and the map can
never disagree.
