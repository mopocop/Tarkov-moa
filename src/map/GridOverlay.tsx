import React, { useMemo } from "react";
import { Polyline, Marker } from "react-leaflet";
import L from "leaflet";
import { getMapDef, getGameToLatLng } from "./mapDefs";
import { makeGrid, gridLineCoords, cellCenterGame } from "../poi/grid";

const labelIconCache = new Map<string, L.DivIcon>();
function labelIcon(text: string): L.DivIcon {
  const cached = labelIconCache.get(text);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "tc-grid-label-marker",
    iconSize: [28, 14],
    iconAnchor: [14, 7],
    html: `<span style="color:rgba(250,250,250,0.6);font:11px monospace;text-shadow:0 0 2px #000;">${text}</span>`,
  });
  labelIconCache.set(text, icon);
  return icon;
}

interface GridOverlayProps {
  mapId: string;
  visible: boolean;
}

export default function GridOverlay({
  mapId,
  visible,
}: GridOverlayProps): React.JSX.Element | null {
  const data = useMemo(() => {
    const def = getMapDef(mapId);
    const toLatLng = getGameToLatLng(mapId);
    if (!def || !toLatLng) return null;
    const grid = makeGrid(def.boundsRaw, def.rotation);
    const { xs, zs } = gridLineCoords(grid);
    const lines: [number, number][][] = [];
    for (const x of xs) lines.push([toLatLng(x, grid.zMin), toLatLng(x, grid.zMax)]);
    for (const z of zs) lines.push([toLatLng(grid.xMin, z), toLatLng(grid.xMax, z)]);
    const labels: { pos: [number, number]; label: string }[] = [];
    for (let c = 0; c < grid.cols; c++) {
      for (let r = 0; r < grid.rows; r++) {
        const cc = cellCenterGame(grid, c, r);
        labels.push({ pos: toLatLng(cc.x, cc.z), label: cc.label });
      }
    }
    return { lines, labels };
  }, [mapId]);

  if (!visible || !data) return null;

  return (
    <>
      {data.lines.map((pts, i) => (
        <Polyline
          key={`l${i}`}
          positions={pts as L.LatLngExpression[]}
          interactive={false}
          pathOptions={{ className: "tc-grid-line", weight: 1 }}
        />
      ))}
      {data.labels.map((l, i) => (
        <Marker
          key={`g${i}`}
          position={l.pos as L.LatLngExpression}
          icon={labelIcon(l.label)}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}
