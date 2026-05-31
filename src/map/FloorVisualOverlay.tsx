import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { MapFloor } from "./floorClassify";
import { ALL_FLOORS } from "./FloorSwitcher";

// Opacity for floor groups that are NOT the active floor. The base/ground group
// has no svgLayerId so it is never touched — it always renders at full opacity,
// per the hard product rule "the base layer is never made transparent".
const DIM_OPACITY = "0.25";

// Fetched SVG text is cached per URL so switching maps back and forth (or
// re-mounting) doesn't refetch. Stores the in-flight promise to dedupe.
const svgTextCache = new Map<string, Promise<string>>();
function fetchSvgText(url: string): Promise<string> {
  let p = svgTextCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => r.text());
    svgTextCache.set(url, p);
  }
  return p;
}

function applyFloorOpacity(
  svg: SVGSVGElement,
  floors: MapFloor[],
  activeFloorId: string,
): void {
  for (const f of floors) {
    if (!f.svgLayerId) continue; // no addressable group (base / visual-less floor)
    const g = svg.querySelector<SVGElement>(`#${CSS.escape(f.svgLayerId)}`);
    if (!g) continue;
    const full = activeFloorId === ALL_FLOORS || f.id === activeFloorId;
    g.style.transition = "opacity 200ms ease";
    g.style.opacity = full ? "1" : DIM_OPACITY;
  }
}

interface FloorVisualOverlayProps {
  svgUrl: string;
  bounds: L.LatLngBoundsLiteral;
  floors: MapFloor[];
  activeFloorId: string;
}

// Renders the map SVG inline (Leaflet SVGOverlay) so individual floor groups can
// be dimmed/raised by id. Used in place of <ImageOverlay> for maps whose floors
// carry an svgLayerId. Maps without floor groups keep the flat ImageOverlay.
export default function FloorVisualOverlay({
  svgUrl,
  bounds,
  floors,
  activeFloorId,
}: FloorVisualOverlayProps): null {
  const map = useMap();
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);

  // Mount the overlay once per URL. bounds for a given map are value-stable
  // (same numbers each render), so URL alone keys the mount.
  useEffect(() => {
    let cancelled = false;
    let overlay: L.SVGOverlay | null = null;
    fetchSvgText(svgUrl).then((text) => {
      if (cancelled) return;
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const el = doc.documentElement;
      if (!el || el.nodeName.toLowerCase() !== "svg") return;
      const svg = el as unknown as SVGSVGElement;
      overlay = L.svgOverlay(svg, bounds, { interactive: false });
      overlay.addTo(map);
      setSvgEl(svg);
    });
    return () => {
      cancelled = true;
      if (overlay) overlay.remove();
      setSvgEl(null);
    };
    // bounds/floors are stable per map; intentionally keyed on URL + map only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgUrl, map]);

  // Re-apply opacity whenever the active floor changes (or once the SVG loads).
  useEffect(() => {
    if (svgEl) applyFloorOpacity(svgEl, floors, activeFloorId);
  }, [svgEl, floors, activeFloorId]);

  return null;
}
