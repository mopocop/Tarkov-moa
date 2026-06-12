// Faceted filtering model. A "facet" is the smallest user-togglable bucket
// (e.g. "extract:pmc", "loot:medbag", "boss"). Each POI maps deterministically
// to exactly one facet via facetKeyOf() — the same world object always yields
// the same facet, which keeps filtering P2P-safe (two clients agree on buckets).
//
// This drives BOTH the filter predicate (filterState.isPoiVisible) and the
// grouped sidebar panel (PoiFilterPanel via buildFacetGroups).
import type { Poi } from "./types";
import { svgForFacet, colorForFacet } from "./registry";

// ---- Facet derivation ------------------------------------------------------
// Maps a POI to its facet key. Extract faction "shared" folds into pmc (a
// co-op/shared exit is reachable by PMCs); spawn subtype "all" folds into scav.
export function facetKeyOf(poi: Poi): string {
  switch (poi.category) {
    case "extract": {
      const f = (typeof poi.meta?.faction === "string" ? poi.meta.faction : "shared").toLowerCase();
      return f === "scav" ? "extract:scav" : "extract:pmc";
    }
    case "transit":
      return "transit";
    case "hazard":
      return "hazard";
    case "boss":
      return poi.subtype === "cultist" ? "cultist" : "boss";
    case "spawn": {
      const s = poi.subtype ?? "all";
      if (s === "pmc") return "spawn:pmc";
      if (s === "sniper") return "spawn:sniper";
      return "spawn:scav"; // scav + "all" + anything else
    }
    case "loot":
      return `loot:${poi.subtype ?? "other"}`;
    case "custom":
      return "custom";
    default:
      return poi.category;
  }
}

// ---- Facet + group metadata ------------------------------------------------
export interface FacetMeta {
  key: string;
  label: string;
  color: string;
  defaultOn: boolean;
}

// Static facets (everything except dynamic per-bucket loot facets).
// defaultOn set (Moacir, 2026-05-30): only PMC extractions + My markers start on
// (quests render separately and are always on). Everything else defaults off.
// Colors here are unused for display now — colorForFacet() drives swatches/markers.
const STATIC_FACETS: FacetMeta[] = [
  { key: "extract:pmc", label: "PMC", color: "#22c55e", defaultOn: true },
  { key: "extract:scav", label: "Scav", color: "#f59e0b", defaultOn: false },
  { key: "spawn:pmc", label: "PMC", color: "#eab308", defaultOn: false },
  { key: "spawn:scav", label: "Scav", color: "#ca8a04", defaultOn: false },
  { key: "spawn:sniper", label: "Sniper Scav", color: "#dc2626", defaultOn: false },
  { key: "boss", label: "Boss", color: "#a855f7", defaultOn: false },
  { key: "cultist", label: "Cultist", color: "#7c3aed", defaultOn: false },
  { key: "transit", label: "Transit", color: "#06b6d4", defaultOn: false },
  { key: "hazard", label: "Hazards", color: "#f97316", defaultOn: false },
  { key: "custom", label: "My markers", color: "#ec4899", defaultOn: true },
];

const STATIC_FACET_BY_KEY: Record<string, FacetMeta> = Object.fromEntries(
  STATIC_FACETS.map((f) => [f.key, f]),
);

// Loot buckets (subtypes produced by fromTarkovDev.lootBucket) → display label.
const LOOT_BUCKET_LABELS: Record<string, string> = {
  medbag: "Medbag / Aid",
  ammo: "Ammo / Grenade",
  safe: "Safe",
  computer: "Computer / Tech",
  cash: "Cash register",
  weapon: "Weapon rack",
  jacket: "Jacket",
  bag: "Bag / Duffle",
  container: "Crate / Box",
  stash: "Stash / Cache",
  other: "Other",
};

function lootFacetMeta(bucket: string): FacetMeta {
  const key = `loot:${bucket}`;
  return {
    key,
    label: LOOT_BUCKET_LABELS[bucket] ?? bucket,
    color: colorForFacet(key),
    defaultOn: false,
  };
}

// Display grouping. Loot is appended dynamically (its facets depend on the
// map). Order here is the panel's render order.
const GROUP_DEFS: { id: string; label: string; keys: string[] }[] = [
  // Transit is an extraction type — it lives in the Extractions group.
  { id: "extract", label: "Extractions", keys: ["extract:pmc", "extract:scav", "transit"] },
  { id: "spawn", label: "Spawns", keys: ["spawn:pmc", "spawn:scav", "spawn:sniper", "boss", "cultist"] },
  { id: "world", label: "Hazards", keys: ["hazard"] },
];

// ---- Defaults --------------------------------------------------------------
// Default on/off for a facet key. Loot + spawn default off (clutter); the rest
// default on. Used both to seed filter state and to resolve facets absent from
// stored prefs (e.g. a new loot bucket after a tarkov.dev data update).
export function facetDefaultOn(key: string): boolean {
  const m = STATIC_FACET_BY_KEY[key];
  if (m) return m.defaultOn;
  return false; // loot + anything unmapped: off by default (minimal default set)
}

// Seed map for defaultFilterState — only the static facets (loot facets get
// resolved lazily via facetDefaultOn when first encountered).
export function allFacetDefaults(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of STATIC_FACETS) out[f.key] = f.defaultOn;
  return out;
}

// ---- Panel view model ------------------------------------------------------
export interface FacetView {
  key: string;
  label: string;
  color: string;
  icon: string; // FontAwesome class for the swatch
  count: number;
  defaultOn: boolean;
}
export interface FacetGroupView {
  id: string;
  label: string;
  facets: FacetView[];
}

// Build the grouped, counted facet tree for the current map's POIs (pass the
// tarkov-dev POIs plus the map's custom markers so the "My markers" count is
// accurate). Only facets with at least one POI are emitted — except "custom",
// which always shows so the user can find the toggle even with zero markers.
export function buildFacetGroups(pois: Poi[]): FacetGroupView[] {
  const counts = new Map<string, number>();
  for (const p of pois) {
    const k = facetKeyOf(p);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const groups: FacetGroupView[] = [];
  for (const g of GROUP_DEFS) {
    const facets: FacetView[] = [];
    for (const key of g.keys) {
      const count = counts.get(key) ?? 0;
      if (count === 0) continue;
      const m = STATIC_FACET_BY_KEY[key];
      facets.push({ key, label: m.label, color: colorForFacet(key), icon: svgForFacet(key), count, defaultOn: m.defaultOn });
    }
    if (facets.length) groups.push({ id: g.id, label: g.label, facets });
  }

  // Loot containers — dynamic per-bucket facets, alphabetical.
  const lootKeys = Array.from(counts.keys())
    .filter((k) => k.startsWith("loot:"))
    .sort();
  if (lootKeys.length) {
    groups.push({
      id: "loot",
      label: "Loot containers",
      facets: lootKeys.map((key) => {
        const m = lootFacetMeta(key.slice("loot:".length));
        return { key, label: m.label, color: m.color, icon: svgForFacet(key), count: counts.get(key) ?? 0, defaultOn: m.defaultOn };
      }),
    });
  }

  // My markers — always present so the toggle is discoverable.
  const customMeta = STATIC_FACET_BY_KEY["custom"];
  groups.push({
    id: "custom",
    label: "My markers",
    facets: [
      {
        key: "custom",
        label: customMeta.label,
        color: colorForFacet("custom"),
        icon: svgForFacet("custom"),
        count: counts.get("custom") ?? 0,
        defaultOn: customMeta.defaultOn,
      },
    ],
  });

  return groups;
}
