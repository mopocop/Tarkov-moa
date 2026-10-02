import { useCallback, useEffect, useState } from 'react';
import { getMapDef, type MapDef } from '../map/mapDefs';
import { ALL_FLOORS } from '../map/FloorSwitcher';
import { classifyMarker } from '../map/floorClassify';
import type { PlayerPos } from './useGameEvents';

interface Options {
  selectedMapId: string | null;
  selectedMapDef: MapDef | undefined;
  playerPos: PlayerPos | null;
  setFloorLock: (locked: boolean) => void;
}

// Which floor of a multi-level map is showing. By default it follows the
// player's live position; a manual pick pauses that until "Auto" is pressed.
export function useFloors({ selectedMapId, selectedMapDef, playerPos, setFloorLock }: Options) {
  const [activeFloorId, setActiveFloorId] = useState<string>(ALL_FLOORS);
  // When true, the active floor tracks the player's live position. A manual
  // FloorSwitcher click turns it off; the "Auto" button turns it back on.
  const [autoFollowFloor, setAutoFollowFloor] = useState<boolean>(true);
  const [floorCounts, setFloorCounts] = useState<Record<string, number>>({});

  // A new map opens on its own default floor (Interchange opens on Ground, not
  // All), following the player again.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setActiveFloorId(
      (selectedMapId ? getMapDef(selectedMapId)?.defaultFloorId : undefined) ?? ALL_FLOORS,
    );
    setAutoFollowFloor(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedMapId]);

  // Auto-follow: while enabled, drive the active floor from the player's live
  // position. Manual floor selection pauses this (see selectFloor); the
  // "Auto" button resumes it. No-op on maps without floor data.
  useEffect(() => {
    if (!autoFollowFloor) return;
    const floors = selectedMapDef?.floors;
    if (!floors || floors.length === 0 || !playerPos) return;
    // Syncing the active floor to the live player position (external log feed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveFloorId(classifyMarker(playerPos.x, playerPos.y, playerPos.z, floors));
  }, [autoFollowFloor, selectedMapDef, playerPos]);

  const selectFloor = useCallback((id: string) => {
    setAutoFollowFloor(false);
    setActiveFloorId(id);
  }, []);

  const enableAutoFloor = useCallback(() => {
    setAutoFollowFloor(true);
  }, []);

  // Toggling the floor lock also resumes AUTO when locking, so the derived
  // state change lives with the user action instead of cascading from an effect.
  const changeFloorLock = useCallback(
    (locked: boolean) => {
      setFloorLock(locked);
      if (locked) setAutoFollowFloor(true);
    },
    [setFloorLock],
  );

  return {
    activeFloorId,
    autoFollowFloor,
    floorCounts,
    setFloorCounts,
    selectFloor,
    enableAutoFloor,
    changeFloorLock,
  };
}
