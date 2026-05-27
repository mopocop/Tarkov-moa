import { describe, it, expect } from 'vitest';
import { deriveQuestState } from './derive';
import type { TarkovTask, TarkovTrackerProgress } from '../api/types';

function progress(
  playerLevel: number,
  entries: Array<{ id: string; complete?: boolean; failed?: boolean; invalid?: boolean }>,
): TarkovTrackerProgress {
  return {
    playerLevel,
    taskProgress: entries.map((e) => ({
      id: e.id,
      complete: !!e.complete,
      failed: !!e.failed,
      invalid: !!e.invalid,
    })),
  };
}

const debutA: TarkovTask = {
  id: 't-debut-a',
  name: 'Debut A',
  minPlayerLevel: 1,
};

const followUp: TarkovTask = {
  id: 't-follow',
  name: 'Follow Up',
  minPlayerLevel: 1,
  taskRequirements: [{ task: { id: 't-debut-a', name: 'Debut A' }, status: ['complete'] }],
};

const levelGated: TarkovTask = {
  id: 't-level',
  name: 'Level Gated',
  minPlayerLevel: 20,
};

const woodsKill: TarkovTask = {
  id: 't-woods-kill',
  name: 'Woods Kill',
  minPlayerLevel: 1,
  map: { id: 'map-woods', name: 'Woods' },
  objectives: [
    {
      id: 'o-1',
      type: 'shoot',
      description: 'Kill scavs',
      zones: [
        { id: 'z-1', map: { id: 'map-woods', name: 'Woods' }, position: { x: 100, y: 0, z: 200 } },
      ],
    },
  ],
};

const customsFind: TarkovTask = {
  id: 't-customs-find',
  name: 'Customs Find',
  minPlayerLevel: 1,
  objectives: [
    {
      id: 'o-2',
      type: 'findQuestItem',
      description: 'Find dossier',
      possibleLocations: [
        { map: { id: 'map-customs', name: 'Customs' }, positions: [{ x: 5, y: 0, z: 7 }] },
      ],
    },
  ],
};

const positionlessKill: TarkovTask = {
  id: 't-positionless',
  name: 'Positionless',
  minPlayerLevel: 1,
  objectives: [
    {
      id: 'o-3',
      type: 'shoot',
      description: 'Kill 10 PMCs (any map)',
      maps: [{ id: 'map-customs', name: 'Customs' }],
      // no zones, no possibleLocations
    },
  ],
};

describe('deriveQuestState', () => {
  it('puts an incomplete, requirement-free, level-met task into available', () => {
    const state = deriveQuestState(progress(5, []), [debutA]);
    expect(state.available.map((t) => t.id)).toEqual(['t-debut-a']);
    expect(state.locked).toEqual([]);
  });

  it('puts an incomplete task with unmet prerequisite into locked', () => {
    const state = deriveQuestState(progress(5, []), [followUp]);
    expect(state.available).toEqual([]);
    expect(state.locked.map((t) => t.id)).toEqual(['t-follow']);
  });

  it('unlocks a task once its prerequisite is complete', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-debut-a', complete: true }]),
      [debutA, followUp],
    );
    expect(state.available.map((t) => t.id)).toEqual(['t-follow']);
    expect(state.locked).toEqual([]);
  });

  it('excludes completed tasks from both buckets', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-debut-a', complete: true }]),
      [debutA],
    );
    expect(state.available).toEqual([]);
    expect(state.locked).toEqual([]);
  });

  it('excludes failed and invalid tasks from both buckets', () => {
    const state = deriveQuestState(
      progress(5, [
        { id: 't-debut-a', failed: true },
        { id: 't-follow', invalid: true },
      ]),
      [debutA, followUp],
    );
    expect(state.available).toEqual([]);
    expect(state.locked).toEqual([]);
  });

  it('treats a level-gated task as locked when player level is too low', () => {
    const state = deriveQuestState(progress(5, []), [levelGated]);
    expect(state.locked.map((t) => t.id)).toEqual(['t-level']);
    expect(state.available).toEqual([]);
  });

  it('moves a level-gated task to available once player level is met', () => {
    const state = deriveQuestState(progress(25, []), [levelGated]);
    expect(state.available.map((t) => t.id)).toEqual(['t-level']);
  });

  it('groups available tasks by their primary map', () => {
    const state = deriveQuestState(progress(5, []), [woodsKill]);
    expect(state.availableTasksByMap['map-woods']?.map((t) => t.id)).toEqual(['t-woods-kill']);
  });

  it('falls back to objective maps when task has no primary map', () => {
    const state = deriveQuestState(progress(5, []), [customsFind]);
    expect(state.availableTasksByMap['map-customs']?.map((t) => t.id)).toEqual(['t-customs-find']);
  });

  it('emits objectives with positions into availableObjectivesByMap', () => {
    const state = deriveQuestState(progress(5, []), [woodsKill, customsFind]);
    expect(state.availableObjectivesByMap['map-woods']).toHaveLength(1);
    expect(state.availableObjectivesByMap['map-customs']).toHaveLength(1);
  });

  it('omits objectives that have no position info from the marker bucket', () => {
    const state = deriveQuestState(progress(5, []), [positionlessKill]);
    // The task itself can still be in availableTasksByMap (sidebar list), but no markers.
    expect(state.availableObjectivesByMap['map-customs']).toBeUndefined();
    expect(state.availableTasksByMap['map-customs']?.map((t) => t.id)).toEqual(['t-positionless']);
  });
});
