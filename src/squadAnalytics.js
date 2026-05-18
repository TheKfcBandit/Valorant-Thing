// Pure analytics over the persistent match cache.
// `cachedMatches` is an array of match summaries with shape:
//   { matchId, dateMs, queueId, won, kills, deaths, assists,
//     teammates: [{puuid, agentId}], enemies: [{puuid, agentId}] }
//
// Returns a map keyed by friend puuid:
//   { puuid: { games, wins, soloDelta, recentWins, recentGames, fitness } }
// where `fitness` is a 0-100 score, and `soloDelta` is the percentage-point
// difference between your winrate WITH this friend and your overall winrate.

const RECENT_WINDOW = 10;

function isRanked(queueId = "") {
  const q = String(queueId).toLowerCase();
  return q === "competitive" || q === "unrated" || q === "swiftplay" || q === "premier";
}

export function computeFitness(cachedMatches, friendPuuids) {
  if (!Array.isArray(cachedMatches) || cachedMatches.length === 0) return {};
  const friends = new Set((friendPuuids || []).map((p) => String(p).toLowerCase()));
  if (friends.size === 0) return {};

  // Establish your overall ranked winrate baseline.
  const ranked = cachedMatches.filter((m) => isRanked(m.queueId));
  const baselineGames = ranked.length;
  const baselineWins = ranked.filter((m) => m.won).length;
  const baselineWR = baselineGames > 0 ? baselineWins / baselineGames : 0.5;

  // Aggregate per-friend stats.
  const out = {};
  const sortedByRecency = [...cachedMatches].sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));

  for (const m of sortedByRecency) {
    if (!isRanked(m.queueId)) continue;
    const mates = Array.isArray(m.teammates) ? m.teammates : [];
    for (const mate of mates) {
      const p = String(mate?.puuid || "").toLowerCase();
      if (!p || !friends.has(p)) continue;
      if (!out[p]) {
        out[p] = { puuid: p, games: 0, wins: 0, recentGames: 0, recentWins: 0 };
      }
      out[p].games += 1;
      if (m.won) out[p].wins += 1;
      if (out[p].recentGames < RECENT_WINDOW) {
        out[p].recentGames += 1;
        if (m.won) out[p].recentWins += 1;
      }
    }
  }

  // Score: combine sample size, co-play WR vs baseline, and recent trend.
  for (const p of Object.keys(out)) {
    const f = out[p];
    const wr = f.games > 0 ? f.wins / f.games : 0;
    const recentWR = f.recentGames > 0 ? f.recentWins / f.recentGames : wr;
    const soloDeltaPp = (wr - baselineWR) * 100;
    const recentDeltaPp = (recentWR - baselineWR) * 100;
    // Confidence factor — saturate after 8 games together.
    const confidence = Math.min(1, f.games / 8);
    // Centered around 50; +/- 50 for full +/- 50pp delta.
    const fitness = Math.max(
      0,
      Math.min(100, 50 + (soloDeltaPp * 0.6 + recentDeltaPp * 0.4) * confidence)
    );
    f.soloDelta = Number(soloDeltaPp.toFixed(1));
    f.recentDelta = Number(recentDeltaPp.toFixed(1));
    f.winrate = Number((wr * 100).toFixed(0));
    f.recentWinrate = Number((recentWR * 100).toFixed(0));
    f.fitness = Math.round(fitness);
  }

  out._baseline = {
    games: baselineGames,
    wins: baselineWins,
    winrate: Number((baselineWR * 100).toFixed(0)),
  };

  return out;
}
