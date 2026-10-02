// Fake player position — moves your own arrow without opening the game.
//
// The app reads your position from the FILENAME of each EFT screenshot (see
// src-tauri/src/screenshots.rs). This writes empty .png files with that name
// format into the screenshots folder; the app parses the name, moves your
// arrow, and deletes the file, exactly as it does for a real screenshot.
//
//   node scripts/fake-position.mjs [x] [z] [radius] [intervalMs] [y] [dir]
//
// Args (use "-" to skip and take the default):
//   x, z        center of the walk, in game coordinates   default 60, -30
//   radius      the arrow walks a circle of this radius   default 25
//   intervalMs  ms between positions                      default 5000
//   y           height (picks the floor on multi-level maps) default 1.0
//   dir         screenshots folder   default <Documents>\Escape from Tarkov\Screenshots
//
// Select the map in the app yourself: without a raid-started log line the app
// does not know which map you are "in", so it draws on the one on screen.

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const arg = (i, def) => {
  const v = process.argv[i];
  return v === undefined || v === "-" ? def : v;
};
const cx = Number(arg(2, 60));
const cz = Number(arg(3, -30));
const radius = Number(arg(4, 25));
const intervalMs = Number(arg(5, 5000));
const y = Number(arg(6, 1));
const dir = arg(7, join(homedir(), "Documents", "Escape from Tarkov", "Screenshots"));

mkdirSync(dir, { recursive: true });

const pad = (n) => String(n).padStart(2, "0");
let step = 0;

function emit() {
  const t = step++ * 0.25;
  const x = cx + Math.cos(t) * radius;
  const z = cz + Math.sin(t) * radius;
  // Face along the direction of travel. EFT is Y-up; the app derives yaw from
  // the quaternion as atan2(2(qw·qy + qx·qz), 1 − 2(qy² + qz²)).
  const yaw = Math.atan2(-Math.sin(t), Math.cos(t));
  const qy = Math.sin(yaw / 2);
  const qw = Math.cos(yaw / 2);
  const d = new Date();
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
  const name =
    `${date}[${time}]_${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}_` +
    `0.00000, ${qy.toFixed(5)}, 0.00000, ${qw.toFixed(5)}_0.00 (${step}).png`;
  writeFileSync(join(dir, name), "");
  console.log(`[fake-position] ${x.toFixed(1)}, ${z.toFixed(1)}`);
}

console.log(`[fake-position] writing to ${dir} every ${intervalMs}ms`);
emit();
setInterval(emit, intervalMs);
