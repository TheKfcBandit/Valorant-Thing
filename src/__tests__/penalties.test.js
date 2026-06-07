import { describe, expect, test } from "vitest";
import { normalizePenaltiesResponse, normalizePenalty } from "../riotShapes";
import { formatTimeRemaining, getPenaltyLabel } from "../utils/penalties";

describe("normalizePenalty", () => {
  test("uppercases type so unknown casing still matches the label map", () => {
    expect(normalizePenalty({ Type: "dodge" }).type).toBe("DODGE");
    expect(normalizePenalty({ Type: "Restriction" }).type).toBe("RESTRICTION");
  });

  test("lowercases queueId so MODE_NAMES keys match", () => {
    expect(normalizePenalty({ QueueID: "Competitive" }).queueId).toBe("competitive");
  });

  test("falls back to camelCase keys when PascalCase is absent", () => {
    const n = normalizePenalty({ id: "abc", queueId: "unrated", rrPenalty: 6 });
    expect(n.id).toBe("abc");
    expect(n.queueId).toBe("unrated");
    expect(n.rrPenalty).toBe(6);
  });

  test("rrPenalty defaults to 0", () => {
    expect(normalizePenalty({}).rrPenalty).toBe(0);
  });

  test("Expiry ISO parses to epoch ms; bad shape yields null", () => {
    const ms = normalizePenalty({ Expiry: "2026-06-07T12:00:00Z" }).expiryMs;
    expect(typeof ms).toBe("number");
    expect(ms).toBeGreaterThan(0);
    expect(normalizePenalty({ Expiry: "garbage" }).expiryMs).toBeNull();
    expect(normalizePenalty({}).expiryMs).toBeNull();
  });

  test("tolerates fully empty input without crashing", () => {
    const n = normalizePenalty(undefined);
    expect(n).toEqual({
      id: "",
      type: "",
      queueId: "",
      rrPenalty: 0,
      expiryMs: null,
    });
  });
});

describe("normalizePenaltiesResponse", () => {
  test("empty payload yields empty array", () => {
    expect(normalizePenaltiesResponse({}).penalties).toEqual([]);
    expect(normalizePenaltiesResponse(null).penalties).toEqual([]);
  });

  test("array of mixed shapes is normalized in order", () => {
    const raw = {
      Penalties: [
        { Type: "DODGE", Expiry: "2026-06-07T12:00:00Z", QueueID: "competitive" },
        { Type: "CHAT_BANNED", RankedRatingPenalty: 0 },
      ],
    };
    const { penalties } = normalizePenaltiesResponse(raw);
    expect(penalties).toHaveLength(2);
    expect(penalties[0].type).toBe("DODGE");
    expect(penalties[0].queueId).toBe("competitive");
    expect(penalties[1].type).toBe("CHAT_BANNED");
  });
});

describe("getPenaltyLabel", () => {
  test("known types map to friendly labels", () => {
    expect(getPenaltyLabel("DODGE")).toBe("Queue dodge");
    expect(getPenaltyLabel("DODGE_DELAY")).toBe("Queue dodge");
    expect(getPenaltyLabel("QUEUE_DODGE")).toBe("Queue dodge");
    expect(getPenaltyLabel("RESTRICTION")).toBe("Restriction");
    expect(getPenaltyLabel("CHAT_BANNED")).toBe("Chat ban");
    expect(getPenaltyLabel("TEXT_BANNED")).toBe("Chat ban");
  });

  test("unknown type becomes title-cased rather than raw", () => {
    expect(getPenaltyLabel("LEAVER_COMP_PENALTY_V2")).toBe("Leaver Comp Penalty V2");
    expect(getPenaltyLabel("FUTURE_ENUM")).toBe("Future Enum");
  });

  test("empty / missing type falls back to generic Restriction", () => {
    expect(getPenaltyLabel("")).toBe("Restriction");
    expect(getPenaltyLabel(undefined)).toBe("Restriction");
    expect(getPenaltyLabel(null)).toBe("Restriction");
  });

  test("case-insensitive on input", () => {
    expect(getPenaltyLabel("dodge")).toBe("Queue dodge");
  });
});

describe("formatTimeRemaining", () => {
  // All times are relative to an injected `now` so the assertions are stable.
  const NOW = 1_780_000_000_000;

  test("future ≥ 1 day rounds down to whole days", () => {
    expect(formatTimeRemaining(NOW + 25 * 60 * 60 * 1000, NOW)).toBe("1d");
    expect(formatTimeRemaining(NOW + 72 * 60 * 60 * 1000, NOW)).toBe("3d");
  });

  test("future ≥ 1 hour but < 1 day rounds to whole hours", () => {
    expect(formatTimeRemaining(NOW + 90 * 60 * 1000, NOW)).toBe("1h");
    expect(formatTimeRemaining(NOW + 5 * 60 * 60 * 1000, NOW)).toBe("5h");
  });

  test("under an hour rounds to whole minutes", () => {
    expect(formatTimeRemaining(NOW + 5 * 60 * 1000, NOW)).toBe("5m");
    expect(formatTimeRemaining(NOW + 30 * 1000, NOW)).toBe("0m");
  });

  test("already past expiry says expiring", () => {
    expect(formatTimeRemaining(NOW - 1000, NOW)).toBe("expiring");
  });

  test("null expiry yields empty string (caller hides the line)", () => {
    expect(formatTimeRemaining(null, NOW)).toBe("");
    expect(formatTimeRemaining(undefined, NOW)).toBe("");
  });
});
