import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TarkovDevClient } from './tarkov-dev';
import { bundledSnapshot } from './snapshot';
import type { TarkovTask } from './types';

const TASKS_KEY = 'td_tasks_cache_v5_en';
const POIS_KEY = 'td_map_pois_cache_v2_en';
const DAY = 24 * 60 * 60 * 1000;
const SNAPSHOT_HOST = 'raw.githubusercontent.com';
const GENERATED_AT = '2026-08-26T00:00:00.000Z';

const task = (id: string): TarkovTask => ({ id, name: id }) as TarkovTask;

/** Seed the tasks cache with a given age. */
function seed(ids: string[], ageMs: number): void {
  localStorage.setItem(
    TASKS_KEY,
    JSON.stringify({ data: ids.map(task), timestamp: Date.now() - ageMs }),
  );
}

// Quests are read from the committed snapshot, which is a language-independent
// base plus a per-language dictionary. The base carries placeholder names that
// the dictionary resolves, so a task seeded here as `fetched` comes back through
// the adapter as { id: 'fetched', name: 'fetched' }.
function snapshotDocs(ids: string[]): Record<string, unknown> {
  return {
    '/base.json': {
      generatedAt: GENERATED_AT,
      tasks: Object.fromEntries(ids.map((id) => [id, { id, name: `${id} name` }])),
      maps: {},
      traders: {},
    },
    '/locale-en.json': {
      tasks: Object.fromEntries(ids.map((id) => [`${id} name`, id])),
      maps: {},
      traders: {},
    },
  };
}

/** Serves the snapshot for tasks and the live API for POIs. */
function okFetch(ids: string[]): ReturnType<typeof vi.fn> {
  const docs = snapshotDocs(ids);
  const api: Record<string, unknown> = {
    '/regular/maps': { data: { maps: {} } },
    '/regular/maps_en': { data: {} },
  };
  return vi.fn(async (url: string) => {
    const u = String(url);
    const key = [...Object.keys(docs), ...Object.keys(api)].find((k) => u.endsWith(k));
    if (!key) return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
    const body = docs[key] ?? api[key];
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
  });
}

/** Everything unreachable — the shape a real outage takes. */
function outageFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: false,
    status: 503,
    text: async () => 'Service Unavailable',
    json: async () => ({}),
  }));
}

/**
 * The bundled tier reads real generated files, so left alone it would answer
 * with the live snapshot and quietly rescue tests meant to reach the bottom of
 * the ladder. Stubbed off by default; the tests that care opt back in.
 */
vi.mock('./snapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./snapshot')>();
  return { ...actual, bundledSnapshot: vi.fn(async () => null) };
});

/**
 * The maps document is memoised at module scope so one 9.5 MB download serves
 * every client in a session. That memo outlives a single test, so every test
 * clears it first — otherwise an earlier test's stub would still be answering.
 */
function resetModuleState(): void {
  new TarkovDevClient('en').clearCache();
}

function setup(): void {
  resetModuleState();
  localStorage.clear();
  // A vi.mock factory's fn is module-scoped, so restoreAllMocks does not reset
  // it between tests. Without this, call counts leak across cases.
  vi.mocked(bundledSnapshot).mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}

function teardown(): void {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

describe('TarkovDevClient cache', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('serves a fresh cache without touching the network', async () => {
    seed(['cached'], 1000);
    const fetchMock = okFetch(['network']);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('cached')]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.staleInfo).toEqual({ stale: false, servedAt: null });
  });

  it('fetches and caches when there is nothing stored', async () => {
    vi.stubGlobal('fetch', okFetch(['fetched']));

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('fetched')]);
    expect(JSON.parse(localStorage.getItem(TASKS_KEY)!).data).toEqual([task('fetched')]);
    expect(client.staleInfo.stale).toBe(false);
  });

  // The regression the cache tier exists for. Before the fix, an expired entry
  // was deleted on read, so an outage turned into an empty screen with no way
  // back until the source recovered.
  it('serves an EXPIRED cache when the fetch fails, and reports it as stale', async () => {
    const storedAt = Date.now() - 3 * DAY;
    seed(['old'], 3 * DAY);
    vi.stubGlobal('fetch', outageFetch());

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('old')]);

    const info = client.staleInfo;
    expect(info.stale).toBe(true);
    expect(info.servedAt).toBeCloseTo(storedAt, -3); // within ~1s
  });

  it('never deletes an expired entry, even after serving it', async () => {
    seed(['old'], 3 * DAY);
    vi.stubGlobal('fetch', outageFetch());

    await new TarkovDevClient('en').getTasks();
    expect(localStorage.getItem(TASKS_KEY)).not.toBeNull();
  });

  it('replaces an expired entry once the fetch succeeds again', async () => {
    seed(['old'], 3 * DAY);
    vi.stubGlobal('fetch', okFetch(['fresh']));

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('fresh')]);
    expect(JSON.parse(localStorage.getItem(TASKS_KEY)!).data).toEqual([task('fresh')]);
    expect(client.staleInfo.stale).toBe(false);
  });

  it('throws when every tier is empty', async () => {
    vi.stubGlobal('fetch', outageFetch());
    await expect(new TarkovDevClient('en').getTasks()).rejects.toThrow(/snapshot is unavailable/);
  });

  it('force bypasses a fresh cache but still falls back to it on failure', async () => {
    seed(['cached'], 1000);
    vi.stubGlobal('fetch', outageFetch());

    const client = new TarkovDevClient('en');
    await expect(client.getTasks(true)).resolves.toEqual([task('cached')]);
    expect(client.staleInfo.stale).toBe(true);
  });

  it('clearCache wipes every language slot and resets stale state', async () => {
    seed(['old'], 3 * DAY);
    vi.stubGlobal('fetch', outageFetch());

    const client = new TarkovDevClient('en');
    await client.getTasks();
    expect(client.staleInfo.stale).toBe(true);

    client.clearCache();
    expect(localStorage.getItem(TASKS_KEY)).toBeNull();
    expect(client.staleInfo).toEqual({ stale: false, servedAt: null });
  });

  it('wipes the pre-migration cache keys too, so an upgrade strands nothing', () => {
    localStorage.setItem('td_tasks_cache_v4_en', 'legacy');
    localStorage.setItem('td_maps_cache_v3_pt', 'legacy');
    localStorage.setItem('td_map_pois_cache_v1_ru', 'legacy');

    new TarkovDevClient('en').clearCache();

    expect(localStorage.getItem('td_tasks_cache_v4_en')).toBeNull();
    expect(localStorage.getItem('td_maps_cache_v3_pt')).toBeNull();
    expect(localStorage.getItem('td_map_pois_cache_v1_ru')).toBeNull();
  });
});

describe('TarkovDevClient task source', () => {
  beforeEach(setup);
  afterEach(teardown);

  // /regular/tasks answers curl and PowerShell with 200 but answers this app's
  // webview with a CORS-less response and its Rust client with 404. Quests are
  // therefore built by CI and read from the repo, never fetched here.
  it('reads quests from the committed snapshot, never from the live tasks endpoint', async () => {
    const fetchMock = okFetch(['x']);
    vi.stubGlobal('fetch', fetchMock);

    await new TarkovDevClient('en').getTasks();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));

    expect(urls.some((u) => u.includes(SNAPSHOT_HOST))).toBe(true);
    expect(urls.every((u) => !u.includes('/regular/tasks'))).toBe(true);
    expect(urls.every((u) => !u.includes('/graphql'))).toBe(true);
  });

  it('requests the base once and the locale for the active language', async () => {
    const fetchMock = okFetch(['x']);
    vi.stubGlobal('fetch', fetchMock);

    await new TarkovDevClient('pt').getTasks().catch(() => undefined);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));

    expect(urls.some((u) => u.endsWith('/base.json'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/locale-pt.json'))).toBe(true);
  });

  it('falls back to the bundled snapshot when the repo copy is unreachable', async () => {
    vi.stubGlobal('fetch', outageFetch());
    vi.mocked(bundledSnapshot).mockResolvedValueOnce({
      data: [task('from-bundle')] as never,
      generatedAt: Date.parse(GENERATED_AT),
    });

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('from-bundle')]);
    expect(client.staleInfo.stale).toBe(true);
    // Never cached: a cached fallback would look fresh for 24h and stop the app
    // retrying the real source on the next launch.
    expect(localStorage.getItem(TASKS_KEY)).toBeNull();
  });

  it('asks the bundled snapshot for the active language', async () => {
    vi.stubGlobal('fetch', outageFetch());
    await expect(new TarkovDevClient('pt').getTasks()).rejects.toThrow();
    expect(vi.mocked(bundledSnapshot)).toHaveBeenCalledWith('pt', 'tasks');
  });

  it('prefers an expired cache over the bundled snapshot', async () => {
    seed(['old'], 3 * DAY);
    vi.stubGlobal('fetch', outageFetch());
    vi.mocked(bundledSnapshot).mockResolvedValueOnce({
      data: [task('from-bundle')] as never,
      generatedAt: Date.parse(GENERATED_AT),
    });

    await expect(new TarkovDevClient('en').getTasks()).resolves.toEqual([task('old')]);
  });
});

describe('TarkovDevClient POI source', () => {
  beforeEach(setup);
  afterEach(teardown);

  // POIs still come from the live API — /regular/maps answers every client.
  it('fetches POIs from the live maps endpoint', async () => {
    const fetchMock = okFetch(['x']);
    vi.stubGlobal('fetch', fetchMock);

    await new TarkovDevClient('en').getMapPois();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));

    expect(urls).toContain('https://json.tarkov.dev/regular/maps');
    expect(urls).toContain('https://json.tarkov.dev/regular/maps_en');
  });

  it('does not reach for a snapshot for POIs — they are not snapshotted', async () => {
    const fetchMock = outageFetch();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new TarkovDevClient('en').getMapPois()).rejects.toThrow(/503/);
    const snapshotCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes(SNAPSHOT_HOST),
    );
    expect(snapshotCalls).toHaveLength(0);
    expect(vi.mocked(bundledSnapshot)).not.toHaveBeenCalled();
  });

  // The maps document is the big one. Downloading it twice per session would be
  // ~19 MB for 9.5 MB of data.
  it('downloads the maps document once and shares it across clients', async () => {
    const fetchMock = okFetch(['x']);
    vi.stubGlobal('fetch', fetchMock);

    await new TarkovDevClient('en').getMapPois();
    localStorage.removeItem(POIS_KEY); // force a second resolution, not a cache read
    await new TarkovDevClient('en').getMapPois();

    const mapsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/regular/maps'));
    expect(mapsCalls).toHaveLength(1);
  });

  it('does not memoise a failed maps fetch — the next attempt retries the network', async () => {
    vi.stubGlobal('fetch', outageFetch());
    await expect(new TarkovDevClient('en').getMapPois()).rejects.toThrow();

    const fetchMock = okFetch(['x']);
    vi.stubGlobal('fetch', fetchMock);
    await expect(new TarkovDevClient('en').getMapPois()).resolves.toBeDefined();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/regular/maps'))).toBe(true);
  });
});
