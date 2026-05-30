import { describe, it, expect } from "vitest";
import { makeGrid, colLabel, cellLabelAt, cellCenterGame } from "./grid";

describe("colLabel", () => {
  it("produces Excel-style column labels", () => {
    expect(colLabel(0)).toBe("A");
    expect(colLabel(25)).toBe("Z");
    expect(colLabel(26)).toBe("AA");
    expect(colLabel(27)).toBe("AB");
    expect(colLabel(51)).toBe("AZ");
    expect(colLabel(52)).toBe("BA");
  });
});

describe("makeGrid", () => {
  const g = makeGrid(
    [
      [698, -307],
      [-372, 237],
    ],
    180,
  );

  it("computes cols, rows, and bounds", () => {
    expect(g.cols).toBe(10);
    expect(g.rows).toBeGreaterThanOrEqual(1);
    expect(g.xMin).toBe(-372);
    expect(g.xMax).toBe(698);
    expect(g.zMin).toBe(-307);
    expect(g.zMax).toBe(237);
  });

  it("sets both flip flags for 180-degree rotation", () => {
    expect(g.flipX).toBe(true);
    expect(g.flipZ).toBe(true);
  });

  it("has flipX===false for rotation 0", () => {
    const g0 = makeGrid(
      [
        [0, 0],
        [100, 100],
      ],
      0,
    );
    expect(g0.flipX).toBe(false);
    expect(g0.flipZ).toBe(false);
  });
});

describe("cellLabelAt with rotation 180", () => {
  const g = makeGrid(
    [
      [698, -307],
      [-372, 237],
    ],
    180,
  );

  it('places "A1" at the (xMax, zMax) corner (top-left after flip)', () => {
    expect(cellLabelAt(g, g.xMax, g.zMax)).toBe("A1");
  });
});

describe("cellCenterGame round-trip", () => {
  const g = makeGrid(
    [
      [698, -307],
      [-372, 237],
    ],
    180,
  );

  const cases = [
    [0, 0],
    [5, 2],
    [9, g.rows - 1],
  ] as const;

  for (const [c, r] of cases) {
    it(`round-trips cell (${c},${r})`, () => {
      const cc = cellCenterGame(g, c, r);
      expect(cellLabelAt(g, cc.x, cc.z)).toBe(cc.label);
    });
  }
});
