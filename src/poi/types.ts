export type PoiCategory =
  | "extract"
  | "transit"
  | "spawn"
  | "boss"
  | "hazard"
  | "loot"
  | "custom";

export type PoiSource = "tarkov-dev" | "user";

export interface PoiPosition {
  x: number;
  y: number;
  z: number;
}

// Unified point-of-interest model. Serves BOTH tarkov.dev-derived POIs and
// user-placed custom markers, and doubles as the wire format for a future P2P
// sync layer (keyed by mapId + game coords so two clients agree on a location).
export interface Poi {
  id: string; // tarkov.dev id, or crypto.randomUUID() for custom markers
  category: PoiCategory;
  subtype?: string; // extract faction/flag, hazard type, loot bucket, boss name, ...
  mapId: string; // tarkov.dev Map.id (matches MapView MAPS keys)
  position: PoiPosition;
  label: string;
  note?: string; // requirements/conditions (extract/transit) or user note
  color?: string; // optional per-marker color override (custom markers)
  source: PoiSource;
  meta?: Record<string, unknown>; // faction, chance, destMapId, switches, ...
}
