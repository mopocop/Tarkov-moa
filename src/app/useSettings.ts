import { useEffect, useState } from 'react';

// Which screen side the Operator Rail lives on. People run this app on a
// secondary monitor — left rail suits a monitor right of the primary, and
// vice versa. Chosen during onboarding, changeable in Settings.
const RAIL_SIDE_KEY = 'tc_rail_side';
export type RailSide = 'left' | 'right';

// Screenshot follow-cam: center the map on each fresh position (default ON)
// at this zoom. Offered in onboarding, changeable in Settings.
const FOLLOW_CENTER_KEY = 'tc_follow_center';
const FOLLOW_ZOOM_KEY = 'tc_follow_zoom';
export const FOLLOW_ZOOM_DEFAULT = 1;
// When '1', the floor switcher is hidden and floor tracking is locked to AUTO.
const FLOOR_LOCK_KEY = 'tc_floor_lock';

// User preferences that persist across launches, each written back to
// localStorage whenever it changes.
export function useSettings() {
  const [railSide, setRailSide] = useState<RailSide>(() =>
    localStorage.getItem(RAIL_SIDE_KEY) === 'right' ? 'right' : 'left',
  );
  const [followCenter, setFollowCenter] = useState<boolean>(
    () => localStorage.getItem(FOLLOW_CENTER_KEY) !== '0',
  );
  const [followZoom, setFollowZoom] = useState<number>(() => {
    const raw = Number(localStorage.getItem(FOLLOW_ZOOM_KEY));
    return Number.isFinite(raw) && localStorage.getItem(FOLLOW_ZOOM_KEY) !== null
      ? raw
      : FOLLOW_ZOOM_DEFAULT;
  });
  const [floorLock, setFloorLock] = useState<boolean>(
    () => localStorage.getItem(FLOOR_LOCK_KEY) === '1',
  );

  useEffect(() => {
    localStorage.setItem(RAIL_SIDE_KEY, railSide);
  }, [railSide]);
  useEffect(() => {
    localStorage.setItem(FOLLOW_CENTER_KEY, followCenter ? '1' : '0');
  }, [followCenter]);
  useEffect(() => {
    localStorage.setItem(FOLLOW_ZOOM_KEY, String(followZoom));
  }, [followZoom]);
  useEffect(() => {
    localStorage.setItem(FLOOR_LOCK_KEY, floorLock ? '1' : '0');
  }, [floorLock]);

  return {
    railSide,
    setRailSide,
    followCenter,
    setFollowCenter,
    followZoom,
    setFollowZoom,
    floorLock,
    setFloorLock,
  };
}
