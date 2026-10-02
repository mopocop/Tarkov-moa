import { useEffect, useMemo } from 'react';
import type { TarkovTask } from '../api/types';
import type { DerivedQuestState } from '../quests/derive';
import type { SquadApi } from '../squad/SquadContext';
import { deriveMemberQuestState } from '../squad/squadQuests';
import type { PlayerPos } from './useGameEvents';

interface Options {
  squad: SquadApi;
  tasks: TarkovTask[];
  questState: DerivedQuestState | null;
  playerPos: PlayerPos | null;
  selectedMapId: string | null;
}

// What we send to the squad (position, active quest ids) and what we derive
// from what they send (their quest pins, the objectives we share, where they are).
export function useSquadSync({ squad, tasks, questState, playerPos, selectedMapId }: Options) {
  const {
    inSquad: squadInSquad,
    broadcastPosition: squadBroadcastPosition,
    broadcastQuests: squadBroadcastQuests,
  } = squad;

  // Share our position with the squad on each screenshot-driven update.
  useEffect(() => {
    if (squadInSquad && playerPos && selectedMapId) {
      squadBroadcastPosition({
        mapId: selectedMapId,
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
        rotation: playerPos.rotation,
      });
    }
  }, [squadInSquad, squadBroadcastPosition, playerPos, selectedMapId]);

  // Share our active quest IDs with the squad — re-sent whenever they change or
  // we (re)join. Teammates re-derive the objective pins locally from the IDs.
  useEffect(() => {
    if (squadInSquad && questState) {
      squadBroadcastQuests(questState.available.map((t) => t.id));
    }
  }, [squadInSquad, squadBroadcastQuests, questState]);

  // Re-derive each squadmate's quest state from the IDs they broadcast (others
  // only; our own pins come from `questState`). Recomputes only when someone's
  // quests change or the task list reloads.
  const squadQuestStates = useMemo<Record<string, DerivedQuestState>>(() => {
    if (tasks.length === 0) return {};
    const out: Record<string, DerivedQuestState> = {};
    for (const [memberId, ids] of Object.entries(squad.quests)) {
      if (memberId === squad.selfId) continue;
      out[memberId] = deriveMemberQuestState(ids, tasks);
    }
    return out;
  }, [squad.quests, squad.selfId, tasks]);

  // The self eye-toggle (squad card) hides our own on-map shares: quest pins
  // (MarkerLayer) and custom markers (CustomMarkerLayer).
  const showOwnOnMap = !(squad.selfId && squad.hiddenQuests[squad.selfId]);

  // Shared objectives: quest ids that ≥2 squad members (you included) have
  // active right now. Pins for these get a strong "shared objective" ring on
  // the map and a callout in the squad panel — push the same door together.
  const sharedQuestIds = useMemo<Set<string>>(() => {
    if (!squad.inSquad) return new Set();
    const lists: string[][] = [];
    for (const ids of Object.values(squad.quests)) lists.push(ids);
    // Our own list may not be echoed back by the relay — count it locally.
    if (squad.selfId && !squad.quests[squad.selfId] && questState) {
      lists.push(questState.available.map((t) => t.id));
    }
    if (lists.length < 2) return new Set();
    const counts = new Map<string, number>();
    for (const ids of lists) {
      for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, n]) => n >= 2)
        .map(([id]) => id),
    );
  }, [squad.inSquad, squad.quests, squad.selfId, questState]);

  // Human-readable names for the shared quests (squad panel callout).
  const sharedQuestNames = useMemo(
    () => tasks.filter((t) => sharedQuestIds.has(t.id)).map((t) => t.name),
    [tasks, sharedQuestIds],
  );

  // Squadmates currently positioned per map (self excluded) — surfacing where
  // the squad actually is on the deployment board.
  const squadMapCounts = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    if (!squad.inSquad) return out;
    for (const m of squad.members) {
      if (m.id === squad.selfId) continue;
      const pos = squad.positions[m.id];
      if (pos) out[pos.payload.mapId] = (out[pos.payload.mapId] ?? 0) + 1;
    }
    return out;
  }, [squad.inSquad, squad.members, squad.positions, squad.selfId]);

  return { squadQuestStates, showOwnOnMap, sharedQuestIds, sharedQuestNames, squadMapCounts };
}
