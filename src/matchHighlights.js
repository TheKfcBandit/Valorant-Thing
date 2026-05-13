// Compute lightweight per-match personal badges from the summary fields
// returned by get_match_page / get_home_stats. Each badge is { id, label, color, hint }.
//
// Cross-player (MVP / Sharpshooter / Best Multi-Kill) badges require full
// match details; those land once Phase E (persistent match cache w/ full
// detail) is in place.

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
