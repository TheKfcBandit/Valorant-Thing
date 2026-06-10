import { describe, it, expect } from "vitest";
import { ASSET_KINDS, filterAssets, weaponOptions } from "../utils/assets";

const TIER_A = "0cebb8be-46d7-c12a-d306-e9907bfc5a25";
const TIER_B = "e046854e-406c-37f4-6607-19a9ba8426fc";

const CATALOG = [
  { id: "s1", kind: "skin", name: "Prime Vandal", weapon: "Vandal", tier: TIER_A },
  { id: "s2", kind: "skin", name: "Prime Classic", weapon: "Classic", tier: TIER_B },
  { id: "s3", kind: "skin", name: "Reaver Vandal", weapon: "Vandal", tier: TIER_B },
  { id: "b1", kind: "buddy", name: "Prime Buddy", weapon: null, tier: null },
  { id: "c1", kind: "card", name: "Reaver Card", weapon: null, tier: null },
];

describe("filterAssets", () => {
  it("filters by kind first", () => {
    expect(filterAssets(CATALOG, { kind: "skin" })).toHaveLength(3);
    expect(filterAssets(CATALOG, { kind: "buddy" })).toHaveLength(1);
    expect(filterAssets(CATALOG, { kind: "spray" })).toHaveLength(0);
  });

  it("search matches name case-insensitively and also the weapon", () => {
    expect(filterAssets(CATALOG, { kind: "skin", query: "prime" })).toHaveLength(2);
    expect(filterAssets(CATALOG, { kind: "skin", query: "VANDAL" })).toHaveLength(2);
    expect(filterAssets(CATALOG, { kind: "buddy", query: "prime" })).toHaveLength(1);
    expect(filterAssets(CATALOG, { kind: "skin", query: "nope" })).toHaveLength(0);
  });

  it("weapon and tier filters narrow skins", () => {
    expect(filterAssets(CATALOG, { kind: "skin", weapon: "Vandal" })).toHaveLength(2);
    expect(filterAssets(CATALOG, { kind: "skin", tier: TIER_B })).toHaveLength(2);
    expect(filterAssets(CATALOG, { kind: "skin", weapon: "Vandal", tier: TIER_B })).toHaveLength(1);
  });

  it("survives null input", () => {
    expect(filterAssets(null, { kind: "skin" })).toEqual([]);
  });
});

describe("weaponOptions", () => {
  it("returns sorted distinct weapons from skins only", () => {
    expect(weaponOptions(CATALOG)).toEqual(["Classic", "Vandal"]);
    expect(weaponOptions([])).toEqual([]);
    expect(weaponOptions(null)).toEqual([]);
  });
});

describe("ASSET_KINDS", () => {
  it("covers the five browsable types with unique ids", () => {
    const ids = ASSET_KINDS.map((k) => k.id);
    expect(ids).toEqual(["skin", "buddy", "spray", "card", "title"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
