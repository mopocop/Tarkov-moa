import { describe, it, expect } from 'vitest';
import { MAPS, SUPPORTED_MAP_NAMES } from './mapDefs';
import { CANONICAL_MAP_ID } from './canonicalMap';
import { mapIdFromLogLocation } from './logLocationMap';

/**
 * Every map id json.tarkov.dev served on 2026-08-26, by normalizedName.
 *
 * These are BSG's own ids, not a vendor's surrogate — the game writes them into
 * its logs and the upstream reuses them verbatim — so they are stable across a
 * change of data source and safe to pin.
 *
 * This guard exists because two of them were WRONG for the app's whole life and
 * nothing noticed: Reserve was recorded as ...d2720bac... (a transposition of
 * Woods' id) and Terminal as an id that appears nowhere upstream. Objectives for
 * Reserve therefore bucketed under an id absent from MAPS, and its 127 objective
 * references never produced a marker.
 *
 * The assertion is one-directional on purpose: everything the app names must be
 * a real upstream id, but the app is free to not know about a map BSG just
 * added. A new map upstream must never turn this suite red.
 */
const UPSTREAM_MAP_IDS: Record<string, string> = {
  factory: '55f2d3fd4bdc2d5f408b4567',
  customs: '56f40101d2720b2a4d8b45d6',
  woods: '5704e3c2d2720bac5b8b4567',
  lighthouse: '5704e4dad2720bb55b8b4567',
  shoreline: '5704e554d2720bac5b8b456e',
  reserve: '5704e5fad2720bc05b8b4567',
  interchange: '5714dbc024597771384a510d',
  'streets-of-tarkov': '5714dc692459777137212e12',
  'night-factory': '59fc81d786f774390775787e',
  'the-lab': '5b0fc42d86f7744a585f9105',
  'ground-zero': '653e6760052c01c1c805532f',
  'ground-zero-21': '65b8d6f5cdde2479cb2a3125',
  terminal: '65cc8f81a9aac3e77d0cfd3e',
  'the-labyrinth': '6733700029c367a3d40b02af',
  'ground-zero-tutorial': '68236e8153654e8c1200798a',
  icebreaker: '69af492a4819ea4ba10a69c5',
  'the-lab-dark': '6a294a5b5eb5f9a1700417b7',
};

const KNOWN = new Set(Object.values(UPSTREAM_MAP_IDS));
const nameOf = (id: string): string =>
  Object.entries(UPSTREAM_MAP_IDS).find(([, v]) => v === id)?.[0] ?? 'NOT AN UPSTREAM MAP ID';

describe('map ids match the upstream', () => {
  it('every MAPS key is a real upstream map id', () => {
    const strays = Object.keys(MAPS).filter((id) => !KNOWN.has(id));
    expect(strays.map((id) => `${id} (${nameOf(id)})`)).toEqual([]);
  });

  it('every SUPPORTED_MAP_NAMES key is a real upstream map id', () => {
    const strays = Object.keys(SUPPORTED_MAP_NAMES).filter((id) => !KNOWN.has(id));
    expect(strays.map((id) => `${id} (${nameOf(id)})`)).toEqual([]);
  });

  it('every canonical-map mapping, both sides, is a real upstream map id', () => {
    const ids = [...Object.keys(CANONICAL_MAP_ID), ...Object.values(CANONICAL_MAP_ID)];
    expect(ids.filter((id) => !KNOWN.has(id))).toEqual([]);
  });

  // The log bridge is the one table the game itself drives: a wrong id here
  // means the app cannot tell which map the player just loaded into.
  it('every log location resolves to a real upstream map id', () => {
    for (const location of ['bigmap', 'rezervbase', 'woods', 'shoreline', 'interchange']) {
      const id = mapIdFromLogLocation(location);
      expect(id, `log location "${location}"`).toBeDefined();
      expect(KNOWN.has(id!), `log location "${location}" -> ${id}`).toBe(true);
    }
  });

  // The two that were actually wrong, pinned by name so a regression reads
  // clearly instead of as a hex diff.
  it('Reserve and Terminal use the ids the upstream actually serves', () => {
    expect(mapIdFromLogLocation('rezervbase')).toBe(UPSTREAM_MAP_IDS.reserve);
    expect(mapIdFromLogLocation('terminal')).toBe(UPSTREAM_MAP_IDS.terminal);
    expect(SUPPORTED_MAP_NAMES[UPSTREAM_MAP_IDS.reserve]).toBe('Reserve');
    expect(SUPPORTED_MAP_NAMES[UPSTREAM_MAP_IDS.terminal]).toBe('Terminal');
  });
});
