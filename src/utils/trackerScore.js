// Solo TRN-style tracker score (#11). A single 0-100 number that
// blends K/D ratio and winrate over a player's ranked-queue history,
// with a confidence scaling so a 3-game sample doesn't yell "100".
//
// Data sources:
//   - Self: `match_history_aggregate` returns the pre-rolled
//     totals (games, wins, kills, deaths) — feed straight into
//     `computeTrackerScore({...})`. Single backend call.
//   - Friend: extract per-friend match list from the match-details
//     disk cache, then `aggregateMatches(list)` → same shape →
//     same `computeTrackerScore`.
//
// Future extensions (ACS / HS% / clutch) plug in as additional
// components in the weighted average — the existing breakdown shape
// is a stable contract for the UI.

const RANKED_QUEUES = new Set(["competitive", "unrated", "swiftplay", "premier"]);

// Minimum games before we surface any score at all. Below this,
// confidence === 0 and the UI should render a dash / hide the badge.
const MIN_GAMES = 10;
// At/above this game count, confidence is fully 1.
const FULL_CONFIDENCE_GAMES = 30;

const KD_WEIGHT = 0.5;
const WR_WEIGHT = 0.5;

function isRanked(queueId) {
  return RANKED_QUEUES.has(String(queueId || "").toLowerCase());
}

// Normalize K/D into 0-100. 1.0 KD → 50; 2.0+ KD → 100; 0.0 KD → 0.
function kdToScore(kd) {
  if (!Number.isFinite(kd) || kd < 0) return 0;
  return Math.max(0, Math.min(100, kd * 50));
}

// Winrate 0-1 → 0-100.
function wrToScore(wr) {
  if (!Number.isFinite(wr) || wr < 0) return 0;
  return Math.max(0, Math.min(100, wr * 100));
}

// Linear ramp from 0 at MIN_GAMES to 1 at FULL_CONFIDENCE_GAMES.
function confidenceFor(games) {
  if (games < MIN_GAMES) return 0;
  if (games >= FULL_CONFIDENCE_GAMES) return 1;
  return (games - MIN_GAMES) / (FULL_CONFIDENCE_GAMES - MIN_GAMES);
}

/**
 * Compute a TRN-style score from pre-aggregated totals.
 *
 * Returned shape is stable — UI consumers depend on it. The `score`
 * is null until games ≥ MIN_GAMES; render "—" or hide in that case.
 *
 * @param {{ games: number, wins: number, totalKills: number, totalDeaths: number }} agg
 * @returns {{
 *   score: number | null,
 *   confidence: number,
 *   games: number,
 *   breakdown: { kd: number, kdScore: number, winrate: number, wrScore: number },
 * }}
 */
export function computeTrackerScore(agg) {
  const games = Number(agg?.games) || 0;
  const wins = Number(agg?.wins) || 0;
  const totalKills = Number(agg?.totalKills) || 0;
  const totalDeaths = Number(agg?.totalDeaths) || 0;

  // Use max(1, deaths) so a 0-death sample doesn't infinity the K/D
  // and the score caps at 2.0 anyway. Real divide-by-zero protection.
  const kd = totalKills / Math.max(1, totalDeaths);
  const winrate = games > 0 ? wins / games : 0;

  const kdScore = kdToScore(kd);
  const wrScore = wrToScore(winrate);
  const composite = KD_WEIGHT * kdScore + WR_WEIGHT * wrScore;

  const confidence = confidenceFor(games);
  const score = confidence > 0 ? Math.round(composite) : null;

  return {
    score,
    confidence,
    games,
    breakdown: {
      kd: Number(kd.toFixed(2)),
      kdScore: Math.round(kdScore),
      winrate: Math.round(winrate * 100),
      wrScore: Math.round(wrScore),
    },
  };
}

/**
 * Roll a match list into the aggregate shape `computeTrackerScore`
 * expects. Filters non-ranked queues by default.
 *
 * @param {{ won: boolean, kills: number, deaths: number, queueId?: string }[]} matches
 * @param {{ queueFilter?: "all" | "ranked" }} [options]
 * @returns {{ games: number, wins: number, totalKills: number, totalDeaths: number }}
 */
export function aggregateMatches(matches, options = {}) {
  const queueFilter = options.queueFilter || "ranked";
  const list = Array.isArray(matches) ? matches : [];
  let games = 0;
  let wins = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  for (const m of list) {
    if (!m) continue;
    if (queueFilter === "ranked" && !isRanked(m.queueId)) continue;
    games += 1;
    if (m.won) wins += 1;
    totalKills += Number(m.kills) || 0;
    totalDeaths += Number(m.deaths) || 0;
  }
  return { games, wins, totalKills, totalDeaths };
}

// Pick a label tier for color/badging. Matches the threshold
// convention used by the existing fitness score in squadAnalytics
// so the two scores feel like part of the same family.
export function trackerScoreTier(score) {
  if (score == null) return "unknown";
  if (score >= 65) return "high";
  if (score <= 40) return "low";
  return "mid";
}
