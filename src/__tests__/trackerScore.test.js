import { describe, expect, test } from "vitest";
import { aggregateMatches, computeTrackerScore, trackerScoreTier } from "../utils/trackerScore";

const ranked = (won, kills, deaths) => ({
  won,
  kills,
  deaths,
  queueId: "competitive",
});

describe("computeTrackerScore", () => {
  test("returns null score below MIN_GAMES (10) — UI renders a dash", () => {
    const r = computeTrackerScore({ games: 5, wins: 4, totalKills: 80, totalDeaths: 40 });
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.games).toBe(5);
  });

  test("at MIN_GAMES exactly, confidence is 0 — score still null", () => {
    const r = computeTrackerScore({ games: 10, wins: 10, totalKills: 200, totalDeaths: 100 });
    expect(r.confidence).toBe(0);
    expect(r.score).toBeNull();
  });

  test("at FULL_CONFIDENCE_GAMES, perfect K/D + WR maxes at 100", () => {
    const r = computeTrackerScore({ games: 30, wins: 30, totalKills: 600, totalDeaths: 300 });
    // K/D 2.0 → 100; WR 100% → 100; weighted 0.5/0.5 → 100.
    expect(r.score).toBe(100);
    expect(r.confidence).toBe(1);
  });

  test("low K/D + low WR scores low", () => {
    const r = computeTrackerScore({ games: 30, wins: 0, totalKills: 300, totalDeaths: 600 });
    // K/D 0.5 → 25; WR 0 → 0; weighted → 12.5 → 13.
    expect(r.score).toBe(13);
  });

  test("breakdown surfaces raw K/D + WR for tooltips", () => {
    const r = computeTrackerScore({ games: 30, wins: 10, totalKills: 400, totalDeaths: 500 });
    expect(r.breakdown.kd).toBe(0.8);
    expect(r.breakdown.winrate).toBe(33);
  });

  test("zero deaths does not divide-by-zero", () => {
    const r = computeTrackerScore({ games: 30, wins: 30, totalKills: 100, totalDeaths: 0 });
    // K/D = 100/1 = 100 → clamped via the 2.0 ceiling → kdScore 100.
    expect(r.score).toBe(100);
    expect(Number.isFinite(r.breakdown.kd)).toBe(true);
  });

  test("empty / null input is safe", () => {
    expect(computeTrackerScore({}).score).toBeNull();
    expect(computeTrackerScore(null).games).toBe(0);
    expect(computeTrackerScore(undefined).games).toBe(0);
  });
});

describe("aggregateMatches", () => {
  test("rolls a match list into totals", () => {
    const list = [ranked(true, 20, 10), ranked(false, 15, 22), ranked(true, 25, 14)];
    expect(aggregateMatches(list)).toEqual({
      games: 3,
      wins: 2,
      totalKills: 60,
      totalDeaths: 46,
    });
  });

  test("filters non-ranked queues by default", () => {
    const list = [ranked(true, 20, 10), { won: true, kills: 99, deaths: 1, queueId: "deathmatch" }];
    expect(aggregateMatches(list)).toEqual({
      games: 1,
      wins: 1,
      totalKills: 20,
      totalDeaths: 10,
    });
  });

  test("queueFilter=all includes everything", () => {
    const list = [ranked(true, 20, 10), { won: true, kills: 30, deaths: 5, queueId: "deathmatch" }];
    expect(aggregateMatches(list, { queueFilter: "all" }).games).toBe(2);
  });

  test("safe on garbage input", () => {
    expect(aggregateMatches(null).games).toBe(0);
    expect(aggregateMatches(undefined).games).toBe(0);
    expect(aggregateMatches([null, undefined, { won: true }]).games).toBe(0);
  });
});

describe("trackerScoreTier", () => {
  test("buckets match the fitness-score convention", () => {
    expect(trackerScoreTier(80)).toBe("high");
    expect(trackerScoreTier(65)).toBe("high");
    expect(trackerScoreTier(50)).toBe("mid");
    expect(trackerScoreTier(41)).toBe("mid");
    expect(trackerScoreTier(40)).toBe("low");
    expect(trackerScoreTier(0)).toBe("low");
  });

  test("null score → unknown", () => {
    expect(trackerScoreTier(null)).toBe("unknown");
    expect(trackerScoreTier(undefined)).toBe("unknown");
  });
});

describe("end-to-end: aggregateMatches + computeTrackerScore", () => {
  test("aggregate from list then score gives same result as direct-aggregate", () => {
    const list = Array.from({ length: 30 }, () => ranked(true, 20, 10));
    const agg = aggregateMatches(list);
    const r = computeTrackerScore(agg);
    expect(r.score).toBe(100);
    expect(r.games).toBe(30);
  });
});
