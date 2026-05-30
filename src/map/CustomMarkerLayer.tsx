import React from "react";
import { Marker, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Poi } from "../poi/types";
import { getGameToLatLng, getLatLngToGame, getMapDef } from "./MapView";
import { makeGrid, cellLabelAt } from "../poi/grid";
import { newCustomPoi } from "../poi/customPoi";
import { iconForFacet, colorForFacet } from "../poi/registry";

const CUSTOM_COLOR = colorForFacet("custom");

// One cached icon (DOM-stable; no setIcon swaps).
let cachedIcon: L.DivIcon | null = null;
function customIcon(): L.DivIcon {
  if (cachedIcon) return cachedIcon;
  cachedIcon = L.divIcon({
    className: "tc-poi-marker",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="tc-poi-glyph" style="color:${CUSTOM_COLOR}"><i class="${iconForFacet("custom")}"></i></div>`,
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
export function MapClickPlacer({
  mapId,
  onAdd,
}: {
  mapId: string;
  onAdd: (poi: Poi) => void;
}): null {
  useMapEvents({
    click: (e) => {
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
                  <small>Cell {gridRef} · click to remove</small>
                </>
              )}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
