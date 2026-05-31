import { describe, it, expect } from "vitest";
import {
  classifyMarker,
  isInBounds,
  normalizeBounds,
  GROUND_FLOOR_ID,
  type MapFloor,
} from "./floorClassify";

const floors: MapFloor[] = [
  {
    id: "3f",
    name: "3F",
    extents: [
      {
        heightMin: 5.7,
        heightMax: 1000,
        bounds: [{ xMin: 165, xMax: 243, zMin: 125, zMax: 190 }],
        regions: ["dorms"],
      },
      {
        heightMin: 7.7,
        heightMax: 11.3,
        bounds: [{ xMin: 22, xMax: 73, zMin: -73, zMax: -38 }],
        regions: ["warehouse 17"],
      },
    ],
  },
  {
    id: "2f",
    name: "2F",
    extents: [
      {
        heightMin: 2.7,
        heightMax: 6.5,
        bounds: [{ xMin: 165, xMax: 243, zMin: 125, zMax: 190 }],
        regions: ["dorms"],
      },
      {
        heightMin: 3.9,
        heightMax: 7.6,
        bounds: [{ xMin: 22, xMax: 73, zMin: -38, zMax: 57 }],
        regions: ["warehouse 17"],
      },
    ],
  },
  {
    id: "underground",
    name: "Underground",
    extents: [
      {
        heightMin: -1000,
        heightMax: 0.5,
        bounds: [{ xMin: 620, xMax: 635, zMin: -137, zMax: -125 }],
        regions: ["zb-1011"],
      },
    ],
  },
  { id: GROUND_FLOOR_ID, name: "Ground" },
];

describe("floorClassify", () => {
  it("classifies an underground point", () => {
    expect(classifyMarker(625, -0.5, -130, floors)).toBe("underground");
  });

  it("classifies dorms shared-Y point as 3F when listed first", () => {
    // Y=8 is in both 3F dorms [5.7,1000] and 2F dorms [2.7,6.5]? No — Y=8 only matches 3F.
    // Use a Y in 2F's range but not 3F's: Y=4
    expect(classifyMarker(200, 4, 150, floors)).toBe("2f");
    // Y=8 in dorms area → only 3F's range
    expect(classifyMarker(200, 8, 150, floors)).toBe("3f");
  });

  it("classifies warehouse 17 mezzanine to 3F when above 7.7", () => {
    expect(classifyMarker(50, 9, -50, floors)).toBe("3f");
  });

  it("falls through to ground when no extent matches", () => {
    expect(classifyMarker(0, 0, 0, floors)).toBe(GROUND_FLOOR_ID);
    expect(classifyMarker(-500, 5, 500, floors)).toBe(GROUND_FLOOR_ID);
  });

  it("first-match wins when extents overlap", () => {
    // Construct overlap: at (200, 6, 150), 2F extent matches [2.7,6.5] but 3F
    // extent at dorms is [5.7,1000] — both match. Since 3F is listed first,
    // it wins.
    expect(classifyMarker(200, 6, 150, floors)).toBe("3f");
  });

  it("isInBounds is inclusive on both edges", () => {
    const b = { xMin: 0, xMax: 10, zMin: 0, zMax: 10 };
    expect(isInBounds(0, 0, b)).toBe(true);
    expect(isInBounds(10, 10, b)).toBe(true);
    expect(isInBounds(5, 5, b)).toBe(true);
    expect(isInBounds(-0.01, 5, b)).toBe(false);
    expect(isInBounds(10.01, 5, b)).toBe(false);
  });

  it("normalizeBounds sorts corners regardless of order", () => {
    expect(normalizeBounds([243, 190], [165, 125])).toEqual({
      xMin: 165,
      xMax: 243,
      zMin: 125,
      zMax: 190,
    });
    expect(normalizeBounds([165, 125], [243, 190])).toEqual({
      xMin: 165,
      xMax: 243,
      zMin: 125,
      zMax: 190,
    });
  });

  // Interchange-style: floors defined by height alone (no per-extent bounds).
  const heightOnlyFloors: MapFloor[] = [
    {
      id: "3f",
      name: "3rd Floor",
      svgLayerId: "Second_Floor",
      extents: [{ heightMin: 34, heightMax: 1000 }],
    },
    {
      id: "2f",
      name: "2nd Floor",
      svgLayerId: "First_Floor",
      extents: [{ heightMin: 25, heightMax: 34 }],
    },
    { id: GROUND_FLOOR_ID, name: "Ground" },
  ];

  it("matches height-only extents anywhere on the map (x/z ignored)", () => {
    // Any x/z at height 28 → 2F; at 40 → 3F; below the bands → ground.
    expect(classifyMarker(0, 28, 0, heightOnlyFloors)).toBe("2f");
    expect(classifyMarker(9999, 28, -9999, heightOnlyFloors)).toBe("2f");
    expect(classifyMarker(0, 40, 0, heightOnlyFloors)).toBe("3f");
    expect(classifyMarker(0, 10, 0, heightOnlyFloors)).toBe(GROUND_FLOOR_ID);
  });

  it("treats an empty bounds array as height-only", () => {
    const f: MapFloor[] = [
      { id: "x", name: "X", extents: [{ heightMin: 0, heightMax: 5, bounds: [] }] },
      { id: GROUND_FLOOR_ID, name: "Ground" },
    ];
    expect(classifyMarker(123, 3, -456, f)).toBe("x");
    expect(classifyMarker(123, 9, -456, f)).toBe(GROUND_FLOOR_ID);
  });
});
