// Canonical-map resolution.
//
// Some tarkov.dev Map UUIDs are physically the SAME map as another — identical
// geometry and visual asset — split only because BSG gives them a different
// quest pool, level gate, or day/night lighting. Rendering each as its own
// picker row produces confusing duplicates (e.g. three "Ground Zero" rows).
//
// We collapse every variant UUID to a single canonical UUID. Quests from all
// variants merge under the canonical map, and the picker shows one row.
//
// Kept dependency-free (no Leaflet/React) so the pure quest-derive logic and
// its unit tests can import it without pulling in the map renderer.

const GROUND_ZERO = "653e6760052c01c1c805532f";
const FACTORY = "55f2d3fd4bdc2d5f408b4567";

export const CANONICAL_MAP_ID: Record<string, string> = {
  "65b8d6f5cdde2479cb2a3125": GROUND_ZERO, // Ground Zero 21+  -> Ground Zero
  "68236e8153654e8c1200798a": GROUND_ZERO, // Ground Zero Tutorial -> Ground Zero
  "59fc81d786f774390775787e": FACTORY, // Night Factory -> Factory
};

// Returns the canonical UUID for a map, or the id itself if it has no variant.
export function canonicalMapId(id: string): string {
  return CANONICAL_MAP_ID[id] ?? id;
}
