// Pure reference-grid math. No app imports -> trivially unit-testable.
//
// A grid divides a map's game-coord bounds into cols x rows cells labeled
// A1, B1, ... (columns = letters along game X, rows = numbers along game Z).
// Flip flags correct orientation so "A1" reads at the TOP-LEFT of what the
// player sees: all current maps render with coordinateRotation 180 (a point
// reflection), so both axes are flipped.

export interface MapGrid {
  cols: number;
  rows: number;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  flipX: boolean;
  flipZ: boolean;
}

export function makeGrid(
  boundsRaw: [[number, number], [number, number]],
  rotation: number,
  cols = 10,
): MapGrid {
  const [a, b] = boundsRaw;
  const xMin = Math.min(a[0], b[0]);
  const xMax = Math.max(a[0], b[0]);
  const zMin = Math.min(a[1], b[1]);
  const zMax = Math.max(a[1], b[1]);
  const safeCols = Math.max(1, Math.round(cols));
  const cell = (xMax - xMin) / safeCols;
  const rows = Math.max(1, Math.round((zMax - zMin) / (cell || 1)));
  const flip = rotation === 180;
  return { cols: safeCols, rows, xMin, xMax, zMin, zMax, flipX: flip, flipZ: flip };
}

const CHAR_A = 65;
export function colLabel(col: number): string {
  let n = col;
  let s = "";
  do {
    s = String.fromCharCode(CHAR_A + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function clampIdx(i: number, max: number): number {
  return Math.min(max, Math.max(0, i));
}

export function cellIndex(
  grid: MapGrid,
  x: number,
  z: number,
): { col: number; row: number } {
  let u = (x - grid.xMin) / (grid.xMax - grid.xMin || 1);
  let v = (z - grid.zMin) / (grid.zMax - grid.zMin || 1);
  if (grid.flipX) u = 1 - u;
  if (grid.flipZ) v = 1 - v;
  return {
    col: clampIdx(Math.floor(u * grid.cols), grid.cols - 1),
    row: clampIdx(Math.floor(v * grid.rows), grid.rows - 1),
  };
}

export function cellLabelAt(grid: MapGrid, x: number, z: number): string {
  const { col, row } = cellIndex(grid, x, z);
  return `${colLabel(col)}${row + 1}`;
}

export function gridLineCoords(grid: MapGrid): { xs: number[]; zs: number[] } {
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i <= grid.cols; i++) {
    xs.push(grid.xMin + (i * (grid.xMax - grid.xMin)) / grid.cols);
  }
  for (let j = 0; j <= grid.rows; j++) {
    zs.push(grid.zMin + (j * (grid.zMax - grid.zMin)) / grid.rows);
  }
  return { xs, zs };
}

export function cellCenterGame(
  grid: MapGrid,
  screenCol: number,
  screenRow: number,
): { x: number; z: number; label: string } {
  let u = (screenCol + 0.5) / grid.cols;
  let v = (screenRow + 0.5) / grid.rows;
  const label = `${colLabel(screenCol)}${screenRow + 1}`;
  if (grid.flipX) u = 1 - u;
  if (grid.flipZ) v = 1 - v;
  return {
    x: grid.xMin + u * (grid.xMax - grid.xMin),
    z: grid.zMin + v * (grid.zMax - grid.zMin),
    label,
  };
}
