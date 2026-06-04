// Freehand drawing on the map. A stroke is a polyline of game coords; each is
// authored in the drawer's color and (when in a squad) broadcast so teammates
// see it live, tinted by the author's squad color.
//
// Interaction model:
//   - tool "pen":    map panning is OFF; press-drag-release draws one stroke.
//   - tool "eraser":  panning stays ON; click one of YOUR strokes to delete it.
//   - tool null:      no drawing; strokes (yours + teammates') just render.
//
// Coordinates: the map's custom CRS bakes in per-map rotation, so we convert at
// the latLng edge only — game<->latLng is the trivial swap getGameToLatLng /
// getLatLngToGame expose. Points are sampled by SCREEN distance so density is
// even regardless of zoom, and capped so a runaway drag can't bloat a payload.

import { useEffect, useMemo, useRef, useState } from "react";
import { Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { getGameToLatLng, getLatLngToGame } from "./MapView";
import { useSquad } from "../squad/SquadContext";
import { hexForColorId, type DrawPayload } from "../../shared/squadProtocol";

export type DrawTool = "pen" | "eraser" | null;

type Pt = { x: number; z: number };

const MIN_SCREEN_STEP = 4; // px between sampled points
const MAX_POINTS = 4000; // hard cap per stroke

// Dedicated pane so strokes paint ABOVE the map's SVG image (overlayPane z=400,
// where the map graphic lives) but BELOW markers (markerPane z=600). Without
// this, polylines share overlayPane with the map image and get covered by it.
const DRAW_PANE = "tc-draw-pane";
const DRAW_PANE_Z = "450";

export function newDrawId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `draw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function DrawLayer({
  mapId,
  tool,
  color,
  ownDraws,
  onCommit,
  onErase,
}: {
  mapId: string;
  tool: DrawTool;
  color: string; // hex for the local user's ink
  ownDraws: DrawPayload[];
  onCommit: (points: Pt[]) => void;
  onErase: (id: string) => void;
}) {
  const map = useMap();
  const squad = useSquad();
  // Memoize per-map: the factories return a FRESH closure each call, and the pen
  // effect depends on `toGame` — without this, every setDraft re-render would
  // tear down the effect mid-stroke (re-enabling panning, wiping the points), so
  // dragging produced nothing. Stable identity keeps one capture alive per drag.
  const toLatLng = useMemo(() => getGameToLatLng(mapId), [mapId]);
  const toGame = useMemo(() => getLatLngToGame(mapId), [mapId]);

  const [draft, setDraft] = useState<Pt[] | null>(null);

  // Refs so the pen effect can stay subscribed across re-renders without
  // re-binding mid-stroke. onCommit is stable (App memoizes it).
  const drawingRef = useRef(false);
  const draftRef = useRef<Pt[]>([]);
  const lastPtRef = useRef<L.Point | null>(null);

  // ----- Pen capture -----
  useEffect(() => {
    if (tool !== "pen" || !toGame) return;
    const container = map.getContainer();
    const prevCursor = container.style.cursor;
    container.style.cursor = "crosshair";
    // Drawing and panning both want the drag gesture — turn panning off for the
    // whole time the pen is selected, not per-press (disabling mid-mousedown
    // can't cancel an already-started Leaflet drag).
    map.dragging.disable();

    const sample = (latlng: L.LatLng) => {
      const cp = map.latLngToContainerPoint(latlng);
      const last = lastPtRef.current;
      if (last && cp.distanceTo(last) < MIN_SCREEN_STEP) return;
      lastPtRef.current = cp;
      if (draftRef.current.length >= MAX_POINTS) return;
      const g = toGame(latlng.lat, latlng.lng);
      draftRef.current.push(g);
      setDraft(draftRef.current.slice());
    };

    const onDown = (e: L.LeafletMouseEvent) => {
      drawingRef.current = true;
      draftRef.current = [];
      lastPtRef.current = null;
      sample(e.latlng);
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      if (drawingRef.current) sample(e.latlng);
    };
    const finish = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const pts = draftRef.current;
      draftRef.current = [];
      lastPtRef.current = null;
      setDraft(null);
      if (pts.length >= 2) onCommit(pts);
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", finish);
    // Catch a release that lands outside the canvas so a stroke never sticks.
    window.addEventListener("mouseup", finish);

    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", finish);
      window.removeEventListener("mouseup", finish);
      container.style.cursor = prevCursor;
      map.dragging.enable();
      drawingRef.current = false;
      draftRef.current = [];
      lastPtRef.current = null;
      setDraft(null);
    };
  }, [tool, map, toGame, onCommit]);

  // Ensure the draw pane exists (idempotent; created once on the map instance).
  if (!map.getPane(DRAW_PANE)) {
    map.createPane(DRAW_PANE).style.zIndex = DRAW_PANE_Z;
  }

  if (!toLatLng) return null;

  const eraserOn = tool === "eraser";
  const render = (pts: Pt[]) =>
    pts.map((p) => toLatLng(p.x, p.z) as L.LatLngExpression);

  return (
    <>
      {/* Teammates' strokes — their color, never interactive. */}
      {Object.entries(squad.draws).flatMap(([memberId, list]) => {
        if (memberId === squad.selfId) return [];
        const member = squad.members.find((mm) => mm.id === memberId);
        const hex = member ? hexForColorId(member.colorId) : "#9CA3AF";
        return list
          .filter((d) => d.mapId === mapId && d.points.length >= 2)
          .map((d) => (
            <Polyline
              key={`peer:${memberId}:${d.id}`}
              positions={render(d.points)}
              interactive={false}
              pane={DRAW_PANE}
              pathOptions={{ color: hex, weight: 3, opacity: 0.85 }}
            />
          ));
      })}

      {/* Your strokes — clickable only while erasing (keyed so interactivity
          actually toggles, since Leaflet bakes `interactive` at creation). */}
      {ownDraws
        .filter((d) => d.mapId === mapId && d.points.length >= 2)
        .map((d) => (
          <Polyline
            key={`own:${d.id}:${eraserOn ? "e" : "n"}`}
            positions={render(d.points)}
            interactive={eraserOn}
            pane={DRAW_PANE}
            eventHandlers={eraserOn ? { click: () => onErase(d.id) } : undefined}
            pathOptions={{
              color,
              weight: 3,
              opacity: 0.9,
              className: eraserOn ? "tc-draw-erasable" : undefined,
            }}
          />
        ))}

      {/* Live in-progress stroke. */}
      {draft && draft.length >= 2 && (
        <Polyline
          positions={render(draft)}
          interactive={false}
          pane={DRAW_PANE}
          pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: "5 5" }}
        />
      )}
    </>
  );
}
