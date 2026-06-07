import { describe, expect, test } from "vitest";
import { normalizeRrEntry, normalizeRrResponse } from "../riotShapes";

describe("normalizeRrEntry", () => {
  test("round-trips a real competitiveupdates entry", () => {
    const raw = {
      MatchID: "abc-123",
      MatchStartTime: 1716800000000,
      TierAfterUpdate: 21,
      TierBeforeUpdate: 20,
      RankedRatingAfterUpdate: 47,
      RankedRatingBeforeUpdate: 80,
      RankedRatingEarned: -33,
      CompetitiveMovement: "DEMOTED",
      MapID: "/Game/Maps/Ascent/Ascent",
    };

    expect(normalizeRrEntry(raw)).toEqual({
      matchId: "abc-123",
      matchStartTimeMs: 1716800000000,
      tierAfter: 21,
      tierBefore: 20,
      rrAfter: 47,
      rrBefore: 80,
      rrEarned: -33,
      movement: "DEMOTED",
      mapId: "/Game/Maps/Ascent/Ascent",
    });
  });

  test("defaults missing fields to typed zero values", () => {
    expect(normalizeRrEntry({})).toEqual({
      matchId: "",
      matchStartTimeMs: 0,
      tierAfter: 0,
      tierBefore: 0,
      rrAfter: 0,
      rrBefore: 0,
      rrEarned: 0,
      movement: "",
      mapId: "",
    });
  });

  test("handles null / undefined input without throwing", () => {
    expect(() => normalizeRrEntry(null)).not.toThrow();
    expect(() => normalizeRrEntry(undefined)).not.toThrow();
  });
});

describe("normalizeRrResponse", () => {
  test("maps every entry in Matches", () => {
    const raw = {
      Matches: [
        { MatchID: "a", RankedRatingEarned: 20 },
        { MatchID: "b", RankedRatingEarned: -15 },
      ],
    };
    const { matches } = normalizeRrResponse(raw);
    expect(matches).toHaveLength(2);
    expect(matches[0].matchId).toBe("a");
    expect(matches[0].rrEarned).toBe(20);
    expect(matches[1].rrEarned).toBe(-15);
  });

  test("returns empty array when Matches is missing or not an array", () => {
    expect(normalizeRrResponse({}).matches).toEqual([]);
    expect(normalizeRrResponse({ Matches: null }).matches).toEqual([]);
    expect(normalizeRrResponse({ Matches: "nope" }).matches).toEqual([]);
  });
});
