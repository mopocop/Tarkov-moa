// On-map drawing tools — dock floats over the map on the rail side, above the
// zoom dock. Two controls only (Moacir's spec): toggle the pen, and clear all
// your drawings on this map (the eraser icon — per-stroke erasing is gone).

import { PencilSimple, Eraser } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const penOn = tool === "pen";
  return (
    <div className="tc-tools-dock">
      <button
        type="button"
        aria-label={t('rail.drawOnMap')}
        aria-pressed={penOn}
        title={penOn ? t('map.stopDrawing') : t('map.drawOnMapShared')}
        className={penOn ? "active" : undefined}
        style={penOn ? { color } : undefined}
        onClick={() => onTool(penOn ? null : "pen")}
      >
        <PencilSimple weight={penOn ? "fill" : "regular"} />
      </button>
      <button
        type="button"
        aria-label={t('rail.clearDrawings')}
        title={t('rail.clearDrawings')}
        disabled={!canClear}
        onClick={() => {
          onClear();
          // Erasing also drops you out of pen mode — the gesture means "I'm done
          // drawing", so panning is handed straight back.
          if (penOn) onTool(null);
        }}
      >
        <Eraser weight="regular" />
      </button>
    </div>
  );
}
