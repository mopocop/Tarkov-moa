import { useCallback, useState } from 'react';
import type { DerivedQuestState } from '../quests/derive';

export type Pin = { kind: 'task' | 'objective'; id: string };

// What the user is pointing at in the quest list: the hovered task/objective
// (transient) and the pinned one (sticky). Both highlight pins on the map.
export function useQuestSelection() {
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [hoveredObjectiveId, setHoveredObjectiveId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Pin | null>(null);

  const togglePin = useCallback(
    (kind: 'task' | 'objective', id: string) => {
      setPinned((cur) => (cur && cur.kind === kind && cur.id === id ? null : { kind, id }));
    },
    [],
  );

  const clearHover = useCallback(() => {
    setHoveredTaskId(null);
    setHoveredObjectiveId(null);
  }, []);

  // After a re-derive, drop any hover or pin whose quest is no longer active.
  const pruneStaleSelections = useCallback((state: DerivedQuestState) => {
    const taskIds = new Set<string>();
    const objectiveIds = new Set<string>();
    for (const list of Object.values(state.availableObjectivesByMap)) {
      for (const { task, objective } of list) {
        taskIds.add(task.id);
        objectiveIds.add(objective.id);
      }
    }
    for (const list of Object.values(state.availableTasksByMap)) {
      for (const t of list) taskIds.add(t.id);
    }
    setPinned((cur) => {
      if (!cur) return cur;
      const present = cur.kind === 'task' ? taskIds.has(cur.id) : objectiveIds.has(cur.id);
      return present ? cur : null;
    });
    setHoveredTaskId((cur) => (cur && taskIds.has(cur) ? cur : null));
    setHoveredObjectiveId((cur) => (cur && objectiveIds.has(cur) ? cur : null));
  }, []);

  return {
    hoveredTaskId,
    setHoveredTaskId,
    hoveredObjectiveId,
    setHoveredObjectiveId,
    pinned,
    togglePin,
    clearHover,
    pruneStaleSelections,
  };
}
