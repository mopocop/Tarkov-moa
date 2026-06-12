import React from "react";
import type { DerivedQuestState } from "../quests/derive";
import { resolveMapName } from "../quests/mapNames";
import { SUPPORTED_MAP_NAMES } from "../map/MapView";
import { canonicalMapId } from "../map/canonicalMap";

export interface MapRow {
  id: string;
  name: string;
  count: number;
}

// One row per supported physical map (variant UUIDs collapse to canonical),
// plus any quest-bearing map missing from the static list (defensive). Shared
// by the rail's pinned picker and the deployment-board empty state.
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

interface MapPickerProps {
  availableObjectivesByMap: DerivedQuestState["availableObjectivesByMap"];
  availableTasksByMap: DerivedQuestState["availableTasksByMap"];
  selectedMapId: string | null;
  onSelect: (mapId: string) => void;
}

export default function MapPicker({
  availableObjectivesByMap,
  availableTasksByMap,
  selectedMapId,
  onSelect,
}: MapPickerProps): React.JSX.Element {
  const rows = buildMapRows(availableObjectivesByMap, availableTasksByMap);

  if (rows.length === 0) {
    return <p className="muted">No supported maps.</p>;
  }

  return (
    <select
      className="map-picker-select"
      value={selectedMapId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
    >
      {selectedMapId === null && (
        <option value="" disabled>
          Select a map…
        </option>
      )}
      {rows.map((row) => (
        <option key={row.id} value={row.id}>
          {row.name} ({row.count} {row.count === 1 ? "quest" : "quests"})
        </option>
      ))}
    </select>
  );
}
