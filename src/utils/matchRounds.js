// Per-round helpers for the match-details modal rebuild (#36).
//
// Field-name notes (verified against real cached payload at
// %APPDATA%\com.valorantthing.app\match-details-cache.json):
//
//   round.roundNum                              0-indexed
//   round.bombPlanter                           puuid (only if planted)
//   round.bombDefuser                           puuid (only if defused)
//   round.plantSite                             "A" | "B" | "C"
//   round.roundCeremony                         e.g. CeremonyAce / CeremonyClutch
//   round.playerStats[].subject                 player puuid
//   round.playerStats[].economy.loadoutValue    integer; total value of
//                                                what the player bought
//   round.playerStats[].kills[]                 kill events; weapon lives at
//                                                kills[i].finishingDamage.damageItem
//                                                (NOT kills[i].weapon — that's
//                                                a field the public schema
//                                                lists but the live payload
//                                                doesn't carry)
//   round.playerStats[].damage[]                { receiver, damage,
//                                                  headshots, bodyshots,
//                                                  legshots } — no weapon per
//                                                  damage entry, only per kill

/**
 * Aggregate the damage one player dealt across all opponents in one round.
 * @param {any} round
 * @param {string} puuid
 * @returns {{ given: number, headshots: number, bodyshots: number, legshots: number }}
 */
export function aggregateRoundDamage(round, puuid) {
  const out = { given: 0, headshots: 0, bodyshots: 0, legshots: 0 };
  const stats = (round?.playerStats || []).find((s) => s?.subject === puuid);
  if (!stats) return out;
  for (const d of stats.damage || []) {
    out.given += Number(d?.damage) || 0;
    out.headshots += Number(d?.headshots) || 0;
    out.bodyshots += Number(d?.bodyshots) || 0;
    out.legshots += Number(d?.legshots) || 0;
  }
  return out;
}

/**
 * Kill events one player landed in one round.
 * @param {any} round
 * @param {string} puuid
 * @returns {{ victim: string, weaponId: string, roundTimeMs: number,
 *             isSecondary: boolean, damageType: string }[]}
 */
export function getRoundKills(round, puuid) {
  const stats = (round?.playerStats || []).find((s) => s?.subject === puuid);
  if (!stats) return [];
  return (stats.kills || []).map((k) => ({
    victim: String(k?.victim || ""),
    weaponId: String(k?.finishingDamage?.damageItem || "").toLowerCase(),
    roundTimeMs: Number(k?.roundTime) || 0,
    isSecondary: Boolean(k?.finishingDamage?.isSecondaryFireMode),
    damageType: String(k?.finishingDamage?.damageType || "Weapon"),
  }));
}

/**
 * Every multi-kill (≥ 3K) by any player in this round. Each player counts
 * once even on a 5K (no 1+2+3+4+5 cumulative double-counting).
 * @param {any} round
 * @returns {{ puuid: string, killCount: number }[]}
 */
export function getRoundMultiKills(round) {
  const out = [];
  for (const stats of round?.playerStats || []) {
    const count = stats?.kills?.length || 0;
    if (count >= 3 && stats?.subject) {
      out.push({ puuid: String(stats.subject), killCount: count });
    }
  }
  return out;
}

/**
 * Bucket a per-team loadout-value average into the standard buy classes.
 * Pistol rounds (0, 12, 24 — `roundNum % 12 === 0`) skip the classifier
 * because everyone's loadout is forced low and the comparison doesn't
 * make sense. Caller renders a pistol-glyph instead of a buy pill.
 *
 * The input is teamRoundEconomy's PER-PLAYER average, so the brackets are
 * per-player too: a full-buy (rifle + heavy shield + util) values around
 * 3900; an SMG/light-shield force sits in the 2000s; saves stay under
 * ~2000. The original thresholds here were written for ×5 team totals
 * against the per-player average, which classified almost every real
 * round as "eco".
 *
 * @param {number} avgLoadoutValue   per-player average for one team
 * @param {number} roundNum    0-indexed
 * @returns {"pistol" | "eco" | "half-buy" | "full-buy"}
 */
export function classifyEconomy(avgLoadoutValue, roundNum) {
  if ((roundNum || 0) % 12 === 0) return "pistol";
  const v = Number(avgLoadoutValue) || 0;
  if (v < 2000) return "eco";
  if (v < 3900) return "half-buy";
  return "full-buy";
}

/**
 * Average loadoutValue across all players on a given team for one round.
 * `players` is the top-level match.players array (we need it to map
 * puuid → teamId; round.playerStats only carries subject + the per-round
 * fields). Returns 0 if no players matched, which the classifier maps
 * to "eco" — fine, because if the team is genuinely empty there's
 * nothing to classify anyway.
 *
 * @param {any} round
 * @param {string} teamId   case-insensitive ("Red" / "blue" / etc.)
 * @param {any[]} players
 * @returns {number}
 */
export function teamRoundEconomy(round, teamId, players) {
  const want = String(teamId || "").toLowerCase();
  const teamPuuids = new Set();
  for (const p of players || []) {
    if (p?.subject && String(p.teamId || "").toLowerCase() === want) {
      teamPuuids.add(p.subject);
    }
  }
  if (teamPuuids.size === 0) return 0;
  let total = 0;
  let n = 0;
  for (const stats of round?.playerStats || []) {
    if (!teamPuuids.has(stats?.subject)) continue;
    total += Number(stats?.economy?.loadoutValue) || 0;
    n += 1;
  }
  return n > 0 ? Math.round(total / n) : 0;
}
