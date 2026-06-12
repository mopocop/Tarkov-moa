import React from "react";
import { CrosshairSimple, Stack } from "@phosphor-icons/react";
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

// Floating floor dock on the rail side of the map. AUTO is a live-tracking
// state (phosphor green), manual floors are brass when active. Counts are the
// number of visible quest objectives per floor.
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
        className={`floor-switcher-btn floor-switcher-auto${autoFollow ? " live" : ""}`}
        onClick={onAuto}
        title="Follow my current floor automatically"
        aria-pressed={autoFollow}
      >
        <CrosshairSimple weight="bold" />
        <span>Auto</span>
        {autoFollow && <span className="floor-live-dot" />}
      </button>
      <div className="floor-switcher__rule" />
      <button
        type="button"
        className={`floor-switcher-btn${!autoFollow && activeFloorId === ALL_FLOORS ? " active" : ""}`}
        onClick={() => onSelect(ALL_FLOORS)}
      >
        <Stack weight="bold" />
        <span>All</span>
        <span className="floor-count">{total}</span>
      </button>
      {floors.map((f) => {
        const n = counts[f.id] ?? 0;
        const active = activeFloorId === f.id;
        return (
          <button
            key={f.id}
            type="button"
            className={`floor-switcher-btn${active ? " active" : ""}${n === 0 ? " empty" : ""}`}
            onClick={() => onSelect(f.id)}
          >
            <span className="floor-name">{shortLabel(f.name)}</span>
            <span className="floor-count">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
