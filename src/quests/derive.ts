import type {
  TarkovTask,
  TaskObjective,
  TarkovTrackerProgress,
  TaskProgress,
} from '../api/types';

export interface DerivedQuestState {
  available: TarkovTask[];
  locked: TarkovTask[];
  availableTasksByMap: Record<string, TarkovTask[]>;
  availableObjectivesByMap: Record<
    string,
    Array<{ task: TarkovTask; objective: TaskObjective }>
  >;
}

const COMPLETE_STATUSES = new Set(['complete']);

function progressById(progress: TarkovTrackerProgress): Map<string, TaskProgress> {
  const map = new Map<string, TaskProgress>();
  for (const tp of progress.taskProgress ?? []) {
    map.set(tp.id, tp);
  }
  return map;
}

function isTaskComplete(p: TaskProgress | undefined): boolean {
  return !!p?.complete;
}

function requirementsSatisfied(
  task: TarkovTask,
  progressMap: Map<string, TaskProgress>,
): boolean {
  const requirements = task.taskRequirements ?? [];
  if (requirements.length === 0) return true;

  return requirements.every((req) => {
    const required = progressMap.get(req.task.id);
    const requiresComplete =
      !req.status || req.status.length === 0 || req.status.some((s) => COMPLETE_STATUSES.has(s));
    if (requiresComplete) return isTaskComplete(required);
    // If a non-complete status (e.g. "failed") is required, treat satisfied iff any matches.
    return req.status?.some((s) => {
      if (s === 'failed') return required?.failed === true;
      if (s === 'active') return required && !required.complete && !required.failed && !required.invalid;
      return false;
    }) ?? false;
  });
}

function levelMet(task: TarkovTask, playerLevel: number): boolean {
  return (task.minPlayerLevel ?? 0) <= playerLevel;
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

    const reqsOk = requirementsSatisfied(task, progressMap);
    const levelOk = levelMet(task, playerLevel);

    if (reqsOk && levelOk) {
      available.push(task);
      // Sidebar bucket — by the task's primary map, OR every objective map if no task.map.
      if (task.map?.id) {
        pushByMap(availableTasksByMap, task.map.id, task);
      } else {
        const objectiveMapIds = new Set<string>();
        task.objectives?.forEach((o) => collectObjectiveMaps(o).forEach((id) => objectiveMapIds.add(id)));
        objectiveMapIds.forEach((id) => pushByMap(availableTasksByMap, id, task));
      }
      // Marker bucket — every objective that has any positional info.
      task.objectives?.forEach((obj) => {
        const hasPosition =
          (obj.zones?.some((z) => z.position) ?? false) ||
          (obj.possibleLocations?.some((l) => l.positions && l.positions.length > 0) ?? false);
        if (!hasPosition) return;
        collectObjectiveMaps(obj).forEach((mapId) =>
          pushByMap(availableObjectivesByMap, mapId, { task, objective: obj }),
        );
      });
    } else {
      locked.push(task);
    }
  }

  return { available, locked, availableTasksByMap, availableObjectivesByMap };
}
