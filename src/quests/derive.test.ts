import { describe, it, expect } from 'vitest';
import { deriveQuestState } from './derive';
import type { TarkovTask, TarkovTrackerProgress } from '../api/types';

function progress(
  playerLevel: number,
  entries: Array<{
    id: string;
    accepted?: boolean;
    complete?: boolean;
    failed?: boolean;
    invalid?: boolean;
  }>,
): TarkovTrackerProgress {
  return {
    playerLevel,
    tasksProgress: entries.map((e) => ({
      id: e.id,
      accepted: !!e.accepted,
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

const handover: TarkovTask = {
  id: 't-handover',
  name: 'Shortage-like handover',
  minPlayerLevel: 1,
  // No task.map, and objectives carry no map/zone/possibleLocation info.
  objectives: [
    { id: 'o-h', type: 'giveItem', description: 'Hand over 3 salewa kits' },
  ],
};

describe('deriveQuestState (accepted-based active model)', () => {
  it('treats an unaccepted task as locked, not active', () => {
    const state = deriveQuestState(progress(5, []), [debutA]);
    expect(state.available).toEqual([]);
    expect(state.locked.map((t) => t.id)).toEqual(['t-debut-a']);
  });

  it('puts an accepted, incomplete task into available', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-debut-a', accepted: true }]),
      [debutA],
    );
    expect(state.available.map((t) => t.id)).toEqual(['t-debut-a']);
    expect(state.locked).toEqual([]);
  });

  it('does NOT surface a prerequisite-satisfied but unaccepted follow-up', () => {
    // The core bug: completing the prereq must NOT make the follow-up active
    // until the player actually accepts it at the trader.
    const state = deriveQuestState(
      progress(5, [{ id: 't-debut-a', accepted: true, complete: true }]),
      [debutA, followUp],
    );
    expect(state.available).toEqual([]);
    expect(state.locked.map((t) => t.id)).toEqual(['t-follow']);
  });

  it('surfaces the follow-up once it has been accepted', () => {
    const state = deriveQuestState(
      progress(5, [
        { id: 't-debut-a', accepted: true, complete: true },
        { id: 't-follow', accepted: true },
      ]),
      [debutA, followUp],
    );
    expect(state.available.map((t) => t.id)).toEqual(['t-follow']);
    expect(state.locked).toEqual([]);
  });

  it('excludes completed tasks from both buckets', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-debut-a', accepted: true, complete: true }]),
      [debutA],
    );
    expect(state.available).toEqual([]);
    expect(state.locked).toEqual([]);
  });

  it('excludes failed and invalid tasks from both buckets', () => {
    const state = deriveQuestState(
      progress(5, [
        { id: 't-debut-a', accepted: true, failed: true },
        { id: 't-follow', accepted: true, invalid: true },
      ]),
      [debutA, followUp],
    );
    expect(state.available).toEqual([]);
    expect(state.locked).toEqual([]);
  });

  it('groups accepted tasks by their primary map', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-woods-kill', accepted: true }]),
      [woodsKill],
    );
    expect(state.availableTasksByMap['map-woods']?.map((t) => t.id)).toEqual(['t-woods-kill']);
  });

  it('falls back to objective maps when task has no primary map', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-customs-find', accepted: true }]),
      [customsFind],
    );
    expect(state.availableTasksByMap['map-customs']?.map((t) => t.id)).toEqual(['t-customs-find']);
  });

  it('emits accepted objectives with positions into availableObjectivesByMap', () => {
    const state = deriveQuestState(
      progress(5, [
        { id: 't-woods-kill', accepted: true },
        { id: 't-customs-find', accepted: true },
      ]),
      [woodsKill, customsFind],
    );
    expect(state.availableObjectivesByMap['map-woods']).toHaveLength(1);
    expect(state.availableObjectivesByMap['map-customs']).toHaveLength(1);
  });

  it('routes a location-less accepted task into anyLocation, not any map bucket', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-handover', accepted: true }]),
      [handover],
    );
    expect(state.available.map((t) => t.id)).toEqual(['t-handover']);
    expect(state.anyLocation.map((t) => t.id)).toEqual(['t-handover']);
    expect(Object.keys(state.availableTasksByMap)).toEqual([]);
  });

  it('keeps a map-bound accepted task out of anyLocation', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-woods-kill', accepted: true }]),
      [woodsKill],
    );
    expect(state.anyLocation).toEqual([]);
    expect(state.availableTasksByMap['map-woods']?.map((t) => t.id)).toEqual(['t-woods-kill']);
  });

  it('omits objectives that have no position info from the marker bucket', () => {
    const state = deriveQuestState(
      progress(5, [{ id: 't-positionless', accepted: true }]),
      [positionlessKill],
    );
    // The task itself can still be in availableTasksByMap (sidebar list), but no markers.
    expect(state.availableObjectivesByMap['map-customs']).toBeUndefined();
    expect(state.availableTasksByMap['map-customs']?.map((t) => t.id)).toEqual(['t-positionless']);
  });

  // There used to be a gate hiding Ground Zero 21+ below player level 21. It was
  // removed because the app can never learn the player's level — nothing in the
  // game logs carries it and no screen ever asked — so the level sat at its
  // default forever and the gate was permanently shut. These lock in the new
  // behaviour: the content is visible whatever the (meaningless) level says.
  describe('Ground Zero 21+ is no longer level gated', () => {
    const GZ_21 = '65b8d6f5cdde2479cb2a3125';
    const GROUND_ZERO = '653e6760052c01c1c805532f';

    const gzTask: TarkovTask = {
      id: 't-gz-21',
      name: 'Ground Zero 21+ task',
      map: { id: GZ_21, name: 'Ground Zero 21+' },
      objectives: [
        {
          id: 'o-gz',
          type: 'visit',
          zones: [{ map: { id: GZ_21, name: 'Ground Zero 21+' }, position: { x: 1, y: 2, z: 3 } }],
        },
      ],
    } as TarkovTask;

    it('surfaces the task at level 1, collapsed onto Ground Zero', () => {
      const state = deriveQuestState(progress(1, [{ id: 't-gz-21', accepted: true }]), [gzTask]);
      expect(state.availableTasksByMap[GROUND_ZERO]?.map((t) => t.id)).toEqual(['t-gz-21']);
    });

    it('places its marker at level 1 too', () => {
      const state = deriveQuestState(progress(1, [{ id: 't-gz-21', accepted: true }]), [gzTask]);
      expect(state.availableObjectivesByMap[GROUND_ZERO]).toHaveLength(1);
    });

    it('behaves identically at a high level', () => {
      const low = deriveQuestState(progress(1, [{ id: 't-gz-21', accepted: true }]), [gzTask]);
      const high = deriveQuestState(progress(42, [{ id: 't-gz-21', accepted: true }]), [gzTask]);
      expect(low.availableTasksByMap).toEqual(high.availableTasksByMap);
    });
  });
});
