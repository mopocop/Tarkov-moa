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
  // True when the player has picked up the quest at a trader (EFT type-10
  // "description" push notification). Drives the "active quest" derivation.
  accepted?: boolean;
  objectives?: TaskObjectiveProgress[];
}

export interface TarkovTrackerProgress {
  playerLevel: number;
  gameEdition?: number;
  pmcFaction?: 'USEC' | 'BEAR' | string;
  displayName?: string;
  tasksProgress: TaskProgress[];
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

export interface MapPosition {
  x: number;
  y: number;
  z: number;
}

export interface MapSwitchRef {
  id: string;
  name?: string;
}

export interface ContainedItemRef {
  item?: { id: string; name: string };
  count?: number;
}

export interface MapExtractRaw {
  id: string;
  name: string;
  faction?: string; // "pmc" | "scav" | "shared"
  switches?: MapSwitchRef[];
  transferItem?: ContainedItemRef | null;
  position?: MapPosition;
}

export interface MapTransitRaw {
  id: string;
  description?: string;
  conditions?: string;
  map?: MapRef; // destination map
  position?: MapPosition;
}

export interface MapSpawnRaw {
  zoneName?: string;
  position?: MapPosition;
  sides?: string[];
  categories?: string[];
}

export interface BossSpawnLocationRaw {
  name?: string;
  chance?: number;
}

export interface BossSpawnRaw {
  boss?: { name: string; normalizedName?: string };
  spawnChance?: number;
  spawnLocations?: BossSpawnLocationRaw[];
}

export interface MapHazardRaw {
  hazardType?: string;
  name?: string;
  position?: MapPosition;
}

export interface LootContainerPositionRaw {
  lootContainer?: { id: string; name: string; normalizedName?: string };
  position?: MapPosition;
}

export interface MapPoiData {
  id: string;
  extracts?: MapExtractRaw[];
  transits?: MapTransitRaw[];
  spawns?: MapSpawnRaw[];
  bosses?: BossSpawnRaw[];
  hazards?: MapHazardRaw[];
  lootContainers?: LootContainerPositionRaw[];
}

export interface APICache<T> {
  data: T;
  timestamp: number;
}
