import type { Poi } from "./types";
import { facetKeyOf, allFacetDefaults, facetDefaultOn } from "./facets";

// Filter prefs are now facet-keyed (see facets.ts). `enabled` maps a facet key
// → on/off; a key absent from the map falls back to its registry default via
// facetDefaultOn (so newly-appearing loot buckets behave sensibly).
export interface PoiFilterState {
  enabled: Record<string, boolean>;
  gridVisible: boolean;
}

// v4: default-on set narrowed again to PMC extractions + My markers only (quests
// render separately and are always on). Filters are persisted explicitly via
// "Save as default" rather than auto-saved. Bumping the key gives existing users
// the new defaults instead of their saved v3 prefs.
const STORAGE_KEY = "tc_poi_filters_v4";

export function defaultFilterState(): PoiFilterState {
  return { enabled: allFacetDefaults(), gridVisible: false };
}

export function loadFilterState(): PoiFilterState {
  const def = defaultFilterState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<PoiFilterState>;
    return {
      enabled: { ...def.enabled, ...(p.enabled ?? {}) },
      gridVisible: typeof p.gridVisible === "boolean" ? p.gridVisible : false,
    };
  } catch {
    return def;
  }
}

export function saveFilterState(s: PoiFilterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota errors
  }
}

// The predicate App hands to <PoiLayer isVisible={...}>. Pure. A facet absent
// from `enabled` defaults to its registry default-on value.
export function isPoiVisible(poi: Poi, s: PoiFilterState): boolean {
  const key = facetKeyOf(poi);
  const v = s.enabled[key];
  return v === undefined ? facetDefaultOn(key) : v;
}
