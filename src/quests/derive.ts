import type {
  TarkovTask,
  TaskObjective,
  TarkovTrackerProgress,
  TaskProgress,
} from '../api/types';
import { canonicalMapId } from '../map/canonicalMap';

export interface DerivedQuestState {
  // "Active" quests: accepted by the player and not yet completed/failed.
  available: TarkovTask[];
  // Active quests with NO map reference at all (no task.map and no objective
  // maps) — e.g. "Shortage" (hand items to a trader). They can't land in any
  // map bucket, so the sidebar shows them in a dedicated "Any Location" section.
  anyLocation: TarkovTask[];
  // Everything else still incomplete (not accepted yet). Kept for the
  // collapsible "locked" section so QA can still see upcoming quests.
  locked: TarkovTask[];
  availableTasksByMap: Record<string, TarkovTask[]>;
  availableObjectivesByMap: Record<
    string,
    Array<{ task: TarkovTask; objective: TaskObjective }>
  >;
}

// Maps whose quest pool is gated by in-game player level. Hidden from
// availableTasksByMap / availableObjectivesByMap when the player is below
// the threshold, so the picker and markers don't surface a map the player
// can't actually access. Ground Zero 21+ is the only known case in EFT.
const LEVEL_GATED_MAPS: Record<string, number> = {
  '65b8d6f5cdde2479cb2a3125': 21, // Ground Zero 21+
};

function isMapVisible(mapId: string, playerLevel: number): boolean {
  const gate = LEVEL_GATED_MAPS[mapId];
  return gate === undefined || playerLevel >= gate;
}

function progressById(progress: TarkovTrackerProgress): Map<string, TaskProgress> {
  const map = new Map<string, TaskProgress>();
  for (const tp of progress.tasksProgress ?? []) {
    map.set(tp.id, tp);
  }
  return map;
}

function pushByMap<T>(
  bucket: Record<string, T[]>,
  mapId: string | undefined,
  item: T,
): void {
  if (!mapId) return;
  if (!bucket[mapId]) bucket[mapId] = [];
  bucket[mapId].push(item);
}

function collectObjectiveMaps(obj: TaskObjective): string[] {
  const ids = new Set<string>();
  obj.maps?.forEach((m) => ids.add(m.id));
  obj.zones?.forEach((z) => z.map && ids.add(z.map.id));
  obj.possibleLocations?.forEach((l) => ids.add(l.map.id));
  return Array.from(ids);
}

export function deriveQuestState(
  progress: TarkovTrackerProgress,
  tasks: TarkovTask[],
): DerivedQuestState {
  const progressMap = progressById(progress);
  const playerLevel = progress.playerLevel ?? 0;

  const available: TarkovTask[] = [];
  const anyLocation: TarkovTask[] = [];
  const locked: TarkovTask[] = [];
  const availableTasksByMap: Record<string, TarkovTask[]> = {};
  const availableObjectivesByMap: Record<
    string,
    Array<{ task: TarkovTask; objective: TaskObjective }>
  > = {};

  for (const task of tasks) {
    const p = progressMap.get(task.id);
    const incomplete = !p?.complete && !p?.failed && !p?.invalid;
    if (!incomplete) continue;

    // A quest is ACTIVE only if the player has actually accepted it (EFT
    // type-10 event). Prerequisite/level inference is intentionally gone: it
    // surfaced quests the player never picked up. Quests not yet accepted fall
    // into `locked` for the optional "show upcoming" view.
    if (!p?.accepted) {
      locked.push(task);
      continue;
    }

    available.push(task);

    // Collect every map this task references — task.map first, else the union
    // of its objectives' maps. Computed independently of level-gating so a
    // level-gated map quest is NOT mistaken for a location-less one.
    const mapIds = new Set<string>();
    if (task.map?.id) {
      mapIds.add(task.map.id);
    } else {
      task.objectives?.forEach((o) =>
        collectObjectiveMaps(o).forEach((id) => mapIds.add(id)),
      );
    }

    if (mapIds.size === 0) {
      // No location at all (e.g. hand-over quests) — surface in "Any Location".
      anyLocation.push(task);
    } else {
      // Sidebar bucket — only maps the player can currently access. Gate on the
      // ORIGINAL id (the level gate is per-variant), THEN collapse variants to
      // their canonical map and dedup, so a task referencing both a base map and
      // its variant (e.g. Ground Zero + Ground Zero 21+) lands once.
      const canonicalIds = new Set<string>();
      mapIds.forEach((id) => {
        if (isMapVisible(id, playerLevel)) canonicalIds.add(canonicalMapId(id));
      });
      canonicalIds.forEach((id) => pushByMap(availableTasksByMap, id, task));
    }

    // Marker bucket — every objective that has any positional info.
    task.objectives?.forEach((obj) => {
      const hasPosition =
        (obj.zones?.some((z) => z.position) ?? false) ||
        (obj.possibleLocations?.some((l) => l.positions && l.positions.length > 0) ?? false);
      if (!hasPosition) return;
      const canonicalIds = new Set<string>();
      collectObjectiveMaps(obj).forEach((mapId) => {
        if (isMapVisible(mapId, playerLevel)) canonicalIds.add(canonicalMapId(mapId));
      });
      canonicalIds.forEach((mapId) =>
        pushByMap(availableObjectivesByMap, mapId, { task, objective: obj }),
      );
    });
  }

  return { available, anyLocation, locked, availableTasksByMap, availableObjectivesByMap };
}
