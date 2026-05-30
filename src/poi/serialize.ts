import type { Poi } from "./types";

// Reserved boundary for a future P2P sync layer. Custom POIs are already the
// wire format; this versions + validates a transferable bundle.
export const POI_WIRE_VERSION = 1;

export interface PoiBundle {
  v: number;
  pois: Poi[];
}

export function serializePois(pois: Poi[]): string {
  return JSON.stringify({ v: POI_WIRE_VERSION, pois } as PoiBundle);
}

export function deserializePois(json: string): Poi[] {
  try {
    const b = JSON.parse(json) as Partial<PoiBundle>;
    if (!b || !Array.isArray(b.pois)) return [];
    return b.pois.filter(
      (p): p is Poi =>
        !!p &&
        typeof p.id === "string" &&
        typeof p.mapId === "string" &&
        !!p.position,
    );
  } catch {
    return [];
  }
}
