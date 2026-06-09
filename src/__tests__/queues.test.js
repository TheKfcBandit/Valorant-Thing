import { describe, it, expect } from "vitest";
import { ALL_QUEUES, PARTY_QUEUES, RANKED_QUEUES, isRanked } from "../utils/queues";

describe("isRanked", () => {
  it("matches exactly the RANKED_QUEUES set", () => {
    for (const q of RANKED_QUEUES) {
      expect(isRanked(q)).toBe(true);
    }
    expect(isRanked("deathmatch")).toBe(false);
    expect(isRanked("ggteam")).toBe(false);
    expect(isRanked("skirmish2v2")).toBe(false);
  });

  it("is case-insensitive and survives bad input", () => {
    expect(isRanked("Competitive")).toBe(true);
    expect(isRanked("SWIFTPLAY")).toBe(true);
    expect(isRanked(null)).toBe(false);
    expect(isRanked(undefined)).toBe(false);
    expect(isRanked("")).toBe(false);
  });
});

describe("queue lists", () => {
  it("ALL_QUEUES ids are unique", () => {
    const ids = ALL_QUEUES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every PARTY_QUEUE is also in ALL_QUEUES with the same label", () => {
    const byId = new Map(ALL_QUEUES.map((q) => [q.id, q.label]));
    for (const q of PARTY_QUEUES) {
      expect(byId.has(q.id)).toBe(true);
      expect(byId.get(q.id)).toBe(q.label);
    }
  });

  it("every entry has a non-empty id and label", () => {
    for (const q of [...ALL_QUEUES, ...PARTY_QUEUES]) {
      expect(typeof q.id).toBe("string");
      expect(q.id.length).toBeGreaterThan(0);
      expect(typeof q.label).toBe("string");
      expect(q.label.length).toBeGreaterThan(0);
    }
  });
});
