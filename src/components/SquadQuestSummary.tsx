// "Squad quests by map" — a compact planning aid under the map picker. For every
// map where someone in the squad has an active quest, it shows a colored count
// chip per member (incl. you), e.g.  Shoreline — You 3 · Bot 2. Click a map row
// to jump to it. Counts are quests (tasks), matching the picker's own count.
//
// Only the local player's questState is authoritative for "you"; teammates'
// states are re-derived from their broadcast IDs (see squadQuests.ts).

import type { DerivedQuestState } from "../quests/derive";
import { SUPPORTED_MAP_NAMES } from "../map/mapDefs";
import { resolveMapName } from "../quests/mapNames";
import { useSquad } from "../squad/useSquad";
import { hexForColorId } from "../../shared/squadProtocol";
import { useTranslation } from 'react-i18next';

interface Props {
  selfQuestState: DerivedQuestState | null;
  questStates: Record<string, DerivedQuestState>; // others, by member id
  onSelect: (mapId: string) => void;
}

export default function SquadQuestSummary({
  selfQuestState,
  questStates,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const squad = useSquad();
  if (!squad.inSquad) return null;

  // Pair each member with their derived quest state (self uses the local one).
  const participants = squad.members.map((m) => {
    const state = m.id === squad.selfId ? selfQuestState : questStates[m.id];
    return { member: m, state, byMap: state?.availableTasksByMap };
  });

  // Maps missing from the static list (newer maps) take their name from the
  // quest data, as the map picker does, instead of showing a raw id.
  const nameFor = (id: string): string => {
    if (SUPPORTED_MAP_NAMES[id]) return SUPPORTED_MAP_NAMES[id];
    for (const { state } of participants) {
      if (!state) continue;
      const n = resolveMapName(id, state.availableTasksByMap, state.availableObjectivesByMap);
      if (n !== "Unknown map") return n;
    }
    return id;
  };

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
      return { id, name: nameFor(id), chips, total };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  if (rows.length === 0) return null;

  return (
    <section className="squad-quest-summary">
      <label className="squad-label">{t('quests.squadQuestsByMap')}</label>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          className="sqs-row"
          onClick={() => onSelect(row.id)}
          title={t('mapEmpty.openMap', { name: row.name })}
        >
          <span className="sqs-map">{row.name}</span>
          <span className="sqs-chips">
            {row.chips.map((c) => (
              <span
                key={c.id}
                className="sqs-chip"
                style={{ color: c.hex }}
                title={`${c.isSelf ? t('squad.you') : c.name}: ${t('quests.questsWithCount', { count: c.count })}`}
              >
                {c.count}
              </span>
            ))}
          </span>
        </button>
      ))}
    </section>
  );
}
