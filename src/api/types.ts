// TarkovTracker API v2 — https://tarkovtracker.io/api/v2
// GET /progress returns the full payload below.
export interface TaskObjectiveProgress {
  id: string;
  complete: boolean;
  count?: number;
  invalid?: boolean;
}

export interface TaskProgress {
  id: string;
  complete: boolean;
  failed: boolean;
  invalid: boolean;
  objectives?: TaskObjectiveProgress[];
}

export interface TarkovTrackerProgress {
  playerLevel: number;
  gameEdition?: number;
  pmcFaction?: 'USEC' | 'BEAR' | string;
  displayName?: string;
  taskProgress: TaskProgress[];
}

// tarkov.dev GraphQL types
export interface TaskRequirement {
  task: {
    id: string;
    name: string;
  };
  status?: string[];
}

export interface MapRef {
  id: string;
  name: string;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface ObjectiveZone {
  id: string;
  map?: MapRef;
  position?: Position;
}

export interface PossibleLocation {
  map: MapRef;
  positions?: Position[];
}

export interface TaskObjective {
  id: string;
  type: string;
  description?: string;
  maps?: MapRef[];
  zones?: ObjectiveZone[];
  possibleLocations?: PossibleLocation[];
}

export interface TarkovTask {
  id: string;
  name: string;
  description?: string;
  map?: MapRef;
  trader?: { name: string };
  wikiLink?: string;
  minPlayerLevel?: number;
  taskRequirements?: TaskRequirement[];
  objectives?: TaskObjective[];
}

export interface TarkovMap {
  id: string;
  name: string;
  normalizedName: string;
}

export interface APICache<T> {
  data: T;
  timestamp: number;
}
