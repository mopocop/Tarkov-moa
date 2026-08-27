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

// There was a level gate here that hid Ground Zero 21+ from players below level
// 21. It was removed because the app has no way to learn the player's level:
// nothing in the game's logs carries it, the Rust side reads only the config,
// the log directory and the language, and no screen ever asked. setPlayerLevel
// existed but was never called, so the level sat at its default of 1 forever and
// the gate was permanently shut.
//
// The result was backwards. A low-level player was correctly spared a few quests
// they could not take yet; a high-level player — every real user, eventually —
// silently lost that content, with no setting to turn it back on and nothing to
// suggest anything was missing. Squadmates were already exempt (their pins are
// derived with the level pinned high), so a teammate's Ground Zero 21+ markers
// rendered while the player's own never did.
//
// Showing a quest slightly before it is reachable is a much smaller error than
// hiding one that is.

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
        canonicalIds.add(canonicalMapId(id));
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
        canonicalIds.add(canonicalMapId(mapId));
      });
      canonicalIds.forEach((mapId) =>
        pushByMap(availableObjectivesByMap, mapId, { task, objective: obj }),
      );
    });
  }

  return { available, anyLocation, locked, availableTasksByMap, availableObjectivesByMap };
}
