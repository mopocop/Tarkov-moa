import type { APICache, TarkovTask, MapPoiData } from "./types";
import { remoteSnapshot, bundledSnapshot, type SnapshotField } from "./snapshot";
import {
  adaptTasks,
  adaptMapPois,
  type LocaleDoc,
  type MapsDoc,
  type TasksDoc,
  type TradersDoc,
} from "./adapt";

// tarkov.dev's GraphQL API has been returning 422 "GraphQL server unavailable"
// since 2026-07-21 (the-hideout/tarkov-api#474 — open, unanswered, and the repo
// has seen nothing but dependabot bumps since). This is the JSON API the
// tarkov.dev site itself is served from: same data, same BSG ids, actively
// updated. It answers with two documents per dataset — a language-independent
// base, and a { key: string } dictionary per language — which src/api/adapt.ts
// joins back into the domain types.
const BASE_URL = 'https://json.tarkov.dev';
const GAME_MODE = 'regular';
const FETCH_TIMEOUT_MS = 20_000;

// Bumped from v4/v1: the payload shape changed with the upstream, and loadCache
// only checks that `data` exists — without a new key it would hand a v4-shaped
// blob to a v5-shaped consumer and fail somewhere far away from here.
const TASKS_CACHE_KEY = 'td_tasks_cache_v5';
const MAP_POIS_CACHE_KEY = 'td_map_pois_cache_v2';
// Wiped on clearCache so an upgrade doesn't strand dead blobs in localStorage.
const LEGACY_CACHE_KEYS = ['td_tasks_cache_v4', 'td_maps_cache_v3', 'td_map_pois_cache_v1'];

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h — data is largely static between patches.

export type ApiLang = 'en' | 'pt' | 'ru' | 'ja' | 'zh' | 'es';
const ALL_LANGS: readonly ApiLang[] = ['en', 'pt', 'ru', 'ja', 'zh', 'es'];

// Caches are keyed per-language so switching languages doesn't thrash a single
// slot and each locale's data persists independently.
const cacheKey = (base: string, lang: ApiLang): string => `${base}_${lang}`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`tarkov.dev returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

// A 200 carrying the wrong shape must fail LOUDLY here, not quietly downstream.
// If the adapter were handed an undefined container it would either throw a bare
// TypeError from deep inside a join, or — worse — return an empty array that the
// caller would happily cache for 24h as if the game had no quests. Throwing lets
// the fallback ladder do its job and serve the cache or the snapshot instead.
function expectContainer<T>(doc: unknown, path: string[], what: string): T {
  let node: unknown = doc;
  for (const key of path) {
    if (typeof node !== 'object' || node === null) {
      throw new Error(`tarkov.dev returned an unexpected shape for ${what}`);
    }
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== 'object' || node === null) {
    throw new Error(`tarkov.dev returned an unexpected shape for ${what}`);
  }
  return node as T;
}

// The maps document is ~9.5 MB and BOTH datasets need it: tasks only for map
// names, POIs for everything. App.tsx builds a fresh client per call, so the
// memo lives at module scope — one download serves every client in this
// session. In-memory only, exactly like the SVG cache in FloorVisualOverlay: a
// reload should re-check the network. Conditional revalidation is left to the
// webview's own HTTP cache, which already sends If-None-Match for these URLs.
const mapsDocMemo = new Map<string, Promise<MapsDoc>>();
const mapsLocaleMemo = new Map<ApiLang, Promise<LocaleDoc>>();

function mapsDoc(): Promise<MapsDoc> {
  let p = mapsDocMemo.get(GAME_MODE);
  if (!p) {
    p = getJson<MapsDoc>(`${GAME_MODE}/maps`).catch((err: unknown) => {
      // Never memoise a rejection — the next attempt must hit the network.
      mapsDocMemo.delete(GAME_MODE);
      throw err;
    });
    mapsDocMemo.set(GAME_MODE, p);
  }
  return p;
}

function mapsLocale(lang: ApiLang): Promise<LocaleDoc> {
  let p = mapsLocaleMemo.get(lang);
  if (!p) {
    p = getJson<LocaleDoc>(`${GAME_MODE}/maps_${lang}`).catch((err: unknown) => {
      mapsLocaleMemo.delete(lang);
      throw err;
    });
    mapsLocaleMemo.set(lang, p);
  }
  return p;
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
   *   2. the live tarkov.dev JSON API   — the only source that can be current
   *   3. an expired local cache         — your data, just old
   *   4. the snapshot committed to this repo, over GitHub's CDN
   *   5. the snapshot compiled into the binary
   *
   * Steps 3-5 exist because tarkov.dev is the app's only upstream, and when it
   * is down there is nothing the app can do to make it come back. What it can
   * do is refuse to lose what it already had, and refuse to start from nothing.
   * The error only reaches the caller when every tier is empty.
   *
   * Fallback data is never written to the cache: a cached fallback would look
   * fresh for the next 24h and stop the app retrying the real API on launch.
   */
  private async load<T>(
    baseKey: string,
    fetchFresh: () => Promise<T>,
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
      const data = await fetchFresh();
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
    return this.load<TarkovTask[]>(
      TASKS_CACHE_KEY,
      async () => {
        const [tasks, tasksLocale, maps, mapsLoc, traders, tradersLocale] = await Promise.all([
          getJson<TasksDoc>(`${GAME_MODE}/tasks`),
          getJson<LocaleDoc>(`${GAME_MODE}/tasks_${this.lang}`),
          mapsDoc(),
          mapsLocale(this.lang),
          getJson<TradersDoc>(`${GAME_MODE}/traders`),
          getJson<LocaleDoc>(`${GAME_MODE}/traders_${this.lang}`),
        ]);
        expectContainer(tasks, ['data', 'tasks'], 'tasks');
        expectContainer(maps, ['data', 'maps'], 'maps');
        expectContainer(traders, ['data', 'traders'], 'traders');
        return adaptTasks({
          tasks,
          tasksLocale,
          maps,
          mapsLocale: mapsLoc,
          traders,
          tradersLocale,
        });
      },
      force,
      'tasks',
    );
  }

  // No snapshot tier: POIs are the largest payload by far and the app already
  // renders usefully without them, so they stay out of the committed snapshot.
  async getMapPois(force = false): Promise<MapPoiData[]> {
    return this.load<MapPoiData[]>(
      MAP_POIS_CACHE_KEY,
      async () => {
        const [maps, mapsLoc] = await Promise.all([mapsDoc(), mapsLocale(this.lang)]);
        expectContainer(maps, ['data', 'maps'], 'maps');
        return adaptMapPois({ maps, mapsLocale: mapsLoc });
      },
      force,
    );
  }

  clearCache(): void {
    // Clear every per-language slot, current and legacy. This is the explicit
    // user-driven wipe (Settings -> clear cache); expiry alone never deletes.
    for (const lang of ALL_LANGS) {
      localStorage.removeItem(cacheKey(TASKS_CACHE_KEY, lang));
      localStorage.removeItem(cacheKey(MAP_POIS_CACHE_KEY, lang));
      for (const legacy of LEGACY_CACHE_KEYS) {
        localStorage.removeItem(cacheKey(legacy, lang));
      }
    }
    mapsDocMemo.clear();
    mapsLocaleMemo.clear();
    this.servedStale.clear();
  }
}
