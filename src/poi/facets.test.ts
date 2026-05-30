import { describe, it, expect } from "vitest";
import {
  facetKeyOf,
  facetDefaultOn,
  allFacetDefaults,
  buildFacetGroups,
} from "./facets";
import type { Poi } from "./types";

function poi(category: Poi["category"], extra: Partial<Poi> = {}): Poi {
  return {
    id: `${category}:${Math.random()}`,
    category,
    mapId: "m",
    position: { x: 0, y: 0, z: 0 },
    label: category,
    source: category === "custom" ? "user" : "tarkov-dev",
    ...extra,
  };
}

describe("facetKeyOf", () => {
  it("maps extracts by faction (shared folds into pmc)", () => {
    expect(facetKeyOf(poi("extract", { meta: { faction: "pmc" } }))).toBe("extract:pmc");
    expect(facetKeyOf(poi("extract", { meta: { faction: "shared" } }))).toBe("extract:pmc");
    expect(facetKeyOf(poi("extract", { meta: { faction: "scav" } }))).toBe("extract:scav");
    expect(facetKeyOf(poi("extract", {}))).toBe("extract:pmc"); // missing faction → pmc
  });

  it("maps spawns by subtype (all/unknown fold into scav)", () => {
    expect(facetKeyOf(poi("spawn", { subtype: "pmc" }))).toBe("spawn:pmc");
    expect(facetKeyOf(poi("spawn", { subtype: "scav" }))).toBe("spawn:scav");
    expect(facetKeyOf(poi("spawn", { subtype: "sniper" }))).toBe("spawn:sniper");
    expect(facetKeyOf(poi("spawn", { subtype: "all" }))).toBe("spawn:scav");
  });

  it("splits bosses from cultists", () => {
    expect(facetKeyOf(poi("boss", { subtype: "boss" }))).toBe("boss");
    expect(facetKeyOf(poi("boss", { subtype: "cultist" }))).toBe("cultist");
  });

  it("maps transit, hazard, custom, and per-bucket loot", () => {
    expect(facetKeyOf(poi("transit"))).toBe("transit");
    expect(facetKeyOf(poi("hazard"))).toBe("hazard");
    expect(facetKeyOf(poi("custom"))).toBe("custom");
    expect(facetKeyOf(poi("loot", { subtype: "medbag" }))).toBe("loot:medbag");
    expect(facetKeyOf(poi("loot", {}))).toBe("loot:other");
  });
});

describe("facetDefaultOn", () => {
  // Narrowed default-on set (2026-05-30): only PMC extractions + My markers
  // (quests render separately and are always on).
  it("defaults PMC extractions / custom ON", () => {
    for (const k of ["extract:pmc", "custom"]) {
      expect(facetDefaultOn(k)).toBe(true);
    }
  });
  it("defaults spawns/boss/scav-extract/transit/hazard/cultist/loot OFF", () => {
    for (const k of [
      "extract:scav", "spawn:pmc", "spawn:scav", "spawn:sniper", "boss",
      "transit", "hazard", "cultist", "loot:medbag", "loot:anything",
    ]) {
      expect(facetDefaultOn(k)).toBe(false);
    }
  });
  it("allFacetDefaults seeds the static facets", () => {
    const d = allFacetDefaults();
    expect(d["extract:pmc"]).toBe(true);
    expect(d["spawn:pmc"]).toBe(false);
    expect(d["custom"]).toBe(true);
  });
});

describe("buildFacetGroups", () => {
  it("counts facets and only emits present ones (plus an always-present custom row)", () => {
    const pois: Poi[] = [
      poi("extract", { meta: { faction: "pmc" } }),
      poi("extract", { meta: { faction: "pmc" } }),
      poi("extract", { meta: { faction: "scav" } }),
      poi("loot", { subtype: "medbag" }),
      poi("loot", { subtype: "ammo" }),
      poi("loot", { subtype: "ammo" }),
    ];
    const groups = buildFacetGroups(pois);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));

    // Extractions group present with correct counts.
    const ex = byId["extract"];
    expect(ex.facets.find((f) => f.key === "extract:pmc")!.count).toBe(2);
    expect(ex.facets.find((f) => f.key === "extract:scav")!.count).toBe(1);

    // Spawn group absent (no spawns present).
    expect(byId["spawn"]).toBeUndefined();

    // Loot group with per-bucket counts, alphabetised.
    const loot = byId["loot"];
    expect(loot.facets.map((f) => f.key)).toEqual(["loot:ammo", "loot:medbag"]);
    expect(loot.facets.find((f) => f.key === "loot:ammo")!.count).toBe(2);

    // Custom row always present, count reflects custom POIs.
    const custom = byId["custom"];
    expect(custom.facets[0].key).toBe("custom");
    expect(custom.facets[0].count).toBe(0);
  });

  it("counts custom markers passed alongside tarkov-dev POIs", () => {
    const groups = buildFacetGroups([poi("custom"), poi("custom")]);
    const custom = groups.find((g) => g.id === "custom")!;
    expect(custom.facets[0].count).toBe(2);
  });
});
