import { describe, expect, test } from "vitest";
import {
  aggregateRoundDamage,
  classifyEconomy,
  getRoundKills,
  getRoundMultiKills,
  teamRoundEconomy,
} from "../utils/matchRounds";

// Minimal fixture that mirrors the real cached payload shape (verified
// against %APPDATA%\com.valorantthing.app\match-details-cache.json).
const sampleRound = (overrides = {}) => ({
  roundNum: 5,
  bombPlanter: null,
  bombDefuser: null,
  plantSite: "",
  roundCeremony: "CeremonyDefault",
  playerStats: [
    {
      subject: "alice",
      economy: { loadoutValue: 4800 },
      kills: [
        {
          victim: "enemy1",
          roundTime: 11480,
          finishingDamage: {
            damageItem: "vandal-uuid",
            damageType: "Weapon",
            isSecondaryFireMode: false,
          },
        },
        {
          victim: "enemy2",
          roundTime: 23000,
          finishingDamage: { damageItem: "knife-uuid", damageType: "Melee" },
        },
      ],
      damage: [
        { receiver: "enemy1", damage: 156, headshots: 1, bodyshots: 1, legshots: 0 },
        { receiver: "enemy2", damage: 80, headshots: 0, bodyshots: 1, legshots: 1 },
      ],
    },
    {
      subject: "bob",
      economy: { loadoutValue: 1150 },
      kills: [],
      damage: [],
    },
  ],
  ...overrides,
});

describe("aggregateRoundDamage", () => {
  test("sums damage, hs, body, leg across all damage entries for one player", () => {
    expect(aggregateRoundDamage(sampleRound(), "alice")).toEqual({
      given: 236,
      headshots: 1,
      bodyshots: 2,
      legshots: 1,
    });
  });

  test("unknown player yields zeros", () => {
    expect(aggregateRoundDamage(sampleRound(), "nobody")).toEqual({
      given: 0,
      headshots: 0,
      bodyshots: 0,
      legshots: 0,
    });
  });

  test("tolerates missing playerStats array", () => {
    expect(aggregateRoundDamage({}, "alice").given).toBe(0);
    expect(aggregateRoundDamage(null, "alice").given).toBe(0);
  });

  test("tolerates missing damage array on a player", () => {
    expect(aggregateRoundDamage(sampleRound(), "bob").given).toBe(0);
  });
});

describe("getRoundKills", () => {
  test("reads weapon from kills[].finishingDamage.damageItem and lowercases", () => {
    const kills = getRoundKills(sampleRound(), "alice");
    expect(kills).toHaveLength(2);
    expect(kills[0].weaponId).toBe("vandal-uuid");
    expect(kills[0].victim).toBe("enemy1");
    expect(kills[0].roundTimeMs).toBe(11480);
    expect(kills[0].isSecondary).toBe(false);
    expect(kills[0].damageType).toBe("Weapon");
  });

  test("preserves damageType for ability / knife kills", () => {
    const kills = getRoundKills(sampleRound(), "alice");
    expect(kills[1].damageType).toBe("Melee");
  });

  test("unknown player yields empty list", () => {
    expect(getRoundKills(sampleRound(), "nobody")).toEqual([]);
  });

  test("missing kills array yields empty list", () => {
    expect(getRoundKills(sampleRound(), "bob")).toEqual([]);
  });
});

describe("getRoundMultiKills", () => {
  const aceRound = sampleRound({
    playerStats: [
      {
        subject: "ace-getter",
        kills: [1, 2, 3, 4, 5].map((i) => ({ victim: `e${i}` })),
      },
      { subject: "duo-only", kills: [1, 2].map((i) => ({ victim: `e${i}` })) },
      { subject: "triple", kills: [1, 2, 3].map((i) => ({ victim: `e${i}` })) },
      { subject: "no-kills", kills: [] },
    ],
  });

  test("returns every player with ≥3 kills, with exact count", () => {
    const mks = getRoundMultiKills(aceRound);
    expect(mks).toEqual([
      { puuid: "ace-getter", killCount: 5 },
      { puuid: "triple", killCount: 3 },
    ]);
  });

  test("a 5K counts as ONE entry, not 1+2+3+4+5", () => {
    const mks = getRoundMultiKills(aceRound);
    const ace = mks.filter((m) => m.puuid === "ace-getter");
    expect(ace).toHaveLength(1);
    expect(ace[0].killCount).toBe(5);
  });

  test("no multi-kills returns empty list", () => {
    expect(getRoundMultiKills(sampleRound())).toEqual([]);
  });

  test("empty / missing playerStats safe", () => {
    expect(getRoundMultiKills({})).toEqual([]);
    expect(getRoundMultiKills(null)).toEqual([]);
  });
});

describe("classifyEconomy", () => {
  test("round 0 (first half pistol) → pistol", () => {
    expect(classifyEconomy(900, 0)).toBe("pistol");
  });

  test("round 12 (second half pistol) → pistol", () => {
    expect(classifyEconomy(950, 12)).toBe("pistol");
  });

  test("round 24 (OT pistol) → pistol", () => {
    expect(classifyEconomy(700, 24)).toBe("pistol");
  });

  // Brackets are PER-PLAYER averages (what teamRoundEconomy returns):
  // a save sits under ~2000, an SMG force in the 2000s-3000s, and a
  // rifle + heavy shield + util full buy lands around 3900+.
  test("save-round avg → eco", () => {
    expect(classifyEconomy(800, 5)).toBe("eco");
    expect(classifyEconomy(1999, 5)).toBe("eco");
  });

  test("force-buy avg → half-buy", () => {
    expect(classifyEconomy(2000, 5)).toBe("half-buy");
    expect(classifyEconomy(2900, 5)).toBe("half-buy");
    expect(classifyEconomy(3899, 5)).toBe("half-buy");
  });

  test("full-buy avg → full-buy", () => {
    expect(classifyEconomy(3900, 5)).toBe("full-buy");
    expect(classifyEconomy(4700, 14)).toBe("full-buy");
  });

  test("missing avg defaults to 0 → eco (for non-pistol)", () => {
    expect(classifyEconomy(undefined, 5)).toBe("eco");
    expect(classifyEconomy(null, 5)).toBe("eco");
  });
});

describe("teamRoundEconomy", () => {
  const players = [
    { subject: "alice", teamId: "Blue" },
    { subject: "bob", teamId: "Blue" },
    { subject: "carol", teamId: "Red" },
  ];

  test("averages loadoutValue across players on the given team only", () => {
    // alice 4800, bob 1150 → avg 2975
    expect(teamRoundEconomy(sampleRound(), "Blue", players)).toBe(2975);
  });

  test("is case-insensitive on teamId", () => {
    expect(teamRoundEconomy(sampleRound(), "blue", players)).toBe(2975);
    expect(teamRoundEconomy(sampleRound(), "BLUE", players)).toBe(2975);
  });

  test("missing team yields 0", () => {
    expect(teamRoundEconomy(sampleRound(), "ghost", players)).toBe(0);
  });

  test("empty players list yields 0", () => {
    expect(teamRoundEconomy(sampleRound(), "Blue", [])).toBe(0);
  });

  test("missing economy on a player counts as 0, divisor still includes them", () => {
    const round = sampleRound({
      playerStats: [
        { subject: "alice", economy: { loadoutValue: 4000 } },
        { subject: "bob", economy: null },
      ],
    });
    // alice 4000, bob 0 → avg 2000
    expect(teamRoundEconomy(round, "Blue", players)).toBe(2000);
  });
});
