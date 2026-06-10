import { describe, it, expect } from "vitest";
import { buildHeatLUT, stampAlpha, HEAT_STOPS } from "../utils/heatmap";

describe("buildHeatLUT", () => {
  it("spans 256 RGB entries from the first stop color to the last", () => {
    const lut = buildHeatLUT();
    expect(lut.length).toBe(256 * 3);
    expect([lut[0], lut[1], lut[2]]).toEqual(HEAT_STOPS[0].color);
    const last = HEAT_STOPS[HEAT_STOPS.length - 1].color;
    expect([lut[255 * 3], lut[255 * 3 + 1], lut[255 * 3 + 2]]).toEqual(last);
  });

  it("interpolates monotonically toward red in the top band", () => {
    const lut = buildHeatLUT();
    // Within the yellow→red band the red channel stays maxed-ish and the
    // green channel falls as density rises.
    const g = (i) => lut[i * 3 + 1];
    expect(g(200)).toBeGreaterThan(g(230));
    expect(g(230)).toBeGreaterThan(g(255));
  });

  it("honors custom stops", () => {
    const lut = buildHeatLUT([
      { t: 0, color: [0, 0, 0] },
      { t: 1, color: [255, 255, 255] },
    ]);
    expect(lut[128 * 3]).toBeGreaterThan(100);
    expect(lut[128 * 3]).toBeLessThan(155);
  });
});

describe("stampAlpha", () => {
  it("keeps single points clearly visible and dense fields unsaturated", () => {
    expect(stampAlpha(0)).toBe(0);
    expect(stampAlpha(1)).toBeCloseTo(0.55);
    expect(stampAlpha(400)).toBeLessThan(0.15);
    expect(stampAlpha(400)).toBeGreaterThanOrEqual(0.14);
  });

  it("never grows as point count rises", () => {
    let prev = Infinity;
    for (const n of [1, 4, 16, 64, 256, 1024]) {
      const a = stampAlpha(n);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });
});
