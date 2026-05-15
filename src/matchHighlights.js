// Compute lightweight per-match personal badges from the summary fields
// returned by get_match_page / get_home_stats. Each badge is { id, label, color, hint }.
//
// Cross-player badges (MVP / Sharpshooter / Best Multi-Kill) live in
// computeScoreboardBadges below — they consume the full match-details
// response and key results by player puuid.

const ESCALATION_QUEUES = new Set(["ggteam", "dodgeball"]);
const DEATHMATCH_QUEUES = new Set(["deathmatch"]);

export function computeHighlights(match) {
  if (!match) return [];

  const queue = String(match.queueId || "").toLowerCase();
  const k = Number(match.kills) || 0;
  const d = Number(match.deaths) || 0;
  const a = Number(match.assists) || 0;
  const rw = Number(match.roundsWon) || 0;
  const rl = Number(match.roundsLost) || 0;
  const won = Boolean(match.won);
  const totalRounds = rw + rl;

  const out = [];

  // Deathmatch has different scaling.
  if (DEATHMATCH_QUEUES.has(queue)) {
    if (k >= 40) out.push({ id: "dm-w", label: "DM Champ", color: "text-yellow-400", hint: "40+ kills" });
    else if (k >= 30) out.push({ id: "dm-strong", label: "Sharpshooter", color: "text-accent-blue", hint: "30+ kills" });
    return out;
  }

  // Escalation / TDM / other modes — kill thresholds only.
  if (ESCALATION_QUEUES.has(queue)) {
    if (k >= 30) out.push({ id: "carry", label: "Carried", color: "text-yellow-400", hint: "30+ kills" });
    return out;
  }

  // Standard rounds-based modes (competitive, unrated, swiftplay, premier, spikerush).
  // Use total-rounds to scale thresholds (Swiftplay/Spike Rush are shorter).
  const isShort = queue === "swiftplay" || queue === "spikerush";

  // Triggerman — raw kill volume.
  if (k >= (isShort ? 14 : 25)) {
    out.push({ id: "trigger", label: "Triggerman", color: "text-yellow-400", hint: `${k} kills` });
  }

  // Untouchable — low deaths.
  if (totalRounds >= 9 && d <= (isShort ? 5 : 9)) {
    out.push({ id: "untouchable", label: "Untouchable", color: "text-accent-blue", hint: `only ${d} deaths` });
  }

  // High KDA.
  const kda = d > 0 ? (k + a) / d : k + a;
  if (kda >= 2.5 && totalRounds >= 9) {
    out.push({ id: "kda", label: "High KDA", color: "text-green-400", hint: `${kda.toFixed(1)} KDA` });
  }

  // Carried — kills exceed your team's round wins (unusual ratio).
  if (rw > 0 && k >= rw + 4 && won) {
    out.push({ id: "carry", label: "Carried", color: "text-yellow-400", hint: `${k}K with ${rw} rounds` });
  }

  // Team Player — heavy assist contribution.
  if (a >= (isShort ? 6 : 10) && a > k * 0.5) {
    out.push({ id: "team", label: "Team Player", color: "text-accent-blue", hint: `${a} assists` });
  }

  // Clutch Win — won a tight game with positive KDA.
  if (won && totalRounds >= 9 && Math.abs(rw - rl) <= 2 && k > d) {
    out.push({ id: "clutch", label: "Clutch Win", color: "text-green-400", hint: `${rw}-${rl}` });
  }

  // Cap at 2 to avoid clutter.
  return out.slice(0, 2);
}

// Cross-player badges for the scoreboard inside MatchDetailsModal. Returns
// Map<puuid, Badge[]>. Single-winner only — no badge awarded on ties, to
// avoid littering the board. Skips modes where the team / round structure
// doesn't carry the data (deathmatch / escalation / TDM).
//
// MVP: highest stats.score across all players.
// Sharpshooter: highest HS% among players with >= 40 hits (filters noise
//   from a single lucky pistol-round headshot).
// Best Multi-Kill: highest single-round kill count, must be >= 3 (a 3K).
const MIN_SHOTS_FOR_HS = 40;
const MIN_MULTIKILL = 3;

export function computeScoreboardBadges(details) {
  const out = new Map();
  if (!details) return out;
  const players = Array.isArray(details.players) ? details.players : [];
  const teams = Array.isArray(details.teams) ? details.teams : [];
  if (players.length === 0) return out;

  // Skip team-less modes (deathmatch etc.) — same heuristic as the modal.
  const teamIds = new Set(players.map(p => String(p.teamId || "").toLowerCase()));
  if (teams.length < 2 || teamIds.size < 2) return out;

  const add = (puuid, badge) => {
    if (!puuid) return;
    const cur = out.get(puuid) || [];
    cur.push(badge);
    out.set(puuid, cur);
  };

  // MVP — top score, no-tie rule.
  let topScore = -1;
  let topScoreCount = 0;
  let topScorePuuid = null;
  for (const p of players) {
    const s = p.stats?.score || 0;
    if (s > topScore) { topScore = s; topScoreCount = 1; topScorePuuid = p.subject; }
    else if (s === topScore) { topScoreCount += 1; }
  }
  if (topScoreCount === 1 && topScorePuuid) {
    add(topScorePuuid, { id: "mvp", label: "MVP", color: "text-yellow-400", hint: `${topScore} score` });
  }

  // Aggregate per-puuid stats from roundResults (Sharpshooter + Multi-Kill).
  const agg = new Map(); // puuid -> { hs, body, leg, maxKills }
  const rounds = Array.isArray(details.roundResults) ? details.roundResults : [];
  for (const r of rounds) {
    const ps = Array.isArray(r.playerStats) ? r.playerStats : [];
    for (const stat of ps) {
      const puuid = stat.subject;
      if (!puuid) continue;
      const entry = agg.get(puuid) || { hs: 0, body: 0, leg: 0, maxKills: 0 };
      const dmg = Array.isArray(stat.damage) ? stat.damage : [];
      for (const d of dmg) {
        entry.hs += Number(d.headshots) || 0;
        entry.body += Number(d.bodyshots) || 0;
        entry.leg += Number(d.legshots) || 0;
      }
      const kCount = Array.isArray(stat.kills) ? stat.kills.length : 0;
      if (kCount > entry.maxKills) entry.maxKills = kCount;
      agg.set(puuid, entry);
    }
  }

  // Sharpshooter — top HS% among eligible.
  let topPct = -1;
  let topPctCount = 0;
  let topPctPuuid = null;
  let topPctVal = 0;
  for (const [puuid, e] of agg) {
    const total = e.hs + e.body + e.leg;
    if (total < MIN_SHOTS_FOR_HS) continue;
    const pct = e.hs / total;
    if (pct > topPct) { topPct = pct; topPctCount = 1; topPctPuuid = puuid; topPctVal = pct; }
    else if (pct === topPct) { topPctCount += 1; }
  }
  if (topPctCount === 1 && topPctPuuid) {
    add(topPctPuuid, { id: "sharp", label: "Sharpshooter", color: "text-accent-blue", hint: `${Math.round(topPctVal * 100)}% HS` });
  }

  // Best Multi-Kill — highest single-round kill count, must be >= MIN_MULTIKILL.
  let topMulti = MIN_MULTIKILL - 1; // start below threshold so anything ≥3 wins
  let topMultiCount = 0;
  let topMultiPuuid = null;
  for (const [puuid, e] of agg) {
    if (e.maxKills > topMulti) { topMulti = e.maxKills; topMultiCount = 1; topMultiPuuid = puuid; }
    else if (e.maxKills === topMulti && topMulti >= MIN_MULTIKILL) { topMultiCount += 1; }
  }
  if (topMultiCount === 1 && topMultiPuuid && topMulti >= MIN_MULTIKILL) {
    add(topMultiPuuid, { id: "multi", label: "Best Multi-Kill", color: "text-green-400", hint: `${topMulti}K in one round` });
  }

  return out;
}
