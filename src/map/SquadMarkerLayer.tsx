// Renders squadmates' shared custom markers on the current map, each tinted with
// the owner's squad color and labeled with their name. Read-only: you can place
// and remove your OWN markers (CustomMarkerLayer), but a teammate's marker is
// theirs to manage — clicking does nothing here. Off-map markers aren't shown.
//
// Mirror of SquadmateLayer for points instead of presence: it reads the squad's
// per-member marker map straight from context and skips self (your own markers
// render via CustomMarkerLayer, so no duplication).

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { getGameToLatLng } from "./mapDefs";
import { useSquad } from "../squad/useSquad";
import { hexForColorId } from "../../shared/squadProtocol";
import { svgForFacet } from "../poi/registry";

// One DivIcon per distinct color (squad caps at 8) — avoids rebuilding DOM-stable
// icons on every render.
const iconCache = new Map<string, L.DivIcon>();
function markerIcon(hex: string): L.DivIcon {
  const hit = iconCache.get(hex);
  if (hit) return hit;
  const icon = L.divIcon({
    className: "tc-poi-marker tc-squad-marker",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="tc-poi-glyph" style="color:${hex}">${svgForFacet("custom")}</div>`,
  });
  iconCache.set(hex, icon);
  return icon;
}

export default function SquadMarkerLayer({ mapId }: { mapId: string }) {
  const squad = useSquad();
  const toLatLng = getGameToLatLng(mapId);
  if (!toLatLng) return null;

  return (
    <>
      {squad.members.map((member) => {
        if (member.id === squad.selfId) return null; // own markers: CustomMarkerLayer
        if (squad.hiddenQuests[member.id]) return null; // eye toggle hides markers + quests
        const list = squad.markers[member.id];
        if (!list || list.length === 0) return null;
        const hex = hexForColorId(member.colorId);
        const icon = markerIcon(hex);
        return list.map((m) => {
          if (m.mapId !== mapId) return null;
          return (
            <Marker
              key={`${member.id}:${m.id}`}
              position={toLatLng(m.position.x, m.position.z) as L.LatLngExpression}
              icon={icon}
              interactive
              keyboard={false}
            >
              <Tooltip direction="top" className="tc-poi-tip" opacity={1}>
                <span style={{ color: hex, fontWeight: 700 }}>{member.name}</span>
                <br />
                <span>{m.label}</span>
              </Tooltip>
            </Marker>
          );
        });
      })}
    </>
  );
}
