// On-map drawing tools — dock floats over the map on the rail side, above the
// zoom dock. Two controls only (Moacir's spec): toggle the pen, and clear all
// your drawings on this map (the eraser icon — per-stroke erasing is gone).

import { PencilSimple, Eraser } from "@phosphor-icons/react";
import type { DrawTool } from "./DrawLayer";

interface MapToolsDockProps {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  /** The local user's ink color (squad color when seated). */
  color: string;
  canClear: boolean;
  onClear: () => void;
}

export default function MapToolsDock({
  tool,
  onTool,
  color,
  canClear,
  onClear,
}: MapToolsDockProps) {
  const penOn = tool === "pen";
  return (
    <div className="tc-tools-dock">
      <button
        type="button"
        aria-label="Draw on the map"
        aria-pressed={penOn}
        title={penOn ? "Stop drawing" : "Draw on the map — shared live with your squad"}
        className={penOn ? "active" : undefined}
        style={penOn ? { color } : undefined}
        onClick={() => onTool(penOn ? null : "pen")}
      >
        <PencilSimple weight={penOn ? "fill" : "regular"} />
      </button>
      <button
        type="button"
        aria-label="Clear your drawings on this map"
        title="Clear your drawings on this map"
        disabled={!canClear}
        onClick={onClear}
      >
        <Eraser weight="regular" />
      </button>
    </div>
  );
}
