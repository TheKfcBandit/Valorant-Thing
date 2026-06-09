import { describe, it, expect } from "vitest";
import { computeHighlights, computeScoreboardBadges } from "../matchHighlights";

const ids = (badges) => badges.map((b) => b.id);

describe("computeHighlights", () => {
  it("returns empty for null / missing match", () => {
    expect(computeHighlights(null)).toEqual([]);
    expect(computeHighlights(undefined)).toEqual([]);
  });

  it("returns nothing for an unremarkable competitive game", () => {
    const m = {
      queueId: "competitive",
      kills: 12,
      deaths: 14,
      assists: 4,
      roundsWon: 9,
      roundsLost: 13,
      won: false,
    };
    expect(computeHighlights(m)).toEqual([]);
  });

  it("deathmatch uses kill thresholds and ignores round rules", () => {
    expect(ids(computeHighlights({ queueId: "deathmatch", kills: 41 }))).toEqual(["dm-w"]);
    expect(ids(computeHighlights({ queueId: "deathmatch", kills: 33 }))).toEqual(["dm-strong"]);
    expect(computeHighlights({ queueId: "deathmatch", kills: 12 })).toEqual([]);
  });

  it("escalation only awards Carried at 30+ kills", () => {
    expect(ids(computeHighlights({ queueId: "ggteam", kills: 31 }))).toEqual(["carry"]);
    expect(computeHighlights({ queueId: "ggteam", kills: 29 })).toEqual([]);
  });

  it("skirmish modes never award standard badges", () => {
    const m = {
      queueId: "skirmish2v2",
      kills: 30,
      deaths: 0,
      assists: 10,
      roundsWon: 5,
      roundsLost: 4,
      won: true,
    };
    expect(computeHighlights(m)).toEqual([]);
  });

  it("Triggerman threshold scales down for short modes", () => {
    const base = { deaths: 20, assists: 0, roundsWon: 4, roundsLost: 5, won: false };
    expect(ids(computeHighlights({ ...base, queueId: "swiftplay", kills: 14 }))).toContain(
      "trigger"
    );
    expect(ids(computeHighlights({ ...base, queueId: "competitive", kills: 14 }))).not.toContain(
      "trigger"
    );
  });

  it("Untouchable requires at least 9 total rounds", () => {
    const low = { queueId: "competitive", kills: 5, deaths: 3, assists: 1, won: false };
    expect(ids(computeHighlights({ ...low, roundsWon: 4, roundsLost: 4 }))).not.toContain(
      "untouchable"
    );
    expect(ids(computeHighlights({ ...low, roundsWon: 5, roundsLost: 4 }))).toContain(
      "untouchable"
    );
  });

  it("caps standard-mode output at two badges", () => {
    // 30K / 2D / 20A win in a tight 13-11: qualifies for trigger,
    // untouchable, kda, carry, team — must come back as exactly 2.
    const m = {
      queueId: "competitive",
      kills: 30,
      deaths: 2,
      assists: 20,
      roundsWon: 13,
      roundsLost: 11,
      won: true,
    };
    expect(computeHighlights(m)).toHaveLength(2);
  });
});

// Minimal match-details fixture: two teams, three players, two rounds of
// playerStats with damage + kills arrays.
function detailsFixture() {
  const dmg = (hs, body, leg) => [{ headshots: hs, bodyshots: body, legshots: leg }];
  return {
    players: [
      { subject: "p1", teamId: "Blue", stats: { score: 9000 } },
      { subject: "p2", teamId: "Blue", stats: { score: 5000 } },
      { subject: "p3", teamId: "Red", stats: { score: 7000 } },
    ],
    teams: [{ teamId: "Blue" }, { teamId: "Red" }],
    roundResults: [
      {
        playerStats: [
          { subject: "p1", damage: dmg(30, 20, 0), kills: [{}, {}, {}, {}] },
          { subject: "p2", damage: dmg(5, 40, 5), kills: [{}] },
          { subject: "p3", damage: dmg(10, 40, 0), kills: [{}, {}] },
        ],
      },
      {
        playerStats: [
          { subject: "p1", damage: dmg(10, 10, 0), kills: [{}] },
          { subject: "p2", damage: dmg(0, 10, 0), kills: [] },
          { subject: "p3", damage: dmg(20, 20, 0), kills: [{}, {}, {}] },
        ],
      },
    ],
  };
}

describe("computeScoreboardBadges", () => {
  it("returns an empty map for null or empty details", () => {
    expect(computeScoreboardBadges(null).size).toBe(0);
    expect(computeScoreboardBadges({}).size).toBe(0);
  });

  it("skips team-less modes (single team id)", () => {
    const d = detailsFixture();
    d.players.forEach((p) => (p.teamId = "Blue"));
    d.teams = [{ teamId: "Blue" }];
    expect(computeScoreboardBadges(d).size).toBe(0);
  });

  it("awards MVP to the unique top scorer", () => {
    const badges = computeScoreboardBadges(detailsFixture());
    expect(ids(badges.get("p1") || [])).toContain("mvp");
    expect(ids(badges.get("p3") || [])).not.toContain("mvp");
  });

  it("withholds MVP on a score tie", () => {
    const d = detailsFixture();
    d.players[2].stats.score = 9000;
    const badges = computeScoreboardBadges(d);
    for (const list of badges.values()) {
      expect(ids(list)).not.toContain("mvp");
    }
  });

  it("awards Sharpshooter to the top HS% among players with enough hits", () => {
    const badges = computeScoreboardBadges(detailsFixture());
    // p1: 40 HS / 70 hits = 57%; p3: 30/90 = 33%; p2: 5/60 = 8%.
    expect(ids(badges.get("p1") || [])).toContain("sharp");
  });

  it("ignores players under the minimum hit count for Sharpshooter", () => {
    const d = detailsFixture();
    // p2 gets 100% HS but on only 6 hits — must not beat p1.
    d.roundResults[0].playerStats[1].damage = [{ headshots: 3, bodyshots: 0, legshots: 0 }];
    d.roundResults[1].playerStats[1].damage = [{ headshots: 3, bodyshots: 0, legshots: 0 }];
    const badges = computeScoreboardBadges(d);
    expect(ids(badges.get("p1") || [])).toContain("sharp");
    expect(ids(badges.get("p2") || [])).not.toContain("sharp");
  });

  it("awards Best Multi-Kill only at 3K or better, single winner", () => {
    const badges = computeScoreboardBadges(detailsFixture());
    // p1 had a 4K round, p3 a 3K round — p1 wins outright.
    expect(ids(badges.get("p1") || [])).toContain("multi");
    expect(ids(badges.get("p3") || [])).not.toContain("multi");
  });

  it("withholds Best Multi-Kill when nobody reaches a 3K", () => {
    const d = detailsFixture();
    for (const r of d.roundResults) {
      for (const ps of r.playerStats) ps.kills = [{}, {}];
    }
    const badges = computeScoreboardBadges(d);
    for (const list of badges.values()) {
      expect(ids(list)).not.toContain("multi");
    }
  });
});
