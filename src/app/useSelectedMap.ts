import { useEffect, useMemo, useState } from 'react';
import type { DerivedQuestState } from '../quests/derive';
import { getMapDef, SUPPORTED_MAP_NAMES } from '../map/mapDefs';

const SELECTED_MAP_KEY = 'tc_selected_map';

// The map on screen. Persisted, and picked automatically (the map with the most
// active quests) when nothing valid is selected once quest data arrives.
export function useSelectedMap(questState: DerivedQuestState | null) {
  const [selectedMapId, setSelectedMapId] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_MAP_KEY),
  );

  // Resolve default selected map once questState arrives. This corrects the
  // selection in response to async quest data loading (an external system), so
  // the setSelectedMapId calls below are an intended sync, not a cascade.
  useEffect(() => {
    if (!questState) return;
    const objsByMap = questState.availableObjectivesByMap;
    const tasksByMap = questState.availableTasksByMap;
    const allMapIds = Array.from(
      new Set([...Object.keys(objsByMap), ...Object.keys(tasksByMap)]),
    );
    const stored = selectedMapId;
    // Keep the user's pick if it's any supported map (QA may select a map with
    // zero active quests) or a map that currently has quests.
    if (stored && (allMapIds.includes(stored) || stored in SUPPORTED_MAP_NAMES)) return;
    if (allMapIds.length === 0) {
      // No active-quest map and nothing valid selected — leave whatever the
      // user picked (a supported map), else clear.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!stored || !(stored in SUPPORTED_MAP_NAMES)) setSelectedMapId(null);
      return;
    }
    const best = allMapIds
      .map((id) => ({
        id,
        score: (objsByMap[id]?.length ?? 0) + (tasksByMap[id]?.length ?? 0),
      }))
      .sort((a, b) => b.score - a.score)[0];
    setSelectedMapId(best.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questState]);

  useEffect(() => {
    if (selectedMapId) localStorage.setItem(SELECTED_MAP_KEY, selectedMapId);
  }, [selectedMapId]);

  const selectedMapDef = useMemo(
    () => (selectedMapId ? getMapDef(selectedMapId) : undefined),
    [selectedMapId],
  );

  return { selectedMapId, setSelectedMapId, selectedMapDef };
}
