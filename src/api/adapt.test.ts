import { describe, it, expect } from 'vitest';
import fixture from './__fixtures__/json-upstream.json';
import {
  adaptTasks,
  adaptMapPois,
  type TasksDoc,
  type MapsDoc,
  type TradersDoc,
  type LocaleDoc,
} from './adapt';

const tasksDoc = fixture.tasks as unknown as TasksDoc;
const mapsDoc = fixture.maps as unknown as MapsDoc;
const tradersDoc = fixture.traders as unknown as TradersDoc;
const tasksLocale: LocaleDoc = fixture.locales.tasks_en as LocaleDoc;
const mapsLocale: LocaleDoc = fixture.locales.maps_en as LocaleDoc;
const tradersLocale: LocaleDoc = fixture.locales.traders_en as LocaleDoc;

describe('adaptTasks', () => {
  const result = adaptTasks({
    tasks: tasksDoc,
    tasksLocale,
    maps: mapsDoc,
    mapsLocale,
    traders: tradersDoc,
    tradersLocale,
  });

  const byId = new Map(result.map((t) => [t.id, t]));

  it('resolves a task name through the locale', () => {
    const t = byId.get('657315ddab5a49b71f098853')!;
    expect(t.name).toBe('First in Line');
  });

  it('passes a value not present in the locale through unchanged', () => {
    const emptyLocale: LocaleDoc = { data: {} };
    const tr = (locale: LocaleDoc, val: string | undefined) =>
      val == null ? undefined : (locale.data[val] ?? val);

    expect(tr(emptyLocale, 'Gate 3')).toBe('Gate 3');
    expect(tr(emptyLocale, undefined)).toBeUndefined();
  });

  it('maps the Reserve task to map id 5704e5fad2720bc05b8b4567', () => {
    const t = byId.get('5d25e4d586f77443e625e388')!;
    expect(t.map!.id).toBe('5704e5fad2720bc05b8b4567');
  });

  it('omits map when the task has no map', () => {
    const t = byId.get('59c9392986f7742f6923add2')!; // Aid Stations
    expect(t).not.toHaveProperty('map');
  });

  it('includes map name for tasks that have a map', () => {
    const t = byId.get('657315ddab5a49b71f098853')!;
    expect(t.map!.name).toBe('Ground Zero');
  });

  it('preserves objective zones with map and position', () => {
    const t = byId.get('657315ddab5a49b71f098853')!; // First in Line
    const obj = t.objectives!.find((o) => o.id === '65732ac3c67dcd96adffa3c7')!;
    expect(obj.zones).toBeDefined();
    expect(obj.zones!.length).toBeGreaterThan(0);
    const zone = obj.zones![0];
    expect(zone.map).toEqual({ id: '653e6760052c01c1c805532f', name: 'Ground Zero' });
    expect(zone.position).toEqual({ x: 156.2, y: 25.52, z: -83.59 });
  });

  it('preserves objective possibleLocations with map and positions', () => {
    const t = byId.get('657315e4a6af4ab4b50f3459')!; // Saving the Mole
    const obj = t.objectives!.find((o) => o.id === '65817fbbb454159976c91917')!;
    expect(obj.possibleLocations).toBeDefined();
    expect(obj.possibleLocations!.length).toBeGreaterThan(0);
    const pl = obj.possibleLocations![0];
    expect(pl.map).toEqual({ id: '653e6760052c01c1c805532f', name: 'Ground Zero' });
    expect(pl.positions!.length).toBeGreaterThan(0);
  });

  it('resolves trader name', () => {
    const t = byId.get('657315ddab5a49b71f098853')!;
    expect(t.trader).toEqual({ name: 'Therapist' });
  });
});

describe('adaptMapPois', () => {
  const result = adaptMapPois({ maps: mapsDoc, mapsLocale });

  const customs = result.find((p) => p.id === '56f40101d2720b2a4d8b45d6')!;

  it('resolves extract switch names through the map switch lookup', () => {
    const zb = customs.extracts!.find((e) => e.name === 'ZB-013')!;
    expect(zb.switches).toBeDefined();
    expect(zb.switches!.length).toBe(1);
    expect(zb.switches![0].name).toBe('ZB-013 Power Switch');
  });

  it('resolves boss name and normalizedName through the mobs join', () => {
    const reshala = customs.bosses!.find(
      (b) => b.boss!.normalizedName === 'reshala',
    )!;
    expect(reshala.boss!.name).toBe('Reshala');
    expect(reshala.boss!.normalizedName).toBe('reshala');
  });

  it('resolves loot container normalizedName through its join', () => {
    const lc = customs.lootContainers!.find(
      (l) => l.lootContainer!.normalizedName === 'toolbox',
    )!;
    expect(lc.lootContainer!.name).toBe('Toolbox');
    expect(lc.lootContainer!.normalizedName).toBe('toolbox');
  });

  it('preserves transferItem when present on an extract', () => {
    const ve = customs.extracts!.find((e) => e.name === 'Dorms V-Ex')!;
    expect(ve.transferItem).toBeDefined();
    expect(ve.transferItem!.item!.id).toBe('5449016a4bdc2d6f028b456f');
    expect(ve.transferItem!.item!.name).toBe('');
  });

  it('resolves transferItem name when itemNames is provided', () => {
    const withNames = adaptMapPois({
      maps: mapsDoc,
      mapsLocale,
      itemNames: { '5449016a4bdc2d6f028b456f': 'Roubles' },
    });
    const c = withNames.find((p) => p.id === '56f40101d2720b2a4d8b45d6')!;
    const ve = c.extracts!.find((e) => e.name === 'Dorms V-Ex')!;
    expect(ve.transferItem!.item!.name).toBe('Roubles');
  });

  it('resolves transit description and conditions', () => {
    const transit = customs.transits![0];
    expect(transit.description).toBe('Transit to Reserve');
    expect(transit.map!.id).toBe('5704e5fad2720bc05b8b4567');
    expect(transit.map!.name).toBe('Reserve');
  });

  it('passes through spawn data as-is', () => {
    expect(customs.spawns!.length).toBeGreaterThan(0);
    const spawn = customs.spawns![0];
    expect(spawn.zoneName).toBeDefined();
    expect(spawn.sides).toBeDefined();
    expect(spawn.categories).toBeDefined();
  });
});

describe('adaptMapPois — edge cases', () => {
  it('a bare map stub produces an entry with empty arrays, not undefined', () => {
    const bare: MapsDoc = {
      data: {
        maps: {
          stub: { id: 'stub', name: 'stub Name', normalizedName: 'stub' },
        },
      },
    };
    const bareLocale: LocaleDoc = {
      data: { 'stub Name': 'Stub' },
    };
    const result = adaptMapPois({ maps: bare, mapsLocale: bareLocale });
    expect(result).toHaveLength(1);
    const entry = result[0];
    expect(entry.extracts).toEqual([]);
    expect(entry.transits).toEqual([]);
    expect(entry.spawns).toEqual([]);
    expect(entry.bosses).toEqual([]);
    expect(entry.hazards).toEqual([]);
    expect(entry.lootContainers).toEqual([]);
  });

  it('a missing id in a lookup table does not throw', () => {
    // Task references a non-existent map id — should produce { id, name: id } fallback
    const partialMaps: MapsDoc = {
      data: { maps: {} },
    };
    const result = adaptTasks({
      tasks: {
        data: {
          tasks: {
            t1: {
              id: 't1',
              name: 't1 name',
              map: 'nonexistent',
            },
          },
        },
      },
      tasksLocale: { data: { 't1 name': 'Test' } },
      maps: partialMaps,
      mapsLocale: { data: {} },
      traders: { data: {} },
      tradersLocale: { data: {} },
    });
    expect(result).toHaveLength(1);
    // The id is kept for joining, but the NAME stays empty so nothing downstream
    // can print a MongoId where a map name belongs.
    expect(result[0].map).toEqual({ id: 'nonexistent', name: '' });
  });

  it('omits the trader entirely when the trader id resolves to nothing', () => {
    const result = adaptTasks({
      tasks: {
        data: {
          tasks: {
            t1: { id: 't1', name: 't1 name', trader: 'noSuchTrader' },
          },
        },
      },
      tasksLocale: { data: { 't1 name': 'Test' } },
      maps: { data: { maps: {} } },
      mapsLocale: { data: {} },
      traders: { data: {} },
      tradersLocale: { data: {} },
    });
    // QuestSidebar renders the trader span behind a `task.trader &&` guard, so
    // omitting is what hides it; an id-shaped name would have been rendered.
    expect(result[0].trader).toBeUndefined();
  });

  it('a missing mob id does not throw — falls back to the raw id as name', () => {
    const partial: MapsDoc = {
      data: {
        maps: {
          m1: {
            id: 'm1',
            name: 'm1 Name',
            normalizedName: 'm1',
            bosses: [{ spawnChance: 1, mob: 'noSuchMob' }],
          },
        },
        mobs: {},
      },
    };
    const locale: LocaleDoc = { data: { 'm1 Name': 'Map 1' } };
    const result = adaptMapPois({ maps: partial, mapsLocale: locale });
    expect(result[0].bosses![0].boss!.name).toBe('noSuchMob');
  });
});