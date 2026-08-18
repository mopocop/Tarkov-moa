// Fallback data sources for when tarkov.dev cannot be reached.
//
// Two tiers, both behind the live API and the local cache:
//
//   remote  — the snapshot committed to this repo, served by GitHub's CDN and
//             refreshed daily by .github/workflows/data-snapshot.yml. Covers
//             every supported language and survives a tarkov.dev outage without
//             needing a new app release.
//   bundled — the English snapshot compiled into the binary. The last resort:
//             a fresh install with no cache and no network at all.
//
// Neither is written to the cache. Caching a fallback would make it look fresh
// for the next 24h and stop the app retrying the real API on the next launch.

import bundledEn from '../../data/snapshot/en.json';
import type { ApiLang } from './tarkov-dev';

/** The shape scripts/fetch-snapshot.mjs writes. */
export interface Snapshot {
  generatedAt: string | null;
  lang: string;
  tasks: unknown[];
  maps: unknown[];
}

/** Datasets a snapshot covers. POIs are deliberately not snapshotted. */
export type SnapshotField = 'tasks' | 'maps';

export interface SnapshotHit<T> {
  data: T;
  /** When the snapshot was generated, as epoch ms — for the "data is old" notice. */
  generatedAt: number | null;
}

const BASE_URL = 'https://raw.githubusercontent.com/mopocop/Tarkov-moa/main/data/snapshot';
const FETCH_TIMEOUT_MS = 8000;

function parseGeneratedAt(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function pick<T>(snap: Snapshot | null, field: SnapshotField): SnapshotHit<T> | null {
  const rows = snap?.[field];
  // An empty array is the placeholder that ships before the workflow's first
  // run. Treat it as "no snapshot" rather than as "this game has no quests".
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { data: rows as T, generatedAt: parseGeneratedAt(snap?.generatedAt ?? null) };
}

/** The snapshot committed to the repo, over HTTPS. Null on any failure. */
export async function remoteSnapshot<T>(
  lang: ApiLang,
  field: SnapshotField,
): Promise<SnapshotHit<T> | null> {
  try {
    // Bounded: this runs while the user is already staring at an empty screen,
    // so a hung request is worse than no fallback.
    const res = await fetch(`${BASE_URL}/${lang}.json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return pick<T>((await res.json()) as Snapshot, field);
  } catch {
    return null;
  }
}

/**
 * The snapshot compiled into the binary. English only — shipping six languages
 * would multiply the installer for a tier that almost nobody reaches. A user
 * whose only remaining source is this one gets correct ids, positions and
 * requirements, with English names.
 */
export function bundledSnapshot<T>(field: SnapshotField): SnapshotHit<T> | null {
  return pick<T>(bundledEn as Snapshot, field);
}
