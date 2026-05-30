// EFT log emits location strings like "bigmap", "Woods". Map them to
// tarkov.dev's Map.id (used by MapView's MAPS keys). Compare case-insensitively.
//
// v0.3 ships Customs + Woods. Other entries are listed for forward-compat so
// raid-end on a non-shipped map is a no-op (returns undefined) instead of
// crashing — when those maps are added later, the mapping is already correct.

const LOG_LOCATION_TO_MAP_ID: Record<string, string> = {
  bigmap: '56f40101d2720b2a4d8b45d6',           // Customs
  woods: '5704e3c2d2720bac5b8b4567',            // Woods
  // Below: known EFT internal names, UUIDs to fill when maps are added in v0.4+
  // factory4_day: '',
  // factory4_night: '',
  // shoreline: '',
  // interchange: '',
  // rezervbase: '',
  // lighthouse: '',
  // tarkovstreets: '',
  // sandbox: '',
  // sandbox_high: '',
  // laboratory: '',
};

export function mapIdFromLogLocation(location: string): string | undefined {
  if (!location) return undefined;
  return LOG_LOCATION_TO_MAP_ID[location.toLowerCase()];
}