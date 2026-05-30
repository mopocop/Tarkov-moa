import type { DerivedQuestState } from "./derive";

export function resolveMapName(
  mapId: string,
  tasksByMap: DerivedQuestState["availableTasksByMap"],
  objsByMap: DerivedQuestState["availableObjectivesByMap"],
): string {
  for (const t of tasksByMap[mapId] ?? []) {
    if (t.map?.id === mapId && t.map.name) return t.map.name;
  }
  for (const entry of objsByMap[mapId] ?? []) {
    const o = entry.objective;
    const fromMaps = o.maps?.find((m) => m.id === mapId)?.name;
    if (fromMaps) return fromMaps;
    const fromZones = o.zones?.find((z) => z.map?.id === mapId)?.map?.name;
    if (fromZones) return fromZones;
    const fromLoc = o.possibleLocations?.find((l) => l.map.id === mapId)?.map.name;
    if (fromLoc) return fromLoc;
  }
  return "Unknown map";
}
