import { useCallback, useEffect, useState } from 'react';

// Width of the rail panel (the column beside the spine), dragged by the user
// via RailResizer and remembered across launches.
const RAIL_WIDTH_KEY = 'tc_rail_width';
export const RAIL_WIDTH_DEFAULT = 356;
export const RAIL_WIDTH_MIN = 200;
export const RAIL_WIDTH_MAX = 640;

export function clampRailWidth(w: number): number {
  return Math.round(Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, w)));
}

export function useRailWidth() {
  const [width, setWidthRaw] = useState<number>(() => {
    const raw = Number(localStorage.getItem(RAIL_WIDTH_KEY));
    return Number.isFinite(raw) && raw > 0 ? clampRailWidth(raw) : RAIL_WIDTH_DEFAULT;
  });

  useEffect(() => {
    localStorage.setItem(RAIL_WIDTH_KEY, String(width));
  }, [width]);

  const setWidth = useCallback((w: number) => setWidthRaw(clampRailWidth(w)), []);
  const reset = useCallback(() => setWidthRaw(RAIL_WIDTH_DEFAULT), []);

  return { width, setWidth, reset };
}
