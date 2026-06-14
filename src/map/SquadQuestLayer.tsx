// Squadmates' active quest objectives, pinned on the current map in each
// teammate's squad color. Mirrors MarkerLayer's position resolution exactly so a
// teammate's pins land where their own app would draw them, but tinted per
// member and labeled with their name. Per-member visibility is honored (toggled
// from the SquadCard); self is never drawn here (own pins stay in MarkerLayer).

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { DerivedQuestState } from "../quests/derive";
import type { TaskObjective } from "../api/types";
import { getGameToLatLng } from "./mapDefs";
import { useSquad } from "../squad/useSquad";
import { hexForColorId } from "../../shared/squadProtocol";
import { QUEST_GLYPH_SVG } from "../poi/registry";

// Same resolution MarkerLayer uses: prefer a zone position on this map, else the
// first possible-location position on this map.
function resolvePosition(
  objective: TaskObjective,
  mapId: string,
): { x: number; y: number; z: number } | null {
  const zoneWithPos = objective.zones?.find((z) => z.map?.id === mapId && z.position);
  if (zoneWithPos?.position) return { ...zoneWithPos.position };
  const locWithPositions = objective.possibleLocations?.find(
    (pl) => pl.map.id === mapId && pl.positions && pl.positions.length > 0,
  );
  if (locWithPositions?.positions?.[0]) return { ...locWithPositions.positions[0] };
  return null;
}

// One icon per color × shared flag. "Shared" changes only when quest lists
// change (not mid-gesture), so a distinct cached icon is safe here.
const iconCache = new Map<string, L.DivIcon>();
function questIcon(hex: string, shared: boolean): L.DivIcon {
  const key = `${hex}|${shared ? 1 : 0}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const icon = L.divIcon({
    className: `tc-marker tc-squad-quest${shared ? " tc-shared" : ""}`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<div class="tc-poi-glyph" style="color:${hex}">${QUEST_GLYPH_SVG}</div>`,
  });
  iconCache.set(key, icon);
  return icon;
}

export default function SquadQuestLayer({
  mapId,
  questStates,
  sharedQuestIds,
}: {
  mapId: string;
  questStates: Record<string, DerivedQuestState>; // by member id (others only)
  /** Quest ids ≥2 squadmates have active — pins get the shared-objective ring. */
  sharedQuestIds?: Set<string>;
}) {
  const squad = useSquad();
  const toLatLng = getGameToLatLng(mapId);
  if (!toLatLng) return null;

  return (
    <>
      {squad.members.map((member) => {
        if (member.id === squad.selfId) return null;
        if (squad.hiddenQuests[member.id]) return null;
        const objectives = questStates[member.id]?.availableObjectivesByMap[mapId];
        if (!objectives || objectives.length === 0) return null;
        const hex = hexForColorId(member.colorId);
        return objectives.map(({ task, objective }) => {
          const pos = resolvePosition(objective, mapId);
          if (!pos) return null;
          return (
            <Marker
              key={`${member.id}:${task.id}:${objective.id}`}
              position={toLatLng(pos.x, pos.z) as L.LatLngExpression}
              icon={questIcon(hex, sharedQuestIds?.has(task.id) ?? false)}
              keyboard={false}
              zIndexOffset={400}
            >
              <Tooltip direction="top" className="tc-poi-tip" opacity={1}>
                <span style={{ color: hex, fontWeight: 700 }}>{member.name}</span>
                <br />
                <span>{task.name}</span>
                {objective.description && (
                  <>
                    <br />
                    <small>{objective.description}</small>
                  </>
                )}
              </Tooltip>
            </Marker>
          );
        });
      })}
    </>
  );
}
