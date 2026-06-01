import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { MapFloor } from "./floorClassify";
import { ALL_FLOORS } from "./FloorSwitcher";

// Floor groups that are NOT the active floor are fully HIDDEN (not dimmed): the
// product rule is "show only the base/ground layer + the one active floor, both
// opaque — no translucent layers mixed in". The base/ground group has no
// svgLayerId so it is never touched and always renders at full opacity.
const OFF_FLOOR_OPACITY = "0";

// Fill-opacity applied to a floor's opaque "footprint slab" (softenIds) so the
// always-on base layer shows through the gaps. Low enough to reveal the base,
// high enough to keep a faint floor outline. Room/wall plans are untouched.
const SLAB_FILL_OPACITY = "0.1";

// Gold used by the source SVGs' `.stairs` class. Applied to highlightIds groups
// (stairs/ramps) on maps where the geometry exists but wasn't colored.
const STAIR_COLOR = "#FFD700";

const SHAPE_SEL = "path,polygon,rect,circle,ellipse";

// --- Global color overrides -------------------------------------------------
// Recolor map fills by CSS class (global, every map) or by group id (surgical,
// one group only). Applied by APPENDING a <style> to the SVG so the rule wins
// the cascade (later same-specificity rule + !important) without parsing the
// SVG's own <style>. Never touches the floor <g id>s the multi-floor system
// relies on, and survives upstream map-data updates. Add a line per spec.
type ColorOverride =
  | { class: string; fill: string }
  | { id: string; fill: string };

const COLOR_OVERRIDES: ColorOverride[] = [
  // parking/sidewalk gray -> street gray. Placeholder hex — confirm with Moacir.
  // `.cement` covers parking lots AND sidewalks; for parking-only use an id rule.
  { class: "cement", fill: "#768089" },
];

function applyColorOverrides(
  svg: SVGSVGElement,
  overrides: ColorOverride[],
): void {
  if (!overrides.length) return;
  const rules = overrides
    .map((o) =>
      "class" in o
        ? `.${o.class}{fill:${o.fill} !important}`
        : `#${o.id},#${o.id} *{fill:${o.fill} !important}`,
    )
    .join("\n");
  const style = svg.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "style",
  );
  style.textContent = rules;
  svg.appendChild(style);
}

// Recolor one element gold. Sets both fill and stroke so it works for filled
// stair shapes AND stroked ramp lines: a gold fill on an open line has no area
// (invisible), and a gold stroke on a filled shape is a negligible thin edge.
// (getComputedStyle is avoided — this runs before the SVG is in the DOM, where
// computed styles wouldn't resolve the SVG's own <style> classes.)
function goldify(s: SVGElement): void {
  s.style.fill = STAIR_COLOR;
  s.style.stroke = STAIR_COLOR;
}

// One-time visual treatments that don't depend on the active floor: soften
// opaque slabs and recolor stair/ramp groups. Re-running is idempotent.
function applyStaticTreatments(svg: SVGSVGElement, floors: MapFloor[]): void {
  for (const f of floors) {
    for (const id of f.softenIds ?? []) {
      const g = svg.querySelector<SVGElement>(`#${CSS.escape(id)}`);
      if (!g) continue;
      g.querySelectorAll<SVGElement>(SHAPE_SEL).forEach((s) => {
        s.style.fillOpacity = SLAB_FILL_OPACITY;
      });
      if (g.matches(SHAPE_SEL)) g.style.fillOpacity = SLAB_FILL_OPACITY;
    }
    for (const id of f.highlightIds ?? []) {
      const g = svg.querySelector<SVGElement>(`#${CSS.escape(id)}`);
      if (!g) continue;
      goldify(g);
      g.querySelectorAll<SVGElement>(SHAPE_SEL).forEach(goldify);
    }
  }
}

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

function parseSvg(text: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const el = doc.documentElement;
  if (!el || el.nodeName.toLowerCase() !== "svg") return null;
  return el as unknown as SVGSVGElement;
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
    g.style.opacity = full ? "1" : OFF_FLOOR_OPACITY;
  }
}

interface FloorVisualOverlayProps {
  svgUrl: string;
  bounds: L.LatLngBoundsLiteral;
  floors?: MapFloor[];
  activeFloorId: string;
  // Optional extra SVGs (OUR own assets, e.g. hand-drawn Reserve stairs) layered
  // on top of the base map at the same bounds; their shapes are recolored gold.
  // A missing/invalid file degrades gracefully (parse fails -> skipped).
  extraSvgUrls?: string[];
}

// Renders the map SVG inline (Leaflet SVGOverlay) so floor groups can be
// dimmed/raised by id, color overrides applied, and extra geometry layered on
// top. Used for every .svg map; MapView keeps <ImageOverlay> only for non-SVG.
export default function FloorVisualOverlay({
  svgUrl,
  bounds,
  floors = [],
  activeFloorId,
  extraSvgUrls,
}: FloorVisualOverlayProps): null {
  const map = useMap();
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);

  // Mount the base overlay (and any extra overlays) once per URL. bounds/floors/
  // extraSvgUrls are value-stable per map, so URL + map key the mount.
  useEffect(() => {
    let cancelled = false;
    const overlays: L.SVGOverlay[] = [];
    fetchSvgText(svgUrl).then(async (text) => {
      if (cancelled) return;
      const svg = parseSvg(text);
      if (!svg) return;
      applyColorOverrides(svg, COLOR_OVERRIDES);
      applyStaticTreatments(svg, floors);
      const base = L.svgOverlay(svg, bounds, { interactive: false });
      base.addTo(map);
      overlays.push(base);
      setSvgEl(svg);
      // Extra geometry overlays mount AFTER the base so they sit on top.
      for (const url of extraSvgUrls ?? []) {
        if (cancelled) return;
        try {
          const etext = await fetchSvgText(url);
          const esvg = parseSvg(etext);
          if (!esvg) continue; // missing/invalid optional file -> skip silently
          applyColorOverrides(esvg, COLOR_OVERRIDES);
          esvg.querySelectorAll<SVGElement>(SHAPE_SEL).forEach(goldify);
          const extra = L.svgOverlay(esvg, bounds, { interactive: false });
          extra.addTo(map);
          overlays.push(extra);
        } catch {
          /* network error on an optional overlay -> skip */
        }
      }
    });
    return () => {
      cancelled = true;
      overlays.forEach((o) => o.remove());
      setSvgEl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgUrl, map]);

  // Re-apply floor opacity whenever the active floor changes (or once loaded).
  useEffect(() => {
    if (svgEl) applyFloorOpacity(svgEl, floors, activeFloorId);
  }, [svgEl, floors, activeFloorId]);

  return null;
}
