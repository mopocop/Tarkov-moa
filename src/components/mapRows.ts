// Shared map-row helpers used by the rail's pinned picker, the deployment-board
// empty state, and App. Kept out of MapPicker.tsx so that file can stay a clean
// fast-refresh boundary (component-only export).
import type { DerivedQuestState } from "../quests/derive";
import { resolveMapName } from "../quests/mapNames";
import { SUPPORTED_MAP_NAMES } from "../map/mapDefs";
import { canonicalMapId } from "../map/canonicalMap";

export interface MapRow {
  id: string;
  name: string;
  count: number;
}

// One row per supported physical map (variant UUIDs collapse to canonical),
// plus any quest-bearing map missing from the static list (defensive).
export function buildMapRows(
  availableObjectivesByMap: DerivedQuestState["availableObjectivesByMap"],
  availableTasksByMap: DerivedQuestState["availableTasksByMap"],
): MapRow[] {
  const mapIds = Array.from(
    new Set(
      [
        ...Object.keys(SUPPORTED_MAP_NAMES),
        ...Object.keys(availableObjectivesByMap),
        ...Object.keys(availableTasksByMap),
      ].map(canonicalMapId),
    ),
  );

  return mapIds
    .map((id) => ({
      id,
      name:
        SUPPORTED_MAP_NAMES[id] ??
        resolveMapName(id, availableTasksByMap, availableObjectivesByMap),
      count: availableTasksByMap[id]?.length ?? 0,
    }))
    // Maps with active quests first, then alphabetical.
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Brass at progressive opacity = a quick read of "how much is here" (Moacir's
// spec): 0 → 25%, 1 → 60%, 2 → 80%, 3+ → 100%.
export function questCountOpacity(count: number): number {
  if (count <= 0) return 0.25;
  if (count === 1) return 0.6;
  if (count === 2) return 0.8;
  return 1;
}
