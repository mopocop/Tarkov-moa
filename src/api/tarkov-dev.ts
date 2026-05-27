import type { APICache, TarkovMap, TarkovTask } from './types';

const ENDPOINT = 'https://api.tarkov.dev/graphql';
const TASKS_CACHE_KEY = 'td_tasks_cache_v3';
const MAPS_CACHE_KEY = 'td_maps_cache_v3';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h — tarkov.dev data is largely static between patches.

const TASKS_QUERY = `
  query GetTasks {
    tasks {
      id
      name
      description
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
        ... on TaskObjectiveBasic {
          zones {
            id
            map { id name }
            position { x y z }
          }
        }
      }
    }
  }
`;

const MAPS_QUERY = `
  query GetMaps {
    maps {
      id
      name
      normalizedName
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
  if (body.errors?.length) {
    throw new Error(`tarkov.dev GraphQL error: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  if (!body.data) throw new Error('tarkov.dev returned no data');
  return body.data;
}

function loadCache<T>(key: string): APICache<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as APICache<T>;
    if (Date.now() - parsed.timestamp >= CACHE_DURATION) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
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

export class TarkovDevClient {
  async getTasks(force = false): Promise<TarkovTask[]> {
    if (!force) {
      const cached = loadCache<TarkovTask[]>(TASKS_CACHE_KEY);
      if (cached) return cached.data;
    }
    const data = await gqlFetch<{ tasks: TarkovTask[] }>(TASKS_QUERY);
    saveCache(TASKS_CACHE_KEY, data.tasks);
    return data.tasks;
  }

  async getMaps(force = false): Promise<TarkovMap[]> {
    if (!force) {
      const cached = loadCache<TarkovMap[]>(MAPS_CACHE_KEY);
      if (cached) return cached.data;
    }
    const data = await gqlFetch<{ maps: TarkovMap[] }>(MAPS_QUERY);
    saveCache(MAPS_CACHE_KEY, data.maps);
    return data.maps;
  }

  clearCache(): void {
    localStorage.removeItem(TASKS_CACHE_KEY);
    localStorage.removeItem(MAPS_CACHE_KEY);
  }
}
