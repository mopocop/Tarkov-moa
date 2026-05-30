import React from "react";
import type { DerivedQuestState } from "../quests/derive";
import { resolveMapName } from "../quests/mapNames";
import { SUPPORTED_MAP_NAMES } from "../map/MapView";

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
  // Always offer every supported map for QA, plus any map that happens to have
  // active quests but isn't in the static list (defensive — shouldn't happen).
  const mapIds = Array.from(
    new Set([
      ...Object.keys(SUPPORTED_MAP_NAMES),
      ...Object.keys(availableObjectivesByMap),
      ...Object.keys(availableTasksByMap),
    ]),
  );

  const rows = mapIds
    .map((id) => ({
      id,
      name:
        SUPPORTED_MAP_NAMES[id] ??
        resolveMapName(id, availableTasksByMap, availableObjectivesByMap),
      count: availableTasksByMap[id]?.length ?? 0,
    }))
    // Maps with active quests first, then alphabetical.
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  if (rows.length === 0) {
    return <p className="muted">No supported maps.</p>;
  }

  return (
    <select
      className="map-picker-select"
      value={selectedMapId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
    >
      {rows.map((row) => (
        <option key={row.id} value={row.id}>
          {row.name} ({row.count} {row.count === 1 ? "quest" : "quests"})
        </option>
      ))}
    </select>
  );
}
