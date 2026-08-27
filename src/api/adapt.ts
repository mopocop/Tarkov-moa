import type {
  BossSpawnRaw,
  BossSpawnLocationRaw,
  ContainedItemRef,
  LootContainerPositionRaw,
  MapExtractRaw,
  MapHazardRaw,
  MapPoiData,
  MapSpawnRaw,
  MapSwitchRef,
  MapTransitRaw,
  ObjectiveZone,
  PossibleLocation,
  TaskObjective,
  TarkovTask,
} from './types';

// ---------------------------------------------------------------------------
// Raw source shapes (not exported — internal to this module)
// ---------------------------------------------------------------------------

interface RawTask {
  id: string;
  name: string;
  trader?: string;
  wikiLink?: string;
  minPlayerLevel?: number;
  taskRequirements?: unknown[];
  map?: string | null;
  objectives?: RawObjective[];
}

interface RawObjective {
  id: string;
  type: string;
  description?: string;
  maps?: string[];
  zones?: RawZone[];
  possibleLocations?: RawPossibleLocation[];
}

interface RawZone {
  id: string;
  map: string;
  position: { x: number; y: number; z: number };
}

interface RawPossibleLocation {
  map: string;
  positions: { x: number; y: number; z: number }[];
}

interface RawMap {
  id: string;
  name: string;
  normalizedName: string;
  extracts?: RawExtract[];
  transits?: RawTransit[];
  spawns?: RawSpawn[];
  bosses?: RawBoss[];
  hazards?: RawHazard[];
  lootContainers?: RawLootContainerPosition[];
  switches?: RawSwitch[];
}

interface RawExtract {
  id: string;
  name: string;
  faction?: string;
  switches?: string[];
  transferItem?: { item: string; count: number } | null;
  position?: { x: number; y: number; z: number };
}

interface RawTransit {
  id: string;
  description?: string;
  conditions?: string;
  map: string;
  position?: { x: number; y: number; z: number };
}

interface RawSpawn {
  zoneName?: string;
  position?: { x: number; y: number; z: number };
  sides?: string[];
  categories?: string[];
}

interface RawBoss {
  spawnChance: number;
  spawnLocations?: { name?: string; chance: number }[];
  mob: string;
}

interface RawHazard {
  hazardType?: string;
  name?: string;
  position?: { x: number; y: number; z: number };
}

interface RawLootContainerPosition {
  lootContainer: string;
  position?: { x: number; y: number; z: number };
}

interface RawSwitch {
  id: string;
  name: string;
}

interface RawMob {
  id: string;
  name: string;
  normalizedName: string;
}

interface RawLootContainer {
  id: string;
  name: string;
  normalizedName: string;
}

interface RawTrader {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Public doc shapes
// ---------------------------------------------------------------------------

export interface LocaleDoc {
  data: Record<string, string>;
}

export interface TasksDoc {
  data: { tasks: Record<string, RawTask> };
}

export interface MapsDoc {
  data: {
    maps: Record<string, RawMap>;
    mobs?: Record<string, RawMob>;
    lootContainers?: Record<string, RawLootContainer>;
  };
}

// Unlike tasks and maps, the traders document has NO inner container: the
// traders sit directly under `data`, keyed by id.
export interface TradersDoc { data: Record<string, RawTrader>; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tr = (locale: LocaleDoc, value: string | undefined): string | undefined =>
  value == null ? undefined : (locale.data[value] ?? value);

// A miss falls back to an EMPTY name, never to the raw id. The id is a 24-hex
// MongoId, and resolveMapName() in quests/mapNames.ts returns the first truthy
// name it finds — so an id-shaped fallback would put "5704e5fad2720bc05b8b4567"
// on screen where the user expects "Reserve". Empty keeps the id for joining and
// lets that resolver fall through to its own "Unknown map".
function resolveMapRef(
  id: string,
  maps: Record<string, RawMap>,
  mapsLocale: LocaleDoc,
): { id: string; name: string } {
  const m = maps[id];
  return { id, name: m ? (tr(mapsLocale, m.name) ?? '') : '' };
}

// ---------------------------------------------------------------------------
// adaptTasks
// ---------------------------------------------------------------------------

export function adaptTasks(input: {
  tasks: TasksDoc;
  tasksLocale: LocaleDoc;
  maps: MapsDoc;
  mapsLocale: LocaleDoc;
  traders: TradersDoc;
  tradersLocale: LocaleDoc;
}): TarkovTask[] {
  const { tasks, tasksLocale, maps, mapsLocale, traders, tradersLocale } = input;
  const tasksData = tasks.data.tasks;
  const mapsData = maps.data.maps;
  const tradersData = traders.data;

  return Object.values(tasksData).map((raw) => {
    const task: TarkovTask = {
      id: raw.id,
      name: tr(tasksLocale, raw.name) ?? raw.id,
    };

    if (raw.map) {
      task.map = resolveMapRef(raw.map, mapsData, mapsLocale);
    }

    // Same rule as the map ref: an unresolvable trader is omitted entirely rather
    // than rendered as its id. QuestSidebar guards on `task.trader`, so dropping
    // it hides the dash-and-name span instead of printing a MongoId next to the
    // quest title.
    if (raw.trader) {
      const t = tradersData[raw.trader];
      const traderName = t ? tr(tradersLocale, t.name) : undefined;
      if (traderName) task.trader = { name: traderName };
    }

    if (raw.wikiLink != null) task.wikiLink = raw.wikiLink;
    if (raw.minPlayerLevel != null) task.minPlayerLevel = raw.minPlayerLevel;
    if (raw.taskRequirements?.length) {
      task.taskRequirements = raw.taskRequirements as TarkovTask['taskRequirements'];
    }

    if (raw.objectives?.length) {
      task.objectives = raw.objectives.map((o): TaskObjective => {
        const obj: TaskObjective = {
          id: o.id,
          type: o.type,
        };
        if (o.description != null) {
          obj.description = tr(tasksLocale, o.description);
        }
        if (o.maps?.length) {
          obj.maps = o.maps.map((mid) => resolveMapRef(mid, mapsData, mapsLocale));
        }
        if (o.zones?.length) {
          obj.zones = o.zones
            .filter((z) => z.map != null)
            .map(
              (z): ObjectiveZone => ({
                id: z.id,
                map: resolveMapRef(z.map, mapsData, mapsLocale),
                position: z.position,
              }),
            );
        }
        if (o.possibleLocations?.length) {
          obj.possibleLocations = o.possibleLocations.map(
            (pl): PossibleLocation => ({
              map: resolveMapRef(pl.map, mapsData, mapsLocale),
              positions: pl.positions,
            }),
          );
        }
        return obj;
      });
    }

    return task;
  });
}

// ---------------------------------------------------------------------------
// adaptMapPois
// ---------------------------------------------------------------------------

export function adaptMapPois(input: {
  maps: MapsDoc;
  mapsLocale: LocaleDoc;
  itemNames?: Record<string, string>;
}): MapPoiData[] {
  const { maps, mapsLocale, itemNames = {} } = input;
  const mapsData = maps.data.maps;
  const mobsData = maps.data.mobs ?? {};
  const lootContainersData = maps.data.lootContainers ?? {};

  return Object.entries(mapsData).map(([mapId, raw]) => {
    const mapSwitches = raw.switches ?? [];

    const extracts: MapExtractRaw[] = (raw.extracts ?? []).map((e) => {
      const extract: MapExtractRaw = {
        id: e.id,
        name: tr(mapsLocale, e.name) ?? e.id,
      };
      if (e.faction != null) extract.faction = e.faction;
      if (e.switches?.length) {
        extract.switches = e.switches.map(
          (sid): MapSwitchRef => ({
            id: sid,
            name: tr(
              mapsLocale,
              mapSwitches.find((s) => s.id === sid)?.name,
            ),
          }),
        );
      }
      if (e.transferItem) {
        const ti: ContainedItemRef = {
          item: {
            id: e.transferItem.item,
            name: itemNames[e.transferItem.item] ?? '',
          },
        };
        if (e.transferItem.count != null) ti.count = e.transferItem.count;
        extract.transferItem = ti;
      }
      if (e.position) extract.position = e.position;
      return extract;
    });

    const transits: MapTransitRaw[] = (raw.transits ?? []).map((t) => ({
      id: t.id,
      description: tr(mapsLocale, t.description),
      conditions: tr(mapsLocale, t.conditions),
      map: resolveMapRef(t.map, mapsData, mapsLocale),
      position: t.position,
    }));

    const spawns: MapSpawnRaw[] = (raw.spawns ?? []).map((s) => ({
      zoneName: s.zoneName,
      position: s.position,
      sides: s.sides,
      categories: s.categories,
    }));

    const bosses: BossSpawnRaw[] = (raw.bosses ?? []).map((b) => {
      const mob = mobsData[b.mob];
      const boss: BossSpawnRaw = {
        boss: {
          name: mob ? (tr(mapsLocale, mob.name) ?? b.mob) : b.mob,
        },
      };
      if (mob?.normalizedName != null) {
        boss.boss!.normalizedName = mob.normalizedName;
      }
      if (b.spawnChance != null) boss.spawnChance = b.spawnChance;
      if (b.spawnLocations?.length) {
        boss.spawnLocations = b.spawnLocations.map(
          (sl): BossSpawnLocationRaw => ({
            name: sl.name,
            chance: sl.chance,
          }),
        );
      }
      return boss;
    });

    const hazards: MapHazardRaw[] = (raw.hazards ?? []).map((h) => ({
      hazardType: h.hazardType,
      name: tr(mapsLocale, h.name),
      position: h.position,
    }));

    const lootContainers: LootContainerPositionRaw[] = (
      raw.lootContainers ?? []
    ).map((l) => {
      const lc = lootContainersData[l.lootContainer];
      const entry: LootContainerPositionRaw = {
        lootContainer: {
          id: l.lootContainer,
          name: lc ? (tr(mapsLocale, lc.name) ?? l.lootContainer) : l.lootContainer,
        },
      };
      if (lc?.normalizedName != null) {
        entry.lootContainer!.normalizedName = lc.normalizedName;
      }
      if (l.position) entry.position = l.position;
      return entry;
    });

    return {
      id: mapId,
      extracts,
      transits,
      spawns,
      bosses,
      hazards,
      lootContainers,
    };
  });
}