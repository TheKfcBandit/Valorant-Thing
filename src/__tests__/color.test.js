import { describe, expect, test } from "vitest";
import { hexToRgb, rgbToHex } from "../utils/color";

describe("hexToRgb / rgbToHex round-trip", () => {
  test.each([
    ["#000000", [0, 0, 0]],
    ["#ffffff", [255, 255, 255]],
    ["#ed4245", [237, 66, 69]],
    ["#5865f2", [88, 101, 242]],
    ["#00e6b4", [0, 230, 180]],
  ])("%s ↔ %j", (hex, rgb) => {
    expect(hexToRgb(hex)).toEqual(rgb);
    expect(rgbToHex(...rgb)).toBe(hex);
  });

  test("rgbToHex clamps out-of-range values", () => {
    expect(rgbToHex(-10, 300, 128)).toBe("#00ff80");
  });

  test("rgbToHex pads single hex digits", () => {
    expect(rgbToHex(1, 2, 3)).toBe("#010203");
  });
});
