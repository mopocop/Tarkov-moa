// "Squad quests by map" — a compact planning aid under the map picker. For every
// map where someone in the squad has an active quest, it shows a colored count
// chip per member (incl. you), e.g.  Shoreline — You 3 · Bot 2. Click a map row
// to jump to it. Counts are quests (tasks), matching the picker's own count.
//
// Only the local player's questState is authoritative for "you"; teammates'
// states are re-derived from their broadcast IDs (see squadQuests.ts).

import type { DerivedQuestState } from "../quests/derive";
import { SUPPORTED_MAP_NAMES } from "../map/MapView";
import { useSquad } from "../squad/SquadContext";
import { hexForColorId } from "../../shared/squadProtocol";

interface Props {
  selfQuestState: DerivedQuestState | null;
  questStates: Record<string, DerivedQuestState>; // others, by member id
  selectedMapId: string | null;
  onSelect: (mapId: string) => void;
}

export default function SquadQuestSummary({
  selfQuestState,
  questStates,
  selectedMapId,
  onSelect,
}: Props) {
  const squad = useSquad();
  if (!squad.inSquad) return null;

  // Pair each member with their derived quest state (self uses the local one).
  const participants = squad.members.map((m) => ({
    member: m,
    byMap: (m.id === squad.selfId ? selfQuestState : questStates[m.id])
      ?.availableTasksByMap,
  }));

  // Union of every map any participant has quests on.
  const mapIds = new Set<string>();
  for (const p of participants) {
    if (p.byMap) for (const id of Object.keys(p.byMap)) mapIds.add(id);
  }

  const rows = [...mapIds]
    .map((id) => {
      const chips = participants
        .map((p) => ({
          id: p.member.id,
          name: p.member.name,
          hex: hexForColorId(p.member.colorId),
          isSelf: p.member.id === squad.selfId,
          count: p.byMap?.[id]?.length ?? 0,
        }))
        .filter((c) => c.count > 0);
      const total = chips.reduce((s, c) => s + c.count, 0);
      return { id, name: SUPPORTED_MAP_NAMES[id] ?? id, chips, total };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  if (rows.length === 0) return null;

  return (
    <section className="squad-quest-summary">
      <label className="squad-label">Squad quests by map</label>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          className={`sqs-row${row.id === selectedMapId ? " active" : ""}`}
          onClick={() => onSelect(row.id)}
          title={`Show ${row.name}`}
        >
          <span className="sqs-map">{row.name}</span>
          <span className="sqs-chips">
            {row.chips.map((c) => (
              <span key={c.id} className="sqs-chip" title={`${c.name}: ${c.count}`}>
                <span className="squad-dot" style={{ background: c.hex }} />
                {c.isSelf ? "You" : c.name} {c.count}
              </span>
            ))}
          </span>
        </button>
      ))}
    </section>
  );
}
