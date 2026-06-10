import { describe, it, expect } from "vitest";
import { groupPurchasesByMonth, sumPurchases } from "../utils/purchases";

const JUNE_10 = new Date(2026, 5, 10).getTime();
const JUNE_2 = new Date(2026, 5, 2).getTime();
const MAY_30 = new Date(2026, 4, 30).getTime();

const p = (date_ms, vp = 0, rp = 0, kc = 0, id = "u") => ({
  skin_level_uuid: id,
  date_ms,
  vp,
  rp,
  kc,
});

describe("sumPurchases", () => {
  it("folds all three currencies and survives bad input", () => {
    expect(sumPurchases([p(1, 1000, 10, 1), p(2, 2000, 0, 0)])).toEqual({
      vp: 3000,
      rp: 10,
      kc: 1,
    });
    expect(sumPurchases([])).toEqual({ vp: 0, rp: 0, kc: 0 });
    expect(sumPurchases(null)).toEqual({ vp: 0, rp: 0, kc: 0 });
    expect(sumPurchases([{ vp: "nope" }])).toEqual({ vp: 0, rp: 0, kc: 0 });
  });
});

describe("groupPurchasesByMonth", () => {
  it("groups by calendar month, newest month first", () => {
    const groups = groupPurchasesByMonth([p(MAY_30, 100), p(JUNE_10, 200), p(JUNE_2, 300)]);
    expect(groups.map((g) => g.key)).toEqual(["2026-06", "2026-05"]);
    expect(groups[0].purchases).toHaveLength(2);
    expect(groups[1].purchases).toHaveLength(1);
  });

  it("sorts purchases inside a month newest first", () => {
    const groups = groupPurchasesByMonth([p(JUNE_2, 300), p(JUNE_10, 200)]);
    expect(groups[0].purchases.map((x) => x.date_ms)).toEqual([JUNE_10, JUNE_2]);
  });

  it("computes per-month totals", () => {
    const groups = groupPurchasesByMonth([p(JUNE_10, 200, 5), p(JUNE_2, 300)]);
    expect(groups[0].totals).toEqual({ vp: 500, rp: 5, kc: 0 });
  });

  it("returns empty for empty or missing input", () => {
    expect(groupPurchasesByMonth([])).toEqual([]);
    expect(groupPurchasesByMonth(null)).toEqual([]);
  });

  it("zero-pads month keys so lexicographic sort is chronological", () => {
    const jan = new Date(2026, 0, 5).getTime();
    const nov = new Date(2025, 10, 5).getTime();
    const groups = groupPurchasesByMonth([p(nov, 1), p(jan, 2)]);
    expect(groups.map((g) => g.key)).toEqual(["2026-01", "2025-11"]);
  });
});
