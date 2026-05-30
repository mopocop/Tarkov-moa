import { describe, it, expect, beforeEach } from "vitest";
import {
  newCustomPoi,
  addCustomPoi,
  updateCustomPoi,
  removeCustomPoi,
  loadCustomPois,
  saveCustomPois,
} from "./customPoi";
import { serializePois, deserializePois } from "./serialize";
import type { Poi } from "./types";

const STORAGE_KEY = "tc_custom_pois_v1";

beforeEach(() => {
  localStorage.clear();
});

describe("newCustomPoi", () => {
  const poi = newCustomPoi("m1", 10, 20);

  it("has category custom and source user", () => {
    expect(poi.category).toBe("custom");
    expect(poi.source).toBe("user");
  });

  it("generates a string id", () => {
    expect(typeof poi.id).toBe("string");
    expect(poi.id.length).toBeGreaterThan(0);
  });

  it("sets default label to Marker", () => {
    expect(poi.label).toBe("Marker");
  });

  it("places position correctly", () => {
    expect(poi.position.x).toBe(10);
    expect(poi.position.z).toBe(20);
    expect(poi.position.y).toBe(0);
  });

  it("sets mapId", () => {
    expect(poi.mapId).toBe("m1");
  });
});

describe("CRUD operations", () => {
  const p1: Poi = {
    id: "a",
    category: "custom",
    source: "user",
    mapId: "m",
    position: { x: 0, y: 0, z: 0 },
    label: "One",
  };
  const p2: Poi = {
    id: "b",
    category: "custom",
    source: "user",
    mapId: "m",
    position: { x: 0, y: 0, z: 0 },
    label: "Two",
  };

  it("addCustomPoi appends and is immutable", () => {
    const before: Poi[] = [p1];
    const after = addCustomPoi(before, p2);
    expect(after).toHaveLength(2);
    expect(after[1].id).toBe("b");
    expect(before).toHaveLength(1); // immutable
  });

  it("updateCustomPoi merges patch but keeps id", () => {
    const after = updateCustomPoi([p1, p2], "a", {
      label: "Updated",
      note: "n",
    });
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe("a");
    expect(after[0].label).toBe("Updated");
    expect(after[0].note).toBe("n");
    expect(after[1]).toBe(p2); // unchanged
  });

  it("removeCustomPoi drops by id", () => {
    const after = removeCustomPoi([p1, p2], "a");
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("b");
  });
});

describe("localStorage round-trip", () => {
  it("save → load returns same poi", () => {
    const poi = newCustomPoi("m1", 1, 2);
    saveCustomPois([poi]);
    const loaded = loadCustomPois();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(poi.id);
  });
});

describe("loadCustomPois filtering", () => {
  it("ignores non-custom entries in the store", () => {
    const bad: unknown = {
      schemaVersion: 1,
      pois: [
        { id: "x", category: "extract", source: "tarkov-dev", mapId: "m", position: { x: 0, y: 0, z: 0 }, label: "E" },
        { id: "y", category: "custom", source: "user", mapId: "m", position: { x: 0, y: 0, z: 0 }, label: "C" },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    const loaded = loadCustomPois();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("y");
  });

  it("returns empty array when store key is missing", () => {
    expect(loadCustomPois()).toEqual([]);
  });
});

describe("serialize / deserialize", () => {
  it("round-trip preserves ids", () => {
    const p1 = newCustomPoi("m1", 0, 0);
    const p2 = newCustomPoi("m1", 10, 10);
    const json = serializePois([p1, p2]);
    const back = deserializePois(json);
    expect(back).toHaveLength(2);
    expect(back[0].id).toBe(p1.id);
    expect(back[1].id).toBe(p2.id);
  });

  it("deserializePois returns empty array for bad json", () => {
    expect(deserializePois("not json")).toEqual([]);
  });

  it("deserializePois returns empty array for empty string", () => {
    expect(deserializePois("")).toEqual([]);
  });
});
