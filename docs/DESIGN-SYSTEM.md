# FIELD GLASS — Design System Reference

> The reference for Tarkov MoA's UI, written so that anyone (a person or a
> coding agent) can make a change like "make this button secondary, small"
> without re-deriving anything. Why it looks this way:
> [`DESIGN-DIRECTION.md`](DESIGN-DIRECTION.md).

**Where things live**

| What | Where |
|---|---|
| Tokens (color, type, space, radius, elevation, motion, z) | [`src/ui/tokens.css`](../src/ui/tokens.css) |
| Token values JS needs as literals | [`src/ui/tokens.ts`](../src/ui/tokens.ts), checked by `tokens.test.ts` |
| Component styles | [`src/ui/ui.css`](../src/ui/ui.css) (class prefix `ui-`) |
| Components | `src/ui/*.tsx`, barrel [`src/ui/index.ts`](../src/ui/index.ts) |
| Map marker glyphs and colors (single source) | [`src/poi/registry.ts`](../src/poi/registry.ts) |

## Golden rules

1. Import components from the barrel (`../ui`), never from deep paths.
2. Never hardcode a color or size. Use `var(--token)` from `tokens.css`. If JS
   has to hand a color to something that cannot read CSS variables, add it to
   `TOKEN_HEX` (see below), never inline the hex.
3. Brass (`--accent`) is scarce: one primary action per view, active states, focus.
4. Phosphor green (`--live`) means **live signal only** (player, fresh squad
   ping, connected). It is never a generic "success" color.
5. Map gestures are never animated. Elsewhere, only opacity and transform animate.
6. Uppercase Barlow Condensed with tracking = labels and headings; Inter =
   reading; JetBrains Mono = data (codes, coordinates, counts, times).

## Tokens cheat sheet

**Color:** `--bg-sunken --bg --surface-1 --surface-2 --surface-3 --border
--border-strong` · text `--text --text-dim --text-faint` · brass `--accent
--accent-hover --accent-pressed --accent-ink --accent-soft --accent-glow` ·
signals `--live --danger --warn --info` (each with a `-soft` tint) · on-map
`--map-ink --map-label`.

**Type:** `--font-ui --font-display --font-mono` · sizes `--fs-micro 12 /
--fs-caption 13 / --fs-body 14 / --fs-body-lg 16 / --fs-title 18 /
--fs-display-sm 22 / --fs-display 30` · `--track-label` for etched labels.

**Space:** `--sp-0..7` = 2/4/8/12/16/24/32/48. **Radius:** `--r-sm 4 / --r-md 6
/ --r-lg 10 / --r-xl 14 / --r-pill`. **Elevation:** `--edge` (machined top
highlight), `--elev-1..3`.

**Motion:** `--dur-fast 120ms / --dur-base 180ms / --dur-slow 260ms /
--dur-grand 420ms`; easings `--ease-out` (default), `--ease-in-out` (large
surfaces), `--ease-pop` (pins, badges). Under `prefers-reduced-motion` every
`--dur-*` becomes `0ms`, so anything timed with a token is covered for free. A
looping animation must add its own `animation: none` in a reduced-motion block
next to where it is defined.

**Z:** `--z-map-ui 500 / --z-rail 800 / --z-modal 1000 / --z-toast 1100 /
--z-tooltip 1200`. No z-index outside this scale.

### Tokens outside CSS

Leaflet writes path colors into SVG presentation attributes (`stroke="…"`),
where `var(--token)` does not resolve. The few values the map layer needs are
mirrored in `TOKEN_HEX`:

```ts
import { TOKEN_HEX } from '../ui/tokens';
<Polyline pathOptions={{ color: TOKEN_HEX.accent }} … />
```

`tokens.test.ts` reads `tokens.css` and fails if a mirrored value drifts, so
`tokens.css` stays the single source of truth.

### What is allowed to be a raw hex

- `MARKER_COLORS` and the squad palette: content colors with their own roles,
  defined once in `registry.ts` and `shared/squadProtocol.ts`.
- `FloorVisualOverlay.tsx`: recolors of the **third-party map SVGs** (stairs,
  pavement). Those match the map art's palette, not ours.

Anything else is a bug.

---

## Components

All examples assume `import { … } from '../ui';`

### Button

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'tertiary' \| 'ghost' \| 'danger'` | `'secondary'` | primary = brass CTA (scarce), secondary = machined surface, tertiary = quiet text, ghost = brass text for inline actions, danger = outlined red that fills on hover |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | heights 28 / 36 / 44 |
| `icon` / `iconEnd` | `ReactNode` | — | a Phosphor icon; sizes itself at 1em |
| `loading` | `boolean` | `false` | spinner replaces the icon, blocks input |
| `fullWidth` | `boolean` | `false` | |
| …rest | all `<button>` props | | `onClick`, `disabled`, `title`, … |

```tsx
<Button variant="primary" icon={<ArrowsClockwise weight="bold" />} loading={busy} onClick={refresh}>
  Refresh
</Button>
<Button variant="tertiary" size="sm">Patch notes</Button>
```

### IconButton

| Prop | Type | Default | Notes |
|---|---|---|---|
| `icon` | `ReactNode` | required | |
| `label` | `string` | required | becomes `aria-label` and the native title |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 28 / 36 / 44 square |
| `variant` | `'tertiary' \| 'secondary' \| 'danger'` | `'tertiary'` | |
| `active` | `boolean` | — | toggled-on brass tint, rendered as `aria-pressed` |
| `noTitle` | `boolean` | `false` | set when wrapped in `<Tooltip>`, to avoid a double tip |

```tsx
<IconButton icon={<PenNib />} label="Draw on map" active={tool === 'pen'} onClick={togglePen} />
```

### Toggle
`checked` · `onChange(next)` · `size sm|md` · `disabled` · `label` (accessible name).
```tsx
<Toggle checked={gridOn} onChange={setGridOn} label="Reference grid" />
```

### Slider
`value` · `min` · `max` · `step?` · `onChange(value)` · `disabled?` · `label`
(accessible name, required) · `valueText?` (mono readout on the right, e.g. `+1.0`).
Graphite track, brass thumb.

### Tabs
Underline tabs with a sliding brass indicator. `items: {id, label}[]` · `value` · `onChange(id)`.
```tsx
<Tabs items={[{ id: 'a', label: 'Quests' }, { id: 'b', label: 'Intel' }]} value={tab} onChange={setTab} />
```

### Segmented
The "pick one" control, with a machined sliding thumb.
`options: {id, label, icon?}[]` · `value` · `onChange(id)` · `fullWidth`.
```tsx
<Segmented fullWidth value={side} onChange={setSide}
  options={[{ id: 'left', label: 'Left' }, { id: 'right', label: 'Right' }]} />
```

### Modal

| Prop | Type | Default | Notes |
|---|---|---|---|
| `title` | `ReactNode` | — | uppercase display type |
| `onClose` | `() => void` | required | |
| `footer` | `ReactNode` | — | right-aligned button row |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | max-width 400 / 540 / 720 |
| `dismissable` | `boolean` | `true` | false = no X, no Esc, no backdrop close |

```tsx
<Modal title="Settings" onClose={close} size="lg"
  footer={<Button variant="primary" onClick={save}>Save</Button>}>…</Modal>
```

### Toast
`message: string | null` · `onDismiss` · `variant info|success|warn|error` ·
`duration` (ms; 0 = sticky; default 6000). Bottom center, with a colored left edge.

### Tooltip
`content` · `hint?` (mono shortcut text) · `side top|bottom|left|right` ·
`delay` (default 350 ms). Portal-positioned. It dismisses itself on any pointer
down, scroll or window blur, because a click that opens a modal removes the
trigger from under the cursor and the `mouseleave` that would hide it never fires.
```tsx
<Tooltip content="Draw on the map" hint="D" side="right">
  <IconButton noTitle icon={<PenNib />} label="Draw" />
</Tooltip>
```

### Card
`pad none|sm|md|lg` · `sunken` (recessed well) · `interactive` (hover and press)
· `selected` (brass tint) · plus all `<div>` props.

### Chip
A pill for filters, categories and status. `selected` · `onClick` (omit it and
the chip renders as a static span) · `dot` (a CSS color) · `count` · `size sm|md` · `icon`.
```tsx
<Chip selected={cat === 'bug'} onClick={() => setCat('bug')}>Bug</Chip>
<Chip dot={colorForFacet('extract:pmc')} count={4}>Extracts</Chip>
```

### Input / TextArea
Input: `uiSize sm|md|lg` · `icon` (leading) · `invalid` · `mono` (join codes,
coordinates) · plus input props. TextArea: `invalid` · plus textarea props.
```tsx
<Input mono placeholder="ABCD-1234" maxLength={9} icon={<SignIn />} />
<TextArea rows={5} placeholder="What happened?" />
```

### Select
A native `<select>` with a custom chevron and brass focus. All select props.

### Field
`label` (etched uppercase) · `hint` · `error` (replaces the hint, in red) around
any control. The wrapper is a `<div>`, not a `<label>`: a `<label>` without
`htmlFor` adopts its first control, and browsers forward hover and click to it,
so with several controls inside (the squad color swatches) hovering any one lit
up the first.
```tsx
<Field label="Callsign" hint="Shown to your squad."><Input maxLength={16} /></Field>
```

### SectionLabel · Spinner · Kbd
`SectionLabel`: etched heading plus a hairline rule, with an optional mono
`count`. `Spinner`: `size sm|md|lg`. `Kbd`: a key cap.

---

## Icons (Phosphor, MIT)

UI icons come from `@phosphor-icons/react`. Use weight **`bold`** for chrome at
small sizes and **`fill`** for state (the active spine section switches from
`regular` to `fill`). The default size is `1em`, so inside Button and IconButton
you just drop the icon in.

```tsx
import { MapTrifold, UsersThree, Crosshair } from '@phosphor-icons/react';
<MapTrifold weight="bold" />            // sizes from context
<Crosshair size={20} weight="fill" />   // explicit
```

Map marker glyphs are not React components. They are inline SVG strings built
in `src/poi/registry.ts` from two maps, `FACET_ICON` (glyph) and `FACET_COLOR`
(fill). To change a marker, edit those two maps only; the filter-panel swatches
read the same source, so the legend cannot drift from the map. The outline and
rounded joins come from CSS (`.tc-poi-glyph svg * { paint-order: stroke fill }`).

## Patterns

- **One primary per surface.** Everything else is secondary or tertiary.
- **Destructive flows:** a `variant="danger"` button, then a confirm in a `Modal size="sm"`.
- **Loading:** `loading` on the button that triggered it; a whole-surface load
  gets a centered `Spinner size="lg"`.
- **Empty states:** a `--text-faint` line plus a tertiary action. The no-map
  state is the deployment board (`MapEmptyState`), not an empty pane.
- **Etched labels:** `SectionLabel` (or the `.ui-field__label` style), never bold Inter caps.

## Don'ts

- No transitions on the Leaflet map pane. Pan and zoom stay 1:1.
- Never recreate an `L.divIcon` to show a hover or selected state. Rebuilding
  the icon destroys and rebuilds the marker's DOM mid-gesture, and the browser
  drops the `click`. Cache one icon per type and toggle a class on the live
  element (`marker.getElement().classList`) instead.
- No z-index outside the token scale.
- No FontAwesome. The Pro kit it replaced is per-seat licensed and cannot ship in
  a public repo.

## Licensing

| Asset | License | Redistributable in a public repo |
|---|---|---|
| Phosphor Icons (`@phosphor-icons/react`, `@phosphor-icons/core`) | MIT | ✅ |
| Inter, JetBrains Mono, Barlow Condensed (`@fontsource*`) | OFL-1.1 | ✅ |
