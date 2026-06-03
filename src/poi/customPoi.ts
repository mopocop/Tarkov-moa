import type { Poi } from "./types";
import type { WireMarker } from "../../shared/squadProtocol";

const STORAGE_KEY = "tc_custom_pois_v1";
export const CUSTOM_POI_SCHEMA_VERSION = 1;

export interface CustomPoiStore {
  schemaVersion: number;
  pois: Poi[];
}

function isUserPoi(p: unknown): p is Poi {
  return (
    !!p &&
    typeof (p as Poi).id === "string" &&
    (p as Poi).category === "custom" &&
    !!(p as Poi).position
  );
}

export function loadCustomPois(): Poi[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<CustomPoiStore>;
    return Array.isArray(parsed.pois) ? parsed.pois.filter(isUserPoi) : [];
  } catch {
    return [];
  }
}

export function saveCustomPois(pois: Poi[]): void {
  try {
    const store: CustomPoiStore = {
      schemaVersion: CUSTOM_POI_SCHEMA_VERSION,
      pois,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

export function addCustomPoi(pois: Poi[], poi: Poi): Poi[] {
  return [...pois, poi];
}

export function updateCustomPoi(
  pois: Poi[],
  id: string,
  patch: Partial<Poi>,
): Poi[] {
  return pois.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p));
}

export function removeCustomPoi(pois: Poi[], id: string): Poi[] {
  return pois.filter((p) => p.id !== id);
}

// Edge mapper: project a local Poi onto the import-free wire shape (drops
// `source`; the receiver re-tags it as a squad marker). Keeps squadProtocol.ts
// from ever importing client types.
export function poiToWireMarker(p: Poi): WireMarker {
  return {
    id: p.id,
    mapId: p.mapId,
    category: p.category,
    subtype: p.subtype,
    position: p.position,
    label: p.label,
    note: p.note,
    color: p.color,
    meta: p.meta,
  };
}

export function newCustomPoi(
  mapId: string,
  x: number,
  z: number,
  opts?: { label?: string; color?: string; note?: string; gridRef?: string },
): Poi {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    category: "custom",
    subtype: "custom",
    mapId,
    position: { x, y: 0, z },
    label: opts?.label?.trim() || "Marker",
    note: opts?.note,
    color: opts?.color,
    source: "user",
    meta: { gridRef: opts?.gridRef, createdAt: Date.now() },
  };
}
