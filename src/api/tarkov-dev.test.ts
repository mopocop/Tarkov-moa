import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TarkovDevClient } from './tarkov-dev';
import type { TarkovTask } from './types';

const TASKS_KEY = 'td_tasks_cache_v4_en';
const DAY = 24 * 60 * 60 * 1000;

const task = (id: string): TarkovTask => ({ id, name: id }) as TarkovTask;

/** Seed the tasks cache with a given age. */
function seed(ids: string[], ageMs: number): void {
  localStorage.setItem(
    TASKS_KEY,
    JSON.stringify({ data: ids.map(task), timestamp: Date.now() - ageMs }),
  );
}

function okFetch(tasks: TarkovTask[]): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { tasks } }),
  }));
}

/** tarkov.dev's actual outage response: HTTP 422 with an errors array. */
function outageFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: false,
    status: 422,
    json: async () => ({ errors: [{ message: 'GraphQL server unavailable. Try again later.' }] }),
  }));
}

describe('TarkovDevClient cache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('serves a fresh cache without touching the network', async () => {
    seed(['cached'], 1000);
    const fetchMock = okFetch([task('network')]);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('cached')]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.staleInfo).toEqual({ stale: false, servedAt: null });
  });

  it('fetches and caches when there is nothing stored', async () => {
    vi.stubGlobal('fetch', okFetch([task('fetched')]));

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('fetched')]);
    expect(JSON.parse(localStorage.getItem(TASKS_KEY)!).data).toEqual([task('fetched')]);
    expect(client.staleInfo.stale).toBe(false);
  });

  // The regression this file exists for. Before the fix, an expired entry was
  // deleted on read, so an upstream outage turned into an empty screen with no
  // way back until the API recovered.
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

  it('never deletes an expired entry just because it expired', async () => {
    seed(['old'], 3 * DAY);
    vi.stubGlobal('fetch', outageFetch());

    await new TarkovDevClient('en').getTasks();
    expect(localStorage.getItem(TASKS_KEY)).not.toBeNull();

    // Still recoverable on the next launch, without a successful fetch.
    await expect(new TarkovDevClient('en').getTasks()).resolves.toEqual([task('old')]);
  });

  it('replaces an expired cache once the fetch succeeds again', async () => {
    seed(['old'], 3 * DAY);
    vi.stubGlobal('fetch', okFetch([task('new')]));

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('new')]);
    expect(JSON.parse(localStorage.getItem(TASKS_KEY)!).data).toEqual([task('new')]);
    expect(client.staleInfo.stale).toBe(false);
  });

  it('throws when the fetch fails and there is no cache at all', async () => {
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

  it('clearCache wipes the entry and resets the stale flag', async () => {
    seed(['old'], 3 * DAY);
    vi.stubGlobal('fetch', outageFetch());

    const client = new TarkovDevClient('en');
    await client.getTasks();
    expect(client.staleInfo.stale).toBe(true);

    client.clearCache();
    expect(localStorage.getItem(TASKS_KEY)).toBeNull();
    expect(client.staleInfo).toEqual({ stale: false, servedAt: null });
  });
});

describe('TarkovDevClient snapshot fallbacks', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Fails the GraphQL call; answers the snapshot URL with `snapshot` (or 404). */
  function routedFetch(snapshot: unknown | null): ReturnType<typeof vi.fn> {
    return vi.fn(async (url: string) => {
      if (String(url).includes('raw.githubusercontent.com')) {
        if (snapshot === null) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => snapshot };
      }
      return {
        ok: false,
        status: 422,
        json: async () => ({ errors: [{ message: 'GraphQL server unavailable.' }] }),
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

  it('falls back to the repo snapshot when there is no cache and the API is down', async () => {
    vi.stubGlobal('fetch', routedFetch(repoSnapshot));

    const client = new TarkovDevClient('en');
    await expect(client.getTasks()).resolves.toEqual([task('from-snapshot')]);

    const info = client.staleInfo;
    expect(info.stale).toBe(true);
    expect(info.servedAt).toBe(Date.parse(GENERATED_AT));
  });

  it('does NOT cache snapshot data, so the next launch retries the real API', async () => {
    vi.stubGlobal('fetch', routedFetch(repoSnapshot));

    await new TarkovDevClient('en').getTasks();
    expect(localStorage.getItem(TASKS_KEY)).toBeNull();
  });

  it('prefers an expired cache over the snapshot — your data beats a generic copy', async () => {
    seed(['mine'], 3 * DAY);
    const fetchMock = routedFetch(repoSnapshot);
    vi.stubGlobal('fetch', fetchMock);

    await expect(new TarkovDevClient('en').getTasks()).resolves.toEqual([task('mine')]);
    const snapshotCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('raw.githubusercontent.com'),
    );
    expect(snapshotCalls).toHaveLength(0);
  });

  it('treats an empty snapshot as no snapshot rather than as an empty game', async () => {
    vi.stubGlobal('fetch', routedFetch({ generatedAt: null, lang: 'en', tasks: [], maps: [] }));
    await expect(new TarkovDevClient('en').getTasks()).rejects.toThrow(/422/);
  });

  it('throws when every tier is empty', async () => {
    vi.stubGlobal('fetch', routedFetch(null));
    await expect(new TarkovDevClient('en').getTasks()).rejects.toThrow(/422/);
  });

  it('requests the snapshot for the active language', async () => {
    const fetchMock = routedFetch({ ...repoSnapshot, lang: 'pt' });
    vi.stubGlobal('fetch', fetchMock);

    await new TarkovDevClient('pt').getTasks();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/pt.json'))).toBe(true);
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
