import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, ImageOverlay, useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import { Plus, Minus } from "@phosphor-icons/react";
import "leaflet/dist/leaflet.css";
import { canonicalMapId } from "./canonicalMap";
import { MAPS, makeCRS, leafletBounds } from "./mapDefs";
import FloorVisualOverlay from "./FloorVisualOverlay";
import { ALL_FLOORS } from "./FloorSwitcher";

export type { MapFloor } from "./floorClassify";


// Custom zoom dock replacing Leaflet's built-in control so it can live on the
// rail side of the screen (positioned via .shell--left/right in CSS).
function ZoomDock(): React.JSX.Element {
  const map = useMap();
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  return (
    <div ref={ref} className="tc-zoom-dock">
      <button type="button" aria-label={t('rail.zoomIn')} title={t('rail.zoomIn')} onClick={() => map.zoomIn()}>
        <Plus weight="bold" />
      </button>
      <button type="button" aria-label={t('rail.zoomOut')} title={t('rail.zoomOut')} onClick={() => map.zoomOut()}>
        <Minus weight="bold" />
      </button>
    </div>
  );
}

// Lets a press-drag begin even while a wheel-zoom animation is still playing.
// During Leaflet's zoom ease the map pane carries the `leaflet-zoom-anim`
// transition, so a drag that starts mid-animation has its pan transform animated
// (lagged) instead of tracking the cursor — the pan effectively "doesn't work"
// for the ~250ms ease. We listen in the CAPTURE phase, BEFORE Leaflet's own
// mousedown/drag handler, and if a zoom animation is mid-flight we finalize it
// at once (snap to the target, clearing _animatingZoom + the transition). Leaflet
// then starts the drag on the same press with the animation already settled, so
// the pan tracks the cursor immediately.
function ZoomDragRescue(): null {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const m = map as unknown as {
      _animatingZoom?: boolean;
      _onZoomTransitionEnd?: () => void;
    };
    const settleZoom = () => {
      if (m._animatingZoom && typeof m._onZoomTransitionEnd === "function") {
        m._onZoomTransitionEnd();
      }
    };
    el.addEventListener("mousedown", settleZoom, true); // capture — runs first
    return () => el.removeEventListener("mousedown", settleZoom, true);
  }, [map]);
  return null;
}

interface MapViewProps {
  mapId: string;
  mapName: string;
  // Current floor (from FloorSwitcher / player auto-follow). Drives which SVG
  // floor group is raised vs dimmed. Defaults to ALL_FLOORS (show everything).
  activeFloorId?: string;
  children?: React.ReactNode;
}

export default function MapView({
  mapId,
  mapName,
  activeFloorId = ALL_FLOORS,
  children,
}: MapViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const def = MAPS[canonicalMapId(mapId)];
  const crs = useMemo(() => (def ? makeCRS(def) : null), [def]);

  if (!def || !crs) {
    return (
      <div className="map-placeholder">
        {t('map.unsupportedMap', { name: mapName })}
      </div>
    );
  }

  const bounds = leafletBounds(def);

  return (
    <MapContainer
      key={mapId}
      crs={crs}
      bounds={bounds}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={true}
      // Inertia adds a momentum glide after each drag-release that reads as
      // "sluggish" panning — off so the map stops exactly when the mouse does.
      inertia={false}
      minZoom={-3}
      maxZoom={7}
      // Fractional zoom steps: each scroll notch changes zoom by 0.25 instead
      // of a whole level so a wheel gesture reads as a smooth ramp.
      zoomSnap={0.25}
      zoomDelta={0.25}
      wheelPxPerZoomLevel={120}
      // NATIVE animated zoom. Our CRS is affine (the rotation is applied inside
      // projection.project, BEFORE the linear Transformation), so pixel coords
      // at any two zooms differ by a uniform scale about a pivot — exactly the
      // transform Leaflet's zoom animation applies. The historical "rotated CRS
      // drifts" flicker was actually caused by hand-rolled CSS transitions on
      // the overlay/markers (removed — see App.css note); with those gone the
      // native animation is geometrically exact and markers ride along.
      zoomAnimation={true}
      markerZoomAnimation={true}
      // No opacity fade on overlay-add / tooltip + popup close. Without this,
      // Leaflet keeps a closed marker tooltip on screen for ~200ms before
      // removing it (and our opacity:1 tip can't fade), so a POI hover visibly
      // LINGERS after the cursor leaves. Off ⇒ the tooltip vanishes the instant
      // you mouse out. The map is one SVG overlay (no tiles), so there's nothing
      // to cross-fade — purely a win here.
      fadeAnimation={false}
      // Zoom buttons are rendered by ZoomDock on the rail side instead.
      zoomControl={false}
      // The "Leaflet" flag lives in the rail footer + Settings credits instead
      // of floating over the map (BSD-2 license carried in the repo).
      attributionControl={false}
    >
      {def.svgUrl.endsWith(".svg") ? (
        <FloorVisualOverlay
          svgUrl={def.svgUrl}
          bounds={bounds}
          floors={def.floors}
          activeFloorId={activeFloorId}
          extraSvgUrls={def.extraSvgUrls}
        />
      ) : (
        <ImageOverlay url={def.svgUrl} bounds={bounds} />
      )}
      <ZoomDock />
      <ZoomDragRescue />
      {children}
    </MapContainer>
  );
}
