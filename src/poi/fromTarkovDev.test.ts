import { describe, it, expect } from "vitest";
import { mapDataToPois, lootBucket } from "./fromTarkovDev";
import type { MapPoiData } from "../api/types";

describe("lootBucket", () => {
  it("matches medbag", () => {
    expect(lootBucket("medbag", "Medical bag")).toBe("medbag");
  });

  it("matches computer", () => {
    expect(lootBucket("", "PC block")).toBe("computer");
  });

  it("matches weapon", () => {
    expect(lootBucket("", "Weapon box")).toBe("weapon");
  });

  it("matches safe", () => {
    expect(lootBucket("safe", "Safe")).toBe("safe");
  });
});

describe("mapDataToPois — extracts", () => {
  const fixture: MapPoiData = {
    id: "m1",
    extracts: [
      {
        id: "e1",
        name: "ZB-1011",
        faction: "pmc",
        position: { x: 1, y: 0, z: 1 },
      },
      {
        id: "e2",
        name: "Car extract",
        faction: "shared",
        position: { x: 2, y: 0, z: 2 },
      },
      {
        id: "e3",
        name: "Gate",
        faction: "pmc",
        switches: [{ id: "s", name: "Power" }],
        position: { x: 3, y: 0, z: 3 },
      },
      {
        id: "e4",
        name: "Sewer",
        faction: "scav",
        position: { x: 4, y: 0, z: 4 },
      },
    ],
  };

  const pois = mapDataToPois(fixture);
  const extracts = pois.filter((p) => p.category === "extract");

  it("classifies plain (no car, no switch)", () => {
    const e1 = extracts.find((p) => p.id === "extract:e1");
    expect(e1).toBeDefined();
    expect(e1!.subtype).toBe("plain");
  });

  it("classifies car extract", () => {
    const e2 = extracts.find((p) => p.id === "extract:e2");
    expect(e2).toBeDefined();
    expect(e2!.subtype).toBe("car");
  });

  it("classifies switch-gated extract and note mentions switch", () => {
    const e3 = extracts.find((p) => p.id === "extract:e3");
    expect(e3).toBeDefined();
    expect(e3!.subtype).toBe("switch");
    expect(e3!.note).toMatch(/switch/i);
  });

  it("tags scav faction in meta", () => {
    const e4 = extracts.find((p) => p.id === "extract:e4");
    expect(e4).toBeDefined();
    expect(e4!.meta?.faction).toBe("scav");
  });
});

describe("mapDataToPois — bosses and spawns", () => {
  const fixture: MapPoiData = {
    id: "m2",
    bosses: [
      {
        boss: { name: "Reshala", normalizedName: "reshala" },
        spawnChance: 0.35,
        spawnLocations: [{ name: "Dorms", chance: 0.35 }],
      },
    ],
    spawns: [
      {
        zoneName: "Z1",
        position: { x: 5, y: 0, z: 5 },
        sides: ["Scav"],
        categories: ["Boss"],
      },
      {
        zoneName: "Z2",
        position: { x: 6, y: 0, z: 6 },
        sides: ["Pmc"],
        categories: ["Bot"],
      },
    ],
  };

  const pois = mapDataToPois(fixture);

  it("produces exactly one boss-category POI", () => {
    const bossPois = pois.filter((p) => p.category === "boss");
    expect(bossPois).toHaveLength(1);
  });

  it("boss POI note mentions Reshala", () => {
    const bossPoi = pois.find((p) => p.category === "boss");
    expect(bossPoi!.note).toMatch(/Reshala/);
  });

  it("Bot spawn becomes category spawn with subtype pmc", () => {
    const botPoi = pois.find(
      (p) => p.category === "spawn" && p.subtype === "pmc",
    );
    expect(botPoi).toBeDefined();
    expect(botPoi!.position.x).toBe(6);
  });

  it("no boss-category spawn leaks into spawn category", () => {
    const spawnPois = pois.filter((p) => p.category === "spawn");
    expect(spawnPois).toHaveLength(1);
  });
});

describe("mapDataToPois — loot containers", () => {
  const fixture: MapPoiData = {
    id: "m3",
    lootContainers: [
      {
        lootContainer: { id: "lc1", name: "Medical bag", normalizedName: "medbag" },
        position: { x: 1, y: 0, z: 1 },
      },
      {
        lootContainer: { id: "lc2", name: "Safe" },
        position: { x: 2, y: 0, z: 2 },
      },
    ],
  };

  const pois = mapDataToPois(fixture);

  it("buckets medbag", () => {
    const med = pois.find((p) => p.id === "loot:m3:0");
    expect(med).toBeDefined();
    expect(med!.subtype).toBe("medbag");
  });

  it("buckets safe", () => {
    const safe = pois.find((p) => p.id === "loot:m3:1");
    expect(safe).toBeDefined();
    expect(safe!.subtype).toBe("safe");
  });
});

describe("mapDataToPois — empty input", () => {
  it("returns empty array for map with no arrays", () => {
    expect(mapDataToPois({ id: "m1" })).toEqual([]);
  });
});
