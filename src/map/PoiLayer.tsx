import React, { useEffect, useRef } from "react";
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { Poi } from "../poi/types";
import { svgForFacet, colorForFacet } from "../poi/registry";
import { facetKeyOf } from "../poi/facets";
import { getGameToLatLng } from "./mapDefs";
import {
  classifyMarker,
  GROUND_FLOOR_ID,
  type MapFloor,
} from "./floorClassify";
import { ALL_FLOORS } from "./FloorSwitcher";

// Extraction-type facets render with an always-visible name label (extracts +
// transits) so the player can read the exit without hovering.
function isExtractionLike(facetKey: string): boolean {
  return facetKey === "transit" || facetKey.startsWith("extract:");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PoiLayerProps {
  mapId: string;
  pois: Poi[];
  isVisible: (poi: Poi) => boolean;
  /** Ids of POIs currently highlighted — several at once, like quest pins. */
  selectedPoiIds?: Set<string>;
  onSelect?: (poi: Poi) => void;
  onHover?: (poiId: string | null) => void;
  // Floor data + the active floor. When a specific floor is selected, POIs that
  // classify to a different floor are dimmed (tc-marker-offfloor), matching the
  // quest-marker behavior — so only POIs on the visible floor read as present.
  floors?: MapFloor[];
  activeFloorId?: string;
}

// One stable icon per color+glyph combo. Highlight is applied via a ".tc-hl"
// CSS class on the live marker DOM element inside a useEffect — never via
// setIcon — so the DOM stays stable and clicks fire reliably.
const iconCache = new Map<string, L.DivIcon>();
function getPoiIcon(color: string, glyphSvg: string, label?: string): L.DivIcon {
  const key = `${color}|${glyphSvg}|${label ?? ""}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  // The glyph is centered on the coordinate (iconAnchor = half iconSize). Any
  // label is absolutely positioned to the right in CSS so it never shifts the
  // anchor — the dot stays exactly on the POI.
  const labelHtml = label
    ? `<span class="tc-poi-label">${escapeHtml(label)}</span>`
    : "";
  const icon = L.divIcon({
    className: "tc-poi-marker",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="tc-poi-glyph" style="color:${color}">${glyphSvg}${labelHtml}</div>`,
  });
  iconCache.set(key, icon);
  return icon;
}

function resolvePoiIcon(poi: Poi): L.DivIcon {
  const facetKey = facetKeyOf(poi);
  // Facet drives the color for tarkov-dev POIs; a per-marker color override is
  // honored only for user markers (kept for the future custom/P2P palette).
  const color =
    poi.source === "user" && poi.color ? poi.color : colorForFacet(facetKey);
  const label = isExtractionLike(facetKey) ? poi.label : undefined;
  return getPoiIcon(color, svgForFacet(facetKey), label);
}

interface PoiMarkerProps {
  poi: Poi;
  highlighted: boolean;
  offFloor: boolean;
  latLng: [number, number];
  onHover?: (poiId: string | null) => void;
  onSelect?: (poi: Poi) => void;
}

function PoiMarker({
  poi,
  highlighted,
  offFloor,
  latLng,
  onHover,
  onSelect,
}: PoiMarkerProps): React.JSX.Element {
  const markerRef = useRef<L.Marker | null>(null);

  // Apply highlight + off-floor state as classes on the live DOM — no setIcon,
  // no DOM swap (which would drop clicks landing between mousedown/mouseup).
  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (!el) return;
    el.classList.toggle("tc-hl", highlighted);
    el.classList.toggle("tc-marker-offfloor", offFloor);
  }, [highlighted, offFloor]);

  return (
    <Marker
      ref={markerRef}
      position={latLng as L.LatLngExpression}
      icon={resolvePoiIcon(poi)}
      eventHandlers={{
        mouseover: () => onHover?.(poi.id),
        mouseout: () => onHover?.(null),
        click: () => onSelect?.(poi),
      }}
    >
      <Tooltip direction="top" className="tc-poi-tip" opacity={1}>
        <span>{poi.label}</span>
        {poi.note && (
          <>
            <br />
            <small>{poi.note}</small>
          </>
        )}
      </Tooltip>
    </Marker>
  );
}

export default function PoiLayer({
  mapId,
  pois,
  isVisible,
  selectedPoiIds,
  onSelect,
  onHover,
  floors,
  activeFloorId = ALL_FLOORS,
}: PoiLayerProps): React.JSX.Element {
  const toLatLng = getGameToLatLng(mapId);
  if (!toLatLng) return <></>;

  const hasFloors = !!floors && floors.length > 0;

  return (
    <>
      {pois.filter(isVisible).map((poi) => {
        const floorId = hasFloors
          ? classifyMarker(poi.position.x, poi.position.y, poi.position.z, floors!)
          : GROUND_FLOOR_ID;
        const offFloor =
          activeFloorId !== ALL_FLOORS && floorId !== activeFloorId;
        return (
          <PoiMarker
            key={poi.id}
            poi={poi}
            highlighted={selectedPoiIds?.has(poi.id) ?? false}
            offFloor={offFloor}
            latLng={toLatLng(poi.position.x, poi.position.z)}
            onHover={onHover}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}
