import React from "react";
import type { MapFloor } from "./floorClassify";

export const ALL_FLOORS = "all";

// Switcher labels drop the redundant "Floor" word: "3rd Floor" -> "3rd". Names
// without it (Ground, Bunkers, Customs' "4F"/"3F") pass through unchanged.
function shortLabel(name: string): string {
  return name.replace(/\s*Floor$/i, "");
}

interface FloorSwitcherProps {
  floors: MapFloor[];
  activeFloorId: string;
  counts: Record<string, number>;
  // When true, the active floor is being driven by the player's live position.
  autoFollow: boolean;
  onSelect: (id: string) => void;
  // Re-enable auto-follow (snaps back to the player's current floor).
  onAuto: () => void;
}

export default function FloorSwitcher({
  floors,
  activeFloorId,
  counts,
  autoFollow,
  onSelect,
  onAuto,
}: FloorSwitcherProps): React.JSX.Element | null {
  if (!floors || floors.length === 0) return null;

  const total = counts[ALL_FLOORS] ?? 0;

  return (
    <div className="floor-switcher">
      <button
        type="button"
        className={`floor-switcher-btn floor-switcher-auto${autoFollow ? " active" : ""}`}
        onClick={onAuto}
        title="Follow my current floor automatically"
      >
        Auto
      </button>
      <button
        type="button"
        className={`floor-switcher-btn${!autoFollow && activeFloorId === ALL_FLOORS ? " active" : ""}`}
        onClick={() => onSelect(ALL_FLOORS)}
      >
        All ({total})
      </button>
      {floors.map((f) => {
        const n = counts[f.id] ?? 0;
        const active = activeFloorId === f.id;
        return (
          <button
            key={f.id}
            type="button"
            className={`floor-switcher-btn${active ? " active" : ""}`}
            onClick={() => onSelect(f.id)}
          >
            {shortLabel(f.name)} ({n})
          </button>
        );
      })}
    </div>
  );
}
