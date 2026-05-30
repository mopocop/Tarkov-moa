// Transforms tarkov.dev per-map data (MapPoiData) into the unified Poi model.
// All the judgment lives here (extract classification, the boss "join", loot
// bucketing) so the render layer stays dumb.
//
// Data realities baked in (verified against the live tarkov.dev schema + data):
//  - Extracts carry coords + faction + switches + transferItem → we classify
//    visual variants (car / switch-gated / item-required / plain) and color by
//    faction. Live per-raid availability is NOT knowable, so we show all and
//    let the faction filter hide Scav-only exits.
//  - Bosses have NO coordinates of their own; their spawnLocations are display
//    names ("Dorms", "Stronghold") that do NOT match the internal spawn
//    zoneName codes. So boss markers are placed at boss-category SPAWN coords
//    and labeled generically, with the map's boss roster + chances in the note.
//  - Loot containers are numerous → we bucket them by name so a type sub-filter
//    (medbag/safe/computer/ammo/…) can thin the set.
import type { Poi } from "./types";
import type {
  MapPoiData,
  MapExtractRaw,
  MapTransitRaw,
  MapSpawnRaw,
  BossSpawnRaw,
  MapHazardRaw,
  LootContainerPositionRaw,
  MapPosition,
} from "../api/types";

function hasPos(p?: MapPosition | null): p is MapPosition {
  return !!p && typeof p.x === "number" && typeof p.z === "number";
}

function pos(p: MapPosition): { x: number; y: number; z: number } {
  return { x: p.x, y: typeof p.y === "number" ? p.y : 0, z: p.z };
}

// ---- Extracts -------------------------------------------------------------
// Marker color by faction; glyph by special-requirement variant.
const FACTION_COLOR: Record<string, string> = {
  pmc: "#22c55e", // green
  shared: "#3b82f6", // blue (co-op / shared)
  scav: "#f59e0b", // amber
};

function extractToPoi(mapId: string, e: MapExtractRaw): Poi | null {
  if (!hasPos(e.position)) return null;
  const faction = (e.faction ?? "shared").toLowerCase();
  const requiresSwitch = !!(e.switches && e.switches.length > 0);
  const requiresItem = !!(e.transferItem && e.transferItem.item);
  const isCar = /car/i.test(e.name ?? "");

  // Visual variant priority: car > switch > item > plain. Drives the glyph.
  const glyph = isCar ? "C" : requiresSwitch ? "S" : requiresItem ? "$" : "E";
  const variant = isCar ? "car" : requiresSwitch ? "switch" : requiresItem ? "item" : "plain";

  const notes: string[] = [
    faction === "pmc" ? "PMC exit" : faction === "scav" ? "Scav-only exit" : "Shared (co-op) exit",
  ];
  if (isCar) notes.push("car extract");
  if (requiresSwitch) {
    const names = (e.switches ?? []).map((s) => s.name).filter(Boolean).join(", ");
    notes.push(names ? `needs switch: ${names}` : "needs switch");
  }
  if (requiresItem) {
    const itemName = e.transferItem?.item?.name;
    notes.push(itemName ? `requires: ${itemName}` : "requires item/payment");
  }

  return {
    id: `extract:${e.id}`,
    category: "extract",
    subtype: variant,
    mapId,
    position: pos(e.position),
    label: e.name ?? "Extract",
    note: notes.join(" · "),
    color: FACTION_COLOR[faction] ?? FACTION_COLOR.shared,
    source: "tarkov-dev",
    meta: { faction, requiresSwitch, requiresItem, isCar, glyph },
  };
}

// ---- Transits -------------------------------------------------------------
function transitToPoi(mapId: string, t: MapTransitRaw): Poi | null {
  if (!hasPos(t.position)) return null;
  const dest = t.map?.name;
  return {
    id: `transit:${t.id}`,
    category: "transit",
    subtype: "transit",
    mapId,
    position: pos(t.position),
    label: dest ? `Transit → ${dest}` : t.description || "Transit",
    note: [t.description, t.conditions].filter(Boolean).join(" · ") || undefined,
    source: "tarkov-dev",
    meta: { destMapId: t.map?.id, destMapName: dest, conditions: t.conditions },
  };
}

// ---- Spawns + Bosses ------------------------------------------------------
function catMatch(cats: string[] | undefined, re: RegExp): boolean {
  return !!cats && cats.some((c) => re.test(c));
}

interface RosterEntry {
  name: string;
  normalizedName: string;
  chance: number;
}

function bossRoster(bosses?: BossSpawnRaw[]): RosterEntry[] {
  if (!bosses) return [];
  return bosses
    .filter((b) => b.boss?.name)
    .map((b) => {
      const locChance =
        b.spawnLocations?.reduce((m, l) => Math.max(m, l.chance ?? 0), 0) ?? 0;
      return {
        name: b.boss!.name,
        normalizedName: b.boss!.normalizedName ?? "",
        chance: Math.max(b.spawnChance ?? 0, locChance),
      };
    });
}

function spawnsToPois(
  mapId: string,
  spawns: MapSpawnRaw[] | undefined,
  bosses?: BossSpawnRaw[],
): Poi[] {
  if (!spawns) return [];
  const roster = bossRoster(bosses);
  const rosterNote = roster.length
    ? "Map bosses: " +
      roster.map((r) => `${r.name} ${Math.round(r.chance * 100)}%`).join(", ")
    : undefined;
  // Boss-category spawns can't be identified per-coordinate, so we label them by
  // the map roster. Only call them "cultist" when the roster is cultist-EXCLUSIVE
  // — otherwise a map like Customs (Reshala + cultists) would fold every boss
  // spawn into the cultist facet, leaving the Boss facet empty (the v0.7 bug).
  const isCultist = (r: RosterEntry) => /cultist|sektant|sectant/i.test(r.normalizedName);
  const onlyCultist = roster.length > 0 && roster.every(isCultist);

  const out: Poi[] = [];
  spawns.forEach((s, i) => {
    if (!hasPos(s.position)) return;
    const p = pos(s.position);
    const isBoss = catMatch(s.categories, /boss/i);
    const isSniper = catMatch(s.categories, /sniper/i);

    if (isBoss) {
      // Coords are real; the specific boss is unknowable per-coordinate (see
      // header note), so label generically and carry the roster in the tooltip.
      out.push({
        id: `boss:${mapId}:${i}`,
        category: "boss",
        subtype: onlyCultist ? "cultist" : "boss",
        mapId,
        position: p,
        label: "Boss spawn",
        note: rosterNote,
        source: "tarkov-dev",
        meta: { zoneName: s.zoneName, categories: s.categories, roster },
      });
      return;
    }

    const sides = (s.sides ?? []).map((x) => x.toLowerCase());
    const subtype = isSniper
      ? "sniper"
      : sides.includes("pmc")
        ? "pmc"
        : sides.includes("scav")
          ? "scav"
          : "all";
    out.push({
      id: `spawn:${mapId}:${i}`,
      category: "spawn",
      subtype,
      mapId,
      position: p,
      label: isSniper ? "Sniper spawn" : `${subtype.toUpperCase()} spawn`,
      note: s.zoneName || undefined,
      source: "tarkov-dev",
      meta: { sides: s.sides, categories: s.categories, zoneName: s.zoneName },
    });
  });
  return out;
}

// ---- Hazards --------------------------------------------------------------
function hazardToPoi(mapId: string, h: MapHazardRaw, i: number): Poi | null {
  if (!hasPos(h.position)) return null;
  return {
    id: `hazard:${mapId}:${i}`,
    category: "hazard",
    subtype: (h.hazardType ?? "hazard").toLowerCase(),
    mapId,
    position: pos(h.position),
    label: h.name || h.hazardType || "Hazard",
    note: h.hazardType,
    source: "tarkov-dev",
    meta: { hazardType: h.hazardType },
  };
}

// ---- Loot containers ------------------------------------------------------
// Bucket by container name so the loot type sub-filter can thin the large set.
export function lootBucket(normalizedName?: string, name?: string): string {
  const s = `${normalizedName ?? ""} ${name ?? ""}`.toLowerCase();
  // Buried barrel / ground caches — split out of "other" so they get their own
  // (coin) marker. Checked first: "cache"/"buried" don't collide with the rules
  // below.
  if (/cache|buried/.test(s)) return "stash";
  if (/med|aid|first/.test(s)) return "medbag";
  if (/safe/.test(s)) return "safe";
  if (/pc|computer|tech|server/.test(s)) return "computer";
  if (/ammo|cartridge|grenade/.test(s)) return "ammo";
  if (/cash|money|register/.test(s)) return "cash";
  if (/weapon|gun|rack/.test(s)) return "weapon";
  if (/jacket/.test(s)) return "jacket";
  if (/duffle|duffel|sport|bag/.test(s)) return "bag";
  if (/drawer|cabinet|filing|wooden|crate|box|case/.test(s)) return "container";
  return "other";
}

function lootToPoi(mapId: string, lc: LootContainerPositionRaw, i: number): Poi | null {
  if (!hasPos(lc.position)) return null;
  const name = lc.lootContainer?.name;
  const bucket = lootBucket(lc.lootContainer?.normalizedName, name);
  return {
    id: `loot:${mapId}:${i}`,
    category: "loot",
    subtype: bucket,
    mapId,
    position: pos(lc.position),
    label: name || "Container",
    source: "tarkov-dev",
    meta: { bucket, normalizedName: lc.lootContainer?.normalizedName },
  };
}

// ---- Public API -----------------------------------------------------------
export function mapDataToPois(map: MapPoiData): Poi[] {
  const id = map.id;
  const out: Poi[] = [];
  for (const e of map.extracts ?? []) {
    const p = extractToPoi(id, e);
    if (p) out.push(p);
  }
  for (const t of map.transits ?? []) {
    const p = transitToPoi(id, t);
    if (p) out.push(p);
  }
  out.push(...spawnsToPois(id, map.spawns, map.bosses));
  (map.hazards ?? []).forEach((h, i) => {
    const p = hazardToPoi(id, h, i);
    if (p) out.push(p);
  });
  (map.lootContainers ?? []).forEach((lc, i) => {
    const p = lootToPoi(id, lc, i);
    if (p) out.push(p);
  });
  return out;
}

// Index all maps' POIs by mapId — convenient for App to slice the current map.
export function poisByMap(maps: MapPoiData[]): Record<string, Poi[]> {
  const byMap: Record<string, Poi[]> = {};
  for (const m of maps) byMap[m.id] = mapDataToPois(m);
  return byMap;
}

// Distinct loot buckets present in a POI list (for the loot type sub-filter UI).
export function lootBucketsOf(pois: Poi[]): string[] {
  const set = new Set<string>();
  for (const p of pois) if (p.category === "loot" && p.subtype) set.add(p.subtype);
  return Array.from(set).sort();
}
