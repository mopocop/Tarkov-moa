import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TarkovDevClient } from './tarkov-dev';
import type { TarkovTask } from './types';

const TASKS_KEY = 'td_tasks_cache_v5_en';
const DAY = 24 * 60 * 60 * 1000;

const task = (id: string): TarkovTask => ({ id, name: id }) as TarkovTask;

/** Seed the tasks cache with a given age. */
function seed(ids: string[], ageMs: number): void {
  localStorage.setItem(
    TASKS_KEY,
    JSON.stringify({ data: ids.map(task), timestamp: Date.now() - ageMs }),
  );
}

// The JSON upstream answers six documents for a task load: a base and a locale
// dictionary for each of tasks, maps and traders. The locale maps the base's
// placeholder ("<id> name") onto the human string, so a task seeded here as
// `fetched` comes back through the adapter as { id: 'fetched', name: 'fetched' }.
function docsFor(ids: string[]): Record<string, unknown> {
  const tasks = Object.fromEntries(ids.map((id) => [id, { id, name: `${id} name` }]));
  const locale = Object.fromEntries(ids.map((id) => [`${id} name`, id]));
  return {
    '/regular/tasks': { data: { tasks } },
    '/regular/tasks_en': { data: locale },
    '/regular/maps': { data: { maps: {} } },
    '/regular/maps_en': { data: {} },
    '/regular/traders': { data: { traders: {} } },
    '/regular/traders_en': { data: {} },
  };
}

/** Answers every upstream URL with a well-formed document. */
function okFetch(ids: string[]): ReturnType<typeof vi.fn> {
  const docs = docsFor(ids);
  return vi.fn(async (url: string) => {
    const key = Object.keys(docs).find((k) => String(url).endsWith(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => docs[key] };
  });
}

/** tarkov.dev's actual outage response: HTTP 422 with an errors array. */
function outageFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: false,
    status: 422,
    json: async () => ({ errors: ['GraphQL server unavailable. Try again later.'] }),
  }));
}

/**
 * The maps document is memoised at module scope so one 9.5 MB download serves
 * every client in a session. That memo outlives a single test, so every test
 * starts by clearing it — otherwise a stubbed fetch from an earlier test would
 * still be answering here.
 */
function resetModuleState(): void {
  new TarkovDevClient('en').clearCache();
}

describe('TarkovDevClient cache', () => {
  beforeEach(() => {
    resetModuleState();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
  // was deleted on read, so an upstream outage turned into an empty screen with
  // no way back until the API recovered.
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

  it('throws when the fetch fails and nothing is stored anywhere', async () => {
    vi.stubGlobal('fetch', outageFetch());
    await expect(new TarkovDevClient('en').getTasks()).rejects.toThrow(/422/);
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

  // A 200 with the wrong body must not become an empty task list that gets
  // cached for 24h as if the game had no quests.
  it('rejects a 200 that carries an unexpected shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nope: true }) })),
    );

    await expect(new TarkovDevClient('en').getTasks()).rejects.toThrow(/unexpected shape/);
    expect(localStorage.getItem(TASKS_KEY)).toBeNull();
  });
});

describe('TarkovDevClient snapshot fallbacks', () => {
  beforeEach(() => {
    resetModuleState();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Fails the upstream call; answers the snapshot URL with `snapshot` (or 404). */
  function routedFetch(snapshot: unknown | null): ReturnType<typeof vi.fn> {
    return vi.fn(async (url: string) => {
      if (String(url).includes('raw.githubusercontent.com')) {
        if (snapshot === null) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => snapshot };
      }
      return {
        ok: false,
        status: 422,
        json: async () => ({ errors: ['GraphQL server unavailable.'] }),
      };
    });
  }

  const GENERATED_AT = '2026-08-01T00:00:00.000Z';
  const repoSnapshot = {
    generatedAt: GENERATED_AT,
    lang: 'en',
    tasks: [task('from-snapshot')],
    maps: [],
  };

  it('falls back to the repo snapshot when there is no cache at all', async () => {
    vi.stubGlobal('fetch', routedFetch(repoSnapshot));

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('from-snapshot')]);
    expect(client.staleInfo.stale).toBe(true);
    expect(client.staleInfo.servedAt).toBe(Date.parse(GENERATED_AT));
  });

  it('never caches snapshot data — the next launch must retry the real API', async () => {
    vi.stubGlobal('fetch', routedFetch(repoSnapshot));

    await new TarkovDevClient('en').getTasks();
    expect(localStorage.getItem(TASKS_KEY)).toBeNull();
  });

  it('prefers an expired cache over the snapshot, and does not even request it', async () => {
    seed(['old'], 3 * DAY);
    const fetchMock = routedFetch(repoSnapshot);
    vi.stubGlobal('fetch', fetchMock);

    await expect(new TarkovDevClient('en').getTasks()).resolves.toEqual([task('old')]);
    const snapshotCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('raw.githubusercontent.com'),
    );
    expect(snapshotCalls).toHaveLength(0);
  });

  it('treats an empty snapshot as absent, not as a game with no quests', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({ generatedAt: null, lang: 'en', tasks: [], maps: [] }),
    );
    await expect(new TarkovDevClient('en').getTasks()).rejects.toThrow(/422/);
  });

  it('throws when every tier is empty', async () => {
    vi.stubGlobal('fetch', routedFetch(null));
    await expect(new TarkovDevClient('en').getTasks()).rejects.toThrow(/422/);
  });

  it('requests the snapshot for the active language', async () => {
    const fetchMock = routedFetch(null);
    vi.stubGlobal('fetch', fetchMock);

    await expect(new TarkovDevClient('pt').getTasks()).rejects.toThrow();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/pt.json'))).toBe(true);
  });

  it('does not reach for a snapshot for POIs — they are not snapshotted', async () => {
    const fetchMock = routedFetch(repoSnapshot);
    vi.stubGlobal('fetch', fetchMock);

    await expect(new TarkovDevClient('en').getMapPois()).rejects.toThrow(/422/);
    const snapshotCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('raw.githubusercontent.com'),
    );
    expect(snapshotCalls).toHaveLength(0);
  });
});

describe('TarkovDevClient upstream requests', () => {
  beforeEach(() => {
    resetModuleState();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks the JSON API for the active language, not the GraphQL endpoint', async () => {
    const fetchMock = okFetch(['x']);
    vi.stubGlobal('fetch', fetchMock);

    await new TarkovDevClient('en').getTasks();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));

    expect(urls.every((u) => !u.includes('/graphql'))).toBe(true);
    expect(urls).toContain('https://json.tarkov.dev/regular/tasks');
    expect(urls).toContain('https://json.tarkov.dev/regular/tasks_en');
  });

  // The maps document is the big one. Downloading it twice per session because
  // tasks and POIs each want it would be ~19 MB for 9.5 MB of data.
  it('downloads the maps document once and shares it across clients', async () => {
    const fetchMock = okFetch(['x']);
    vi.stubGlobal('fetch', fetchMock);

    await new TarkovDevClient('en').getTasks();
    await new TarkovDevClient('en').getMapPois();

    const mapsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/regular/maps'));
    expect(mapsCalls).toHaveLength(1);
  });

  it('does not memoise a failed maps fetch — the next attempt retries the network', async () => {
    vi.stubGlobal('fetch', outageFetch());
    await expect(new TarkovDevClient('en').getTasks()).rejects.toThrow();

    const fetchMock = okFetch(['recovered']);
    vi.stubGlobal('fetch', fetchMock);
    await expect(new TarkovDevClient('en').getTasks()).resolves.toEqual([task('recovered')]);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/regular/maps'))).toBe(true);
  });
});
