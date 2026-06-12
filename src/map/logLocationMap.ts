// EFT log emits location strings like "bigmap", "Woods". Map them to
// tarkov.dev's Map.id (used by MapView's MAPS keys). Compare case-insensitively.
//
// v0.3 ships Customs + Woods. Other entries are listed for forward-compat so
// raid-end on a non-shipped map is a no-op (returns undefined) instead of
// crashing — when those maps are added later, the mapping is already correct.

// Values are CANONICAL tarkov.dev Map.ids (see canonicalMap.ts). Day/night and
// level-gated variants resolve to the same physical map.
const LOG_LOCATION_TO_MAP_ID: Record<string, string> = {
  bigmap: '56f40101d2720b2a4d8b45d6',           // Customs
  woods: '5704e3c2d2720bac5b8b4567',            // Woods
  factory4_day: '55f2d3fd4bdc2d5f408b4567',     // Factory
  factory4_night: '55f2d3fd4bdc2d5f408b4567',   // Night Factory -> Factory
  shoreline: '5704e554d2720bac5b8b456e',        // Shoreline
  interchange: '5714dbc024597771384a510d',      // Interchange
  rezervbase: '5704e5fad2720bac5b8b4567',       // Reserve
  lighthouse: '5704e4dad2720bb55b8b4567',       // Lighthouse
  tarkovstreets: '5714dc692459777137212e12',    // Streets of Tarkov
  sandbox: '653e6760052c01c1c805532f',          // Ground Zero
  sandbox_high: '653e6760052c01c1c805532f',     // Ground Zero 21+ -> Ground Zero
  laboratory: '5b0fc42d86f7744a585f9105',       // The Lab
  terminal: '6925a2c38bdebd9e2302692e',         // Terminal
};

export function mapIdFromLogLocation(location: string): string | undefined {
  if (!location) return undefined;
  return LOG_LOCATION_TO_MAP_ID[location.toLowerCase()];
}