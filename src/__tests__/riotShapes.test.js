import { describe, expect, test } from "vitest";
import {
  normalizeRrEntry,
  normalizeRrResponse,
  normalizeLiveMatch,
  normalizeSeasonalPeak,
} from "../riotShapes";

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

describe("normalizeLiveMatch", () => {
  test("normalizes a pregame payload to camelCase with ally-only roster", () => {
    const raw = {
      _phase: "pregame",
      ID: "match-1",
      MapID: "/Game/Maps/Ascent/Ascent",
      GameMode: "/Game/GameModes/Bomb/BombGameMode.BombGameMode_C",
      MatchmakingData: { QueueID: "competitive" },
      GamePodID: "aresriot.aws-use1.na-gp-ashburn-1",
      AllyTeam: {
        Players: [
          {
            Subject: "p1",
            CharacterID: "AGENT-UUID",
            PlayerIdentity: { AccountLevel: 120, Incognito: true, HideAccountLevel: false },
          },
        ],
      },
    };
    const live = normalizeLiveMatch(raw);
    expect(live.phase).toBe("PREGAME");
    expect(live.matchId).toBe("match-1");
    expect(live.mapId).toBe("/Game/Maps/Ascent/Ascent");
    expect(live.queueId).toBe("competitive");
    expect(live.gamePodId).toContain("ashburn");
    expect(live.players).toEqual([
      {
        puuid: "p1",
        characterId: "AGENT-UUID",
        team: "ally",
        accountLevel: 120,
        incognito: true,
        hideLevel: false,
      },
    ]);
  });

  test("normalizes a core-game payload with TeamIDs and identity defaults", () => {
    const raw = {
      _phase: "ingame",
      MatchID: "match-2",
      MapID: "/Game/Maps/Bonsai/Bonsai",
      Players: [
        { Subject: "blue1", CharacterID: "c1", TeamID: "Blue" },
        { Subject: "red1", CharacterID: "c2", TeamID: "Red", PlayerIdentity: {} },
      ],
    };
    const live = normalizeLiveMatch(raw);
    expect(live.phase).toBe("INGAME");
    expect(live.matchId).toBe("match-2");
    expect(live.players.map((p) => p.team)).toEqual(["Blue", "Red"]);
    // Missing PlayerIdentity falls back to safe defaults, not crashes.
    expect(live.players[0].accountLevel).toBe(0);
    expect(live.players[0].incognito).toBe(false);
    expect(live.players[0].hideLevel).toBe(false);
  });

  test("survives an empty payload", () => {
    const live = normalizeLiveMatch({});
    expect(live.matchId).toBe("");
    expect(live.phase).toBe("INGAME");
    expect(live.players).toEqual([]);
  });
});

describe("normalizeSeasonalPeak", () => {
  test("picks the highest tier, breaking ties on RR", () => {
    const raw = {
      QueueSkills: {
        competitive: {
          SeasonalInfoBySeasonID: {
            s1: { CompetitiveTier: 18, RankedRating: 40 },
            s2: { CompetitiveTier: 21, RankedRating: 12 },
            s3: { CompetitiveTier: 21, RankedRating: 77 },
          },
        },
      },
    };
    expect(normalizeSeasonalPeak(raw)).toEqual({ peaktier: 21, peak_rr: 77 });
  });

  test("returns zeros when the seasonal map is absent or malformed", () => {
    expect(normalizeSeasonalPeak(null)).toEqual({ peaktier: 0, peak_rr: 0 });
    expect(normalizeSeasonalPeak({})).toEqual({ peaktier: 0, peak_rr: 0 });
    expect(normalizeSeasonalPeak({ QueueSkills: { competitive: {} } })).toEqual({
      peaktier: 0,
      peak_rr: 0,
    });
  });
});
