export type BoundsBox = { xMin: number; xMax: number; zMin: number; zMax: number };

export interface MapExtent {
  heightMin: number;
  heightMax: number;
  bounds: BoundsBox[];
  regions?: string[];
}

export interface MapFloor {
  id: string;
  name: string;
  extents?: MapExtent[];
}

export const GROUND_FLOOR_ID = "ground";

export function isInBounds(x: number, z: number, b: BoundsBox): boolean {
  return x >= b.xMin && x <= b.xMax && z >= b.zMin && z <= b.zMax;
}

function matchesExtent(x: number, y: number, z: number, e: MapExtent): boolean {
  if (y < e.heightMin || y >= e.heightMax) return false;
  return e.bounds.some((b) => isInBounds(x, z, b));
}

// Returns the floor id a marker at (x, y, z) belongs to. Non-ground floors are
// tested in array order; first match wins. If no non-ground floor matches, the
// marker falls through to GROUND_FLOOR_ID. Ordering of the floors array
// determines tie-break for overlapping extents (e.g., upper floors first).
export function classifyMarker(
  x: number,
  y: number,
  z: number,
  floors: MapFloor[],
): string {
  for (const f of floors) {
    if (f.id === GROUND_FLOOR_ID) continue;
    if (!f.extents || f.extents.length === 0) continue;
    for (const e of f.extents) {
      if (matchesExtent(x, y, z, e)) return f.id;
    }
  }
  return GROUND_FLOOR_ID;
}

// Normalize a tarkov-dev raw bounds entry [[xA, zA], [xB, zB], regionTag?]
// into a BoundsBox. Corner ordering in the source is not consistent.
export function normalizeBounds(
  cornerA: [number, number],
  cornerB: [number, number],
): BoundsBox {
  return {
    xMin: Math.min(cornerA[0], cornerB[0]),
    xMax: Math.max(cornerA[0], cornerB[0]),
    zMin: Math.min(cornerA[1], cornerB[1]),
    zMax: Math.max(cornerA[1], cornerB[1]),
  };
}
