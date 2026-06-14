import React, { useRef } from "react";
import { Marker, Tooltip, useMapEvents } from "react-leaflet";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import type { Poi } from "../poi/types";
import { getGameToLatLng, getLatLngToGame, getMapDef } from "./mapDefs";
import { makeGrid, cellLabelAt } from "../poi/grid";
import { newCustomPoi } from "../poi/customPoi";
import { svgForFacet, colorForFacet } from "../poi/registry";

const CUSTOM_COLOR = colorForFacet("custom");

// One cached icon (DOM-stable; no setIcon swaps).
let cachedIcon: L.DivIcon | null = null;
function customIcon(): L.DivIcon {
  if (cachedIcon) return cachedIcon;
  cachedIcon = L.divIcon({
    className: "tc-poi-marker tc-custom",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="tc-poi-glyph" style="color:${CUSTOM_COLOR}">${svgForFacet("custom")}</div>`,
  });
  return cachedIcon;
}

function gridRefFor(mapId: string, x: number, z: number): string | undefined {
  const def = getMapDef(mapId);
  if (!def) return undefined;
  return cellLabelAt(makeGrid(def.boundsRaw, def.rotation), x, z);
}

// Always-mounted click-to-place handler. Renders nothing. Kept SEPARATE from the
// marker-rendering layer so placement works even when "My markers" is toggled
// off (the v0.7 bug: the click handler was gated behind the layer's visibility).
// A click on empty map drops a marker; clicks on existing markers don't bubble
// here (Leaflet stops marker clicks), so place/remove never collide.
// How far (screen px) a press may travel before its release counts as a drag,
// not a tap — and how long after a zoom/pan settles we keep ignoring clicks.
const TAP_SLOP_PX = 6;
const SETTLE_COOLDOWN_MS = 250;

export function MapClickPlacer({
  mapId,
  onAdd,
}: {
  mapId: string;
  onAdd: (poi: Poi) => void;
}): null {
  // Guards against a "click" that's really the tail of a zoom/pan gesture. The
  // miss this fixes: start a wheel/double-click zoom, then press-drag-release
  // while the zoom animation is still running — Leaflet doesn't register the
  // drag, so the release lands as a plain click and drops a stray marker.
  const downPt = useRef<L.Point | null>(null);
  const draggedSincePress = useRef(false);
  // Infinity while a zoom/pan animation is in flight; a near-future timestamp
  // for a brief cooldown after it ends; 0 when idle.
  const settleUntil = useRef(0);

  useMapEvents({
    zoomstart: () => { settleUntil.current = Infinity; },
    movestart: () => { settleUntil.current = Infinity; },
    zoomend: () => { settleUntil.current = Date.now() + SETTLE_COOLDOWN_MS; },
    moveend: () => { settleUntil.current = Date.now() + SETTLE_COOLDOWN_MS; },
    mousedown: (e) => {
      downPt.current = e.containerPoint;
      draggedSincePress.current = false;
    },
    mousemove: (e) => {
      const d = downPt.current;
      if (d && e.containerPoint.distanceTo(d) > TAP_SLOP_PX) {
        draggedSincePress.current = true;
      }
    },
    click: (e) => {
      const down = downPt.current;
      downPt.current = null;
      // Ignore the tail of a zoom/pan animation, or a press that moved (a drag
      // that never panned the map still moves the cursor on screen).
      if (Date.now() < settleUntil.current) return;
      if (draggedSincePress.current) return;
      if (down && e.containerPoint.distanceTo(down) > TAP_SLOP_PX) return;
      const toGame = getLatLngToGame(mapId);
      if (!toGame) return;
      const { x, z } = toGame(e.latlng.lat, e.latlng.lng);
      onAdd(newCustomPoi(mapId, x, z, { gridRef: gridRefFor(mapId, x, z) }));
    },
  });
  return null;
}

interface CustomMarkerLayerProps {
  mapId: string;
  pois: Poi[]; // custom POIs (source: "user") for the current map
  onRemove: (id: string) => void;
}

// Renders the user's custom markers and handles click-to-remove. Placement lives
// in MapClickPlacer (above) so it isn't tied to this layer's mount state.
export default function CustomMarkerLayer({
  mapId,
  pois,
  onRemove,
}: CustomMarkerLayerProps): React.JSX.Element {
  const { t } = useTranslation();
  const toLatLng = getGameToLatLng(mapId);
  if (!toLatLng) return <></>;

  return (
    <>
      {pois.map((poi) => {
        const gridRef = typeof poi.meta?.gridRef === "string" ? poi.meta.gridRef : undefined;
        return (
          <Marker
            key={poi.id}
            position={toLatLng(poi.position.x, poi.position.z) as L.LatLngExpression}
            icon={customIcon()}
            eventHandlers={{ click: () => onRemove(poi.id) }}
          >
            <Tooltip direction="top" className="tc-poi-tip" opacity={1}>
              <span>{poi.label}</span>
              {gridRef && (
                <>
                  <br />
                  <small>{t('map.cellClickToRemove', { grid: gridRef })}</small>
                </>
              )}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
