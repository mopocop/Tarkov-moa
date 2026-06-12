// Renders one colored, heading-aware dot per squadmate whose latest position is
// on the map currently being viewed. Mirrors PlayerMarker's CRS/rotation
// pipeline, tinted per member. Off-map teammates aren't shown; stale positions
// fade. A 15s tick re-evaluates staleness as time passes.

import { useEffect, useMemo, useRef, useState } from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import { getGameToLatLng, getMapDef } from "./MapView";
import { useSquad, type MemberPosition } from "../squad/SquadContext";
import { hexForColorId, type SquadMember } from "../../shared/squadProtocol";

// Staleness is CONTINUOUS: the pointer's opacity eases down as the position
// ages (fresh → ghost), driven by a --staleness custom property set on the
// live DOM element — the icon itself is stable per name+color (no DOM swaps).
// Tuned per Moacir (2026-06-12): solid for 5s, then fade to the 30% ghost
// floor by 30s — a squadmate pointer should read as outdated FAST.
const STALE_FADE_START_MS = 5_000; // fully solid until here
const STALE_FADE_FULL_MS = 30_000; // ghost (30% opacity, set in CSS) here

function stalenessOf(ageMs: number): number {
  const t = (ageMs - STALE_FADE_START_MS) / (STALE_FADE_FULL_MS - STALE_FADE_START_MS);
  return Math.min(1, Math.max(0, t));
}

function makeIcon(name: string, hex: string): L.DivIcon {
  const safe = name.replace(/[<>&"]/g, "");
  return L.divIcon({
    className: "tc-squadmate-marker",
    html:
      `<div class="tc-squadmate" style="--c:${hex}">` +
      `<div class="tc-squadmate-arrow">` +
      `<svg viewBox="0 0 24 24"><path d="M12 2.2 20.8 21.2 12 16.4 3.2 21.2Z"/></svg>` +
      `</div>` +
      `<div class="tc-squadmate-name">${safe}</div>` +
      `</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function SquadmateMarker({
  member,
  pos,
  toLatLng,
  mapRotation,
  now,
}: {
  member: SquadMember;
  pos: MemberPosition;
  toLatLng: (x: number, z: number) => [number, number];
  mapRotation: number;
  now: number;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const hex = hexForColorId(member.colorId);
  const icon = useMemo(() => makeIcon(member.name, hex), [member.name, hex]);

  // Rotate the arrow to the member's heading. The CRS bakes in the map's own
  // rotation for positions, but the CSS arrow is screen-space, so add it here
  // (same correction PlayerMarker applies).
  useEffect(() => {
    const el = markerRef.current?.getElement();
    const arrow = el?.querySelector<HTMLElement>(".tc-squadmate-arrow");
    if (arrow) arrow.style.transform = `rotate(${pos.payload.rotation + mapRotation}deg)`;
  }, [pos.payload.rotation, mapRotation, icon]);

  // Continuous staleness fade on the live element (re-evaluated on each tick
  // and on every fresh position). CSS turns --staleness into opacity.
  useEffect(() => {
    const root = markerRef.current?.getElement()?.querySelector<HTMLElement>(".tc-squadmate");
    if (root) root.style.setProperty("--staleness", String(stalenessOf(now - pos.ts)));
  }, [now, pos.ts, icon]);

  return (
    <Marker
      ref={(m) => {
        markerRef.current = m;
      }}
      position={toLatLng(pos.payload.x, pos.payload.z)}
      icon={icon}
      interactive={false}
      keyboard={false}
      zIndexOffset={900}
    />
  );
}

export default function SquadmateLayer({ mapId }: { mapId: string }) {
  const squad = useSquad();
  const toLatLng = getGameToLatLng(mapId);
  const mapRotation = getMapDef(mapId)?.rotation ?? 0;

  // Tick so staleness fades update over time even without new messages. 2.5s
  // steps + a matching CSS opacity transition read as a continuous fade over
  // the (now short) 5s→30s ramp.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2_500);
    return () => clearInterval(t);
  }, []);

  if (!toLatLng) return null;

  return (
    <>
      {squad.members.map((m) => {
        if (m.id === squad.selfId) return null; // own dot is PlayerMarker
        const pos = squad.positions[m.id];
        if (!pos || pos.payload.mapId !== mapId) return null;
        return (
          <SquadmateMarker
            key={m.id}
            member={m}
            pos={pos}
            toLatLng={toLatLng}
            mapRotation={mapRotation}
            now={now}
          />
        );
      })}
    </>
  );
}
