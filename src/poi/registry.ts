import type { PoiCategory } from "./types";

// ---- Marker glyphs: Phosphor Icons (MIT), fill weight ----------------------
// Raw SVG markup inlined at build time via Vite `?raw`. This file is the SINGLE
// SOURCE OF TRUTH for marker glyph + color — swap any import or map entry here
// and the map markers, filter-panel swatches, and squad layers all follow.
// The dark outline + rounded joins are applied in CSS (.tc-poi-glyph svg *).
import signOutSvg from "@phosphor-icons/core/assets/fill/sign-out-fill.svg?raw";
import arrowSquareDownSvg from "@phosphor-icons/core/assets/fill/arrow-square-down-fill.svg?raw";
import crosshairSvg from "@phosphor-icons/core/assets/fill/crosshair-fill.svg?raw";
import knifeSvg from "@phosphor-icons/core/assets/fill/knife-fill.svg?raw";
import skullSvg from "@phosphor-icons/core/assets/fill/skull-fill.svg?raw";
import warningSvg from "@phosphor-icons/core/assets/fill/warning-fill.svg?raw";
import packageSvg from "@phosphor-icons/core/assets/fill/package-fill.svg?raw";
import bagSvg from "@phosphor-icons/core/assets/fill/bag-simple-fill.svg?raw";
import cashRegisterSvg from "@phosphor-icons/core/assets/fill/cash-register-fill.svg?raw";
import cpuSvg from "@phosphor-icons/core/assets/fill/cpu-fill.svg?raw";
import archiveSvg from "@phosphor-icons/core/assets/fill/archive-fill.svg?raw";
import coinSvg from "@phosphor-icons/core/assets/fill/coin-fill.svg?raw";
import shirtSvg from "@phosphor-icons/core/assets/fill/shirt-folded-fill.svg?raw";
import firstAidSvg from "@phosphor-icons/core/assets/fill/first-aid-kit-fill.svg?raw";
import boxOpenSvg from "@phosphor-icons/core/assets/fill/box-arrow-up-fill.svg?raw";
import vaultSvg from "@phosphor-icons/core/assets/fill/vault-fill.svg?raw";
import swordSvg from "@phosphor-icons/core/assets/fill/sword-fill.svg?raw";
import mapPinSvg from "@phosphor-icons/core/assets/fill/map-pin-fill.svg?raw";
import scrollSvg from "@phosphor-icons/core/assets/fill/scroll-fill.svg?raw";
import circleSvg from "@phosphor-icons/core/assets/fill/circle-fill.svg?raw";

export interface PoiCategoryMeta {
  id: PoiCategory;
  label: string;
  defaultOn: boolean;
  color: string; // hex, used for the icon dot + filter swatch
}

// Drives the render layer (PoiLayer) color fallback and the legacy category
// list. Heavy categories (spawn, loot) default OFF to avoid clutter on first paint.
// Colors mirror what the category's markers actually render on the map
// (FIELD GLASS retune, feedback round 1) so legend and map read the same.
export const POI_CATEGORIES: PoiCategoryMeta[] = [
  { id: "extract", label: "Extractions", defaultOn: true, color: "#45C878" },
  { id: "transit", label: "Transits", defaultOn: true, color: "#4FB8D8" },
  { id: "hazard", label: "Hazards", defaultOn: true, color: "#E05252" },
  { id: "boss", label: "Bosses", defaultOn: true, color: "#E05252" },
  { id: "spawn", label: "Spawns", defaultOn: false, color: "#D89A4A" },
  { id: "loot", label: "Loot containers", defaultOn: false, color: "#9BA08F" },
  { id: "custom", label: "My markers", defaultOn: true, color: "#4FB8D8" },
];

export const POI_CATEGORY_MAP: Record<PoiCategory, PoiCategoryMeta> =
  Object.fromEntries(POI_CATEGORIES.map((c) => [c.id, c])) as Record<
    PoiCategory,
    PoiCategoryMeta
  >;

// ---- Marker palette (FIELD GLASS retune of Moacir's 2026-05-30 five-color
// spec — roles unchanged, hues harmonized; superseded per his 2026-06-12
// feedback "redo markers to fit the new style") -----------------------------
// Markers fill the glyph with one of these and draw a warm-ink outline
// (#101208) around it — see .tc-poi-glyph in App.css.
export const MARKER_COLORS = {
  Y: "#E8C254", // quest gold — QUEST markers (see MarkerLayer; scroll icon)
  G: "#45C878", // green      — PMC / friendly / medical
  B: "#4FB8D8", // ice blue   — transit / custom markers
  O: "#D89A4A", // amber      — scav / generic loot
  R: "#E05252", // signal red — danger: sniper / cultist / boss / hazard
} as const;

// ---- Glyph resolution (keyed by facet) --------------------------------------
// Single source of truth for which SVG glyph + color each marker type uses.
// Keyed by the facet key (see facets.facetKeyOf) so markers AND the filter-panel
// swatches stay in sync. Swap any value here; nothing else changes.
const FACET_ICON: Record<string, string> = {
  // Extractions (transit folds in here — it's an extraction type)
  "extract:pmc": signOutSvg,
  "extract:scav": signOutSvg,
  transit: signOutSvg,
  // Spawns
  "spawn:pmc": arrowSquareDownSvg,
  "spawn:scav": arrowSquareDownSvg,
  "spawn:sniper": crosshairSvg,
  cultist: knifeSvg,
  boss: skullSvg,
  // Hazards
  hazard: warningSvg,
  // Loot containers
  "loot:ammo": packageSvg,
  "loot:bag": bagSvg,
  "loot:cash": cashRegisterSvg,
  "loot:computer": cpuSvg,
  "loot:container": archiveSvg,
  "loot:stash": coinSvg,
  "loot:jacket": shirtSvg,
  "loot:medbag": firstAidSvg,
  "loot:other": boxOpenSvg,
  "loot:safe": vaultSvg,
  "loot:weapon": swordSvg,
  // Custom markers
  custom: mapPinSvg,
};

// Marker fill color per facet key (outline is always #101208, set in CSS).
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

// Quest objective pins (own + squadmates') — yellow scroll, per Moacir's spec.
export const QUEST_GLYPH_SVG = scrollSvg;

const DEFAULT_ICON = circleSvg;
const DEFAULT_COLOR = MARKER_COLORS.O;

// Raw SVG markup for a facet key. Falls back to the category's default
// (loot:* → box, etc.) and finally a plain dot, so an unmapped subtype still
// renders. Embed inside a `.tc-poi-glyph` element with inline `color`.
export function svgForFacet(facetKey: string): string {
  const hit = FACET_ICON[facetKey];
  if (hit) return hit;
  if (facetKey.startsWith("loot:")) return boxOpenSvg;
  if (facetKey.startsWith("extract:")) return signOutSvg;
  if (facetKey.startsWith("spawn:")) return arrowSquareDownSvg;
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
