import type { APICache, TarkovMap, TarkovTask, MapPoiData } from "./types";

const ENDPOINT = 'https://api.tarkov.dev/graphql';
const TASKS_CACHE_KEY = 'td_tasks_cache_v4';
const MAPS_CACHE_KEY = 'td_maps_cache_v3';
const MAP_POIS_CACHE_KEY = "td_map_pois_cache_v1";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h — tarkov.dev data is largely static between patches.

const TASKS_QUERY = `
  query GetTasks {
    tasks {
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

const MAPS_QUERY = `
  query GetMaps {
    maps {
      id
      name
      normalizedName
    }
  }
`;

const MAP_POIS_QUERY = `
  query GetMapPois {
    maps {
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

  async getMapPois(force = false): Promise<MapPoiData[]> {
    if (!force) {
      const cached = loadCache<MapPoiData[]>(MAP_POIS_CACHE_KEY);
      if (cached) return cached.data;
    }
    const data = await gqlFetch<{ maps: MapPoiData[] }>(MAP_POIS_QUERY);
    saveCache(MAP_POIS_CACHE_KEY, data.maps);
    return data.maps;
  }

  clearCache(): void {
    localStorage.removeItem(TASKS_CACHE_KEY);
    localStorage.removeItem(MAPS_CACHE_KEY);
    localStorage.removeItem(MAP_POIS_CACHE_KEY);
  }
}
