import type { PoiCategory } from "./types";

export interface PoiCategoryMeta {
  id: PoiCategory;
  label: string;
  defaultOn: boolean;
  color: string; // hex, used for the icon dot + filter swatch
  glyph?: string; // FontAwesome class fallback, e.g. "fa-solid fa-circle"
}

// Drives the render layer (PoiLayer) color fallback and the legacy category
// list. Heavy categories (spawn, loot) default OFF to avoid clutter on first paint.
export const POI_CATEGORIES: PoiCategoryMeta[] = [
  { id: "extract", label: "Extractions", defaultOn: true, color: "#22c55e", glyph: "fa-solid fa-door-open" },
  { id: "transit", label: "Transits", defaultOn: true, color: "#06b6d4", glyph: "fa-solid fa-route" },
  { id: "hazard", label: "Hazards", defaultOn: true, color: "#f97316", glyph: "fa-solid fa-triangle-exclamation" },
  { id: "boss", label: "Bosses", defaultOn: true, color: "#a855f7", glyph: "fa-solid fa-skull" },
  { id: "spawn", label: "Spawns", defaultOn: false, color: "#eab308", glyph: "fa-solid fa-person" },
  { id: "loot", label: "Loot containers", defaultOn: false, color: "#94a3b8", glyph: "fa-solid fa-box" },
  { id: "custom", label: "My markers", defaultOn: true, color: "#ec4899", glyph: "fa-solid fa-location-dot" },
];

export const POI_CATEGORY_MAP: Record<PoiCategory, PoiCategoryMeta> =
  Object.fromEntries(POI_CATEGORIES.map((c) => [c.id, c])) as Record<
    PoiCategory,
    PoiCategoryMeta
  >;

// ---- Marker palette (Moacir's spec, 2026-05-30) ----------------------------
// Five-color marker palette. Markers fill the glyph with one of these and draw a
// dark outline (#1E2329) around it — see .tc-poi-glyph in App.css.
export const MARKER_COLORS = {
  Y: "#E2E200", // yellow  — QUEST markers (see MarkerLayer; scroll icon)
  G: "#0ECB81", // green   — PMC / friendly / medical
  B: "#2DBDB6", // blue    — transit / custom markers
  O: "#D38E2D", // orange  — scav / generic loot
  R: "#F6465D", // red     — danger: sniper / cultist / boss / hazard
} as const;

// ---- FontAwesome icon resolution (keyed by facet) --------------------------
// Single source of truth for which FA glyph + color each marker type uses. Keyed
// by the facet key (see facets.facetKeyOf) so markers AND the filter-panel
// swatches stay in sync, and so the mapping is as fine-grained as the filter
// buckets. FA Solid only (per spec). Swap any value here; nothing else changes.
const FACET_ICON: Record<string, string> = {
  // Extractions (transit folds in here — it's an extraction type)
  "extract:pmc": "fa-solid fa-right-from-bracket",
  "extract:scav": "fa-solid fa-right-from-bracket",
  transit: "fa-solid fa-right-from-bracket",
  // Spawns
  "spawn:pmc": "fa-solid fa-square-arrow-down",
  "spawn:scav": "fa-solid fa-square-arrow-down",
  "spawn:sniper": "fa-solid fa-crosshairs",
  cultist: "fa-solid fa-knife",
  boss: "fa-solid fa-skull",
  // Hazards (not specified by Moacir — kept on the warning glyph)
  hazard: "fa-solid fa-triangle-exclamation",
  // Loot containers
  "loot:ammo": "fa-solid fa-crate-empty",
  "loot:bag": "fa-solid fa-bag-shopping",
  "loot:cash": "fa-solid fa-cash-register",
  "loot:computer": "fa-solid fa-microchip",
  "loot:container": "fa-solid fa-box-archive",
  "loot:stash": "fa-solid fa-coin",
  "loot:jacket": "fa-solid fa-shirt",
  "loot:medbag": "fa-solid fa-briefcase-medical",
  "loot:other": "fa-solid fa-box-open",
  "loot:safe": "fa-solid fa-vault",
  "loot:weapon": "fa-solid fa-gun",
  // Custom markers
  custom: "fa-solid fa-location-dot",
};

// Marker fill color per facet key (outline is always #1E2329, set in CSS).
const FACET_COLOR: Record<string, string> = {
  "extract:pmc": MARKER_COLORS.G,
  "extract:scav": MARKER_COLORS.O,
  transit: MARKER_COLORS.B,
  "spawn:pmc": MARKER_COLORS.G,
  "spawn:scav": MARKER_COLORS.O,
  "spawn:sniper": MARKER_COLORS.R,
  cultist: MARKER_COLORS.R,
  boss: MARKER_COLORS.R,
  hazard: MARKER_COLORS.R,
  "loot:medbag": MARKER_COLORS.G,
  custom: MARKER_COLORS.B,
  // all other loot:* default to orange via colorForFacet()
};

const DEFAULT_ICON = "fa-solid fa-circle";
const DEFAULT_COLOR = MARKER_COLORS.O;

// FA class for a facet key. Falls back to the category's default (loot:* → box,
// etc.) and finally a plain dot, so an unmapped subtype still renders.
export function iconForFacet(facetKey: string): string {
  const hit = FACET_ICON[facetKey];
  if (hit) return hit;
  if (facetKey.startsWith("loot:")) return "fa-solid fa-box-open";
  if (facetKey.startsWith("extract:")) return "fa-solid fa-right-from-bracket";
  if (facetKey.startsWith("spawn:")) return "fa-solid fa-square-arrow-down";
  return DEFAULT_ICON;
}

// Marker fill color for a facet key. Unmapped loot buckets default to orange so
// a new tarkov.dev container type still gets the loot color.
export function colorForFacet(facetKey: string): string {
  const hit = FACET_COLOR[facetKey];
  if (hit) return hit;
  if (facetKey.startsWith("loot:")) return MARKER_COLORS.O;
  return DEFAULT_COLOR;
}
