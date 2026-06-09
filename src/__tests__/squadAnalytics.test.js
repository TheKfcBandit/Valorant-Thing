import { describe, it, expect } from "vitest";
import { computeFitness } from "../squadAnalytics";

const FRIEND = "aaaa-bbbb";

function match({ won, withFriend = false, queueId = "competitive", dateMs = 0 }) {
  return {
    matchId: `m-${dateMs}-${won}`,
    dateMs,
    queueId,
    won,
    teammates: withFriend ? [{ puuid: FRIEND }] : [],
    enemies: [],
  };
}

describe("computeFitness", () => {
  it("returns {} for empty inputs", () => {
    expect(computeFitness([], [FRIEND])).toEqual({});
    expect(computeFitness(null, [FRIEND])).toEqual({});
    expect(computeFitness([match({ won: true })], [])).toEqual({});
  });

  it("omits friends who never appear in cached matches", () => {
    const out = computeFitness([match({ won: true })], [FRIEND]);
    expect(out[FRIEND]).toBeUndefined();
    expect(out._baseline.games).toBe(1);
  });

  it("scores above 50 for a friend you only win with", () => {
    const matches = [
      match({ won: true, withFriend: true, dateMs: 5 }),
      match({ won: true, withFriend: true, dateMs: 4 }),
      match({ won: true, withFriend: true, dateMs: 3 }),
      match({ won: false, dateMs: 2 }),
      match({ won: false, dateMs: 1 }),
    ];
    const out = computeFitness(matches, [FRIEND]);
    expect(out[FRIEND].games).toBe(3);
    expect(out[FRIEND].wins).toBe(3);
    expect(out[FRIEND].fitness).toBeGreaterThan(50);
    expect(out[FRIEND].soloDelta).toBeGreaterThan(0);
  });

  it("scores below 50 for a friend you only lose with", () => {
    const matches = [
      match({ won: false, withFriend: true, dateMs: 5 }),
      match({ won: false, withFriend: true, dateMs: 4 }),
      match({ won: true, dateMs: 3 }),
      match({ won: true, dateMs: 2 }),
    ];
    const out = computeFitness(matches, [FRIEND]);
    expect(out[FRIEND].fitness).toBeLessThan(50);
    expect(out[FRIEND].soloDelta).toBeLessThan(0);
  });

  it("treats friend puuids case-insensitively", () => {
    const matches = [match({ won: true, withFriend: true, dateMs: 1 })];
    const out = computeFitness(matches, [FRIEND.toUpperCase()]);
    expect(out[FRIEND]).toBeDefined();
    expect(out[FRIEND].games).toBe(1);
  });

  it("excludes non-ranked queues from both baseline and per-friend stats", () => {
    const matches = [
      match({ won: true, withFriend: true, queueId: "deathmatch", dateMs: 2 }),
      match({ won: false, withFriend: true, dateMs: 1 }),
    ];
    const out = computeFitness(matches, [FRIEND]);
    expect(out._baseline.games).toBe(1);
    expect(out[FRIEND].games).toBe(1);
    expect(out[FRIEND].wins).toBe(0);
  });
});
