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
