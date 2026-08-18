import type { APICache, TarkovMap, TarkovTask, MapPoiData } from "./types";
import { remoteSnapshot, bundledSnapshot, type SnapshotField } from "./snapshot";

const ENDPOINT = 'https://api.tarkov.dev/graphql';
const TASKS_CACHE_KEY = 'td_tasks_cache_v4';
const MAPS_CACHE_KEY = 'td_maps_cache_v3';
const MAP_POIS_CACHE_KEY = "td_map_pois_cache_v1";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h — tarkov.dev data is largely static between patches.

// tarkov.dev's LanguageCode enum. We only ever pass codes from our supported
// set, so inlining the enum literal into the query is safe (no injection risk).
// "en" is the API default; passing it is a harmless no-op.
export type ApiLang = 'en' | 'pt' | 'ru' | 'ja' | 'zh' | 'es';
const langArg = (lang: ApiLang): string => (lang === 'en' ? '' : `(lang: ${lang})`);

// Caches are keyed per-language so switching languages doesn't thrash a single
// slot and each locale's data persists independently.
const cacheKey = (base: string, lang: ApiLang): string => `${base}_${lang}`;

const tasksQuery = (lang: ApiLang): string => `
  query GetTasks {
    tasks${langArg(lang)} {
      id
      name
      minPlayerLevel
      wikiLink
      map { id name }
      trader { name }
      taskRequirements {
        task { id name }
        status
      }
      objectives {
        id
        type
        description
        maps { id name }
        ... on TaskObjectiveQuestItem {
          possibleLocations {
            map { id name }
            positions { x y z }
          }
        }
        ... on TaskObjectiveMark {
          zones {
            id
            map { id name }
            position { x y z }
          }
        }
        ... on TaskObjectiveBasic {
          zones {
            id
            map { id name }
            position { x y z }
          }
        }
        ... on TaskObjectiveExtract {
          exitName
          exitStatus
          zoneNames
        }
      }
    }
  }
`;

const mapsQuery = (lang: ApiLang): string => `
  query GetMaps {
    maps${langArg(lang)} {
      id
      name
      normalizedName
    }
  }
`;

const mapPoisQuery = (lang: ApiLang): string => `
  query GetMapPois {
    maps${langArg(lang)} {
      id
      extracts { id name faction switches { id name } transferItem { item { id name } count } position { x y z } }
      transits { id description conditions map { id name } position { x y z } }
      spawns { zoneName position { x y z } sides categories }
      bosses { boss { name normalizedName } spawnChance spawnLocations { name chance } }
      hazards { hazardType name position { x y z } }
      lootContainers { lootContainer { id name normalizedName } position { x y z } }
    }
  }
`;

async function gqlFetch<T>(query: string): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`tarkov.dev returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  // GraphQL can return partial data alongside errors — e.g. the maps query
  // errors on a transit whose destination map id no longer exists, yet still
  // returns every other field. Treat data-present-with-errors as partial
  // success (warn + use it); only throw when there is no data at all. Without
  // this, one stale reference would discard the entire POI dataset.
  if (body.errors?.length) {
    const msg = body.errors.map((e) => e.message).join('; ');
    if (body.data) {
      console.warn(`[tarkov.dev] GraphQL partial error (using partial data): ${msg}`);
    } else {
      throw new Error(`tarkov.dev GraphQL error: ${msg}`);
    }
  }
  if (!body.data) throw new Error('tarkov.dev returned no data');
  return body.data;
}

/** A cache hit, plus whether it is past CACHE_DURATION. */
interface CacheHit<T> {
  data: T;
  timestamp: number;
  stale: boolean;
}

// An expired entry is reported as stale but NEVER deleted. Deleting on read was
// a real outage amplifier: when tarkov.dev went down (2026-08-17, GraphQL 422
// for hours), every app that opened past the 24h mark threw away the good copy
// it was holding, then failed to replace it, and showed an empty screen. Quest
// data is near-static between game patches, so an old copy is worth far more
// than nothing. The only writer is saveCache, on a successful fetch.
function loadCache<T>(key: string): CacheHit<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as APICache<T>;
    if (parsed?.data === undefined || typeof parsed.timestamp !== 'number') return null;
    return {
      data: parsed.data,
      timestamp: parsed.timestamp,
      stale: Date.now() - parsed.timestamp >= CACHE_DURATION,
    };
  } catch {
    return null;
  }
}

function saveCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() } as APICache<T>));
  } catch {
    // ignore quota errors
  }
}

/**
 * When a dataset was served from an expired cache because the network attempt
 * failed. `servedAt` is the timestamp of the OLDEST such copy, so the UI can say
 * how far behind the user actually is.
 */
export interface StaleInfo {
  stale: boolean;
  servedAt: number | null;
}

export class TarkovDevClient {
  private lang: ApiLang;
  /** baseKey -> timestamp of the expired copy served for it. */
  private servedStale = new Map<string, number>();

  constructor(lang: ApiLang = 'en') {
    this.lang = lang;
  }

  /** Whether any dataset fell back past the live API (cache or snapshot). */
  get staleInfo(): StaleInfo {
    if (this.servedStale.size === 0) return { stale: false, servedAt: null };
    return { stale: true, servedAt: Math.min(...this.servedStale.values()) };
  }

  /**
   * Resolution order, best source first:
   *
   *   1. a fresh local cache            — no network at all
   *   2. the live tarkov.dev API        — the only source that can be current
   *   3. an expired local cache         — your data, just old
   *   4. the snapshot committed to this repo, over GitHub's CDN
   *   5. the snapshot compiled into the binary (English, tasks/maps only)
   *
   * Steps 3-5 exist because tarkov.dev is the app's only upstream, and when it
   * is down there is nothing the app can do to make it come back. What it can
   * do is refuse to lose what it already had, and refuse to start from nothing.
   * The error only reaches the caller when every tier is empty.
   *
   * Fallback data is never written to the cache: a cached fallback would look
   * fresh for the next 24h and stop the app retrying the real API on launch.
   */
  private async load<R, T>(
    baseKey: string,
    query: string,
    select: (raw: R) => T,
    force: boolean,
    snapshotField?: SnapshotField,
  ): Promise<T> {
    const key = cacheKey(baseKey, this.lang);
    const cached = loadCache<T>(key);

    if (!force && cached && !cached.stale) {
      this.servedStale.delete(baseKey);
      return cached.data;
    }

    try {
      const data = select(await gqlFetch<R>(query));
      saveCache(key, data);
      this.servedStale.delete(baseKey);
      return data;
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);

      if (cached) {
        const age = Math.round((Date.now() - cached.timestamp) / 3_600_000);
        console.warn(`[tarkov.dev] ${baseKey}: fetch failed, serving cache from ~${age}h ago —`, why);
        this.servedStale.set(baseKey, cached.timestamp);
        return cached.data;
      }

      if (snapshotField) {
        const remote = await remoteSnapshot<T>(this.lang, snapshotField);
        if (remote) {
          console.warn(`[tarkov.dev] ${baseKey}: no cache, serving the repo snapshot —`, why);
          this.servedStale.set(baseKey, remote.generatedAt ?? Date.now());
          return remote.data;
        }

        const local = bundledSnapshot<T>(snapshotField);
        if (local) {
          console.warn(`[tarkov.dev] ${baseKey}: offline, serving the bundled snapshot —`, why);
          this.servedStale.set(baseKey, local.generatedAt ?? Date.now());
          return local.data;
        }
      }

      throw err;
    }
  }

  async getTasks(force = false): Promise<TarkovTask[]> {
    return this.load<{ tasks: TarkovTask[] }, TarkovTask[]>(
      TASKS_CACHE_KEY,
      tasksQuery(this.lang),
      (raw) => raw.tasks,
      force,
      'tasks',
    );
  }

  async getMaps(force = false): Promise<TarkovMap[]> {
    return this.load<{ maps: TarkovMap[] }, TarkovMap[]>(
      MAPS_CACHE_KEY,
      mapsQuery(this.lang),
      (raw) => raw.maps,
      force,
      'maps',
    );
  }

  // No snapshot tier: POIs are the largest payload by far and the app already
  // renders usefully without them, so they stay out of the committed snapshot.
  async getMapPois(force = false): Promise<MapPoiData[]> {
    return this.load<{ maps: MapPoiData[] }, MapPoiData[]>(
      MAP_POIS_CACHE_KEY,
      mapPoisQuery(this.lang),
      (raw) => raw.maps,
      force,
    );
  }

  clearCache(): void {
    // Clear every per-language slot for all three datasets. This is the explicit
    // user-driven wipe (Settings → clear cache); expiry alone never deletes.
    for (const lang of ['en', 'pt', 'ru', 'ja', 'zh', 'es'] as const) {
      localStorage.removeItem(cacheKey(TASKS_CACHE_KEY, lang));
      localStorage.removeItem(cacheKey(MAPS_CACHE_KEY, lang));
      localStorage.removeItem(cacheKey(MAP_POIS_CACHE_KEY, lang));
    }
    this.servedStale.clear();
  }
}
