import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

const AGENTS_URL = "https://valorant-api.com/v1/agents?isPlayableCharacter=true";
const MAPS_URL = "https://valorant-api.com/v1/maps";

function isCompetitiveQueue(q) {
  const s = String(q || "").toLowerCase();
  return s === "competitive" || s === "unrated" || s === "swiftplay" || s === "premier";
}

function approxMatchSeconds(m) {
  // Rough estimate: round-based matches average ~35min, deathmatch ~6min, escalation ~10min.
  const q = String(m.queueId || "").toLowerCase();
  if (q === "deathmatch") return 6 * 60;
  if (q === "ggteam" || q === "dodgeball" || q === "hurm") return 10 * 60;
  const rounds = (Number(m.roundsWon) || 0) + (Number(m.roundsLost) || 0);
  if (rounds <= 0) return 30 * 60;
  // ~80s per round avg.
  return Math.min(rounds * 80, 60 * 60);
}

function summarize(matches) {
  const agentCounts = {};
  const mapStats = {}; // mapId -> { games, wins }
  let totalKills = 0, totalDeaths = 0, totalAssists = 0, totalSeconds = 0;
  let mvpCount = 0; // proxy: matches with kills >= 1.5 * roundsWon (rough)
  let longestWinStreak = 0, currentWinStreak = 0;
  let longestLossStreak = 0, currentLossStreak = 0;
  const byDate = [...matches].sort((a, b) => (a.dateMs || 0) - (b.dateMs || 0));

  for (const m of byDate) {
    if (m.agent) agentCounts[m.agent] = (agentCounts[m.agent] || 0) + 1;
    if (m.map) {
      const e = mapStats[m.map] || { games: 0, wins: 0 };
      e.games += 1;
      if (m.won) e.wins += 1;
      mapStats[m.map] = e;
    }
    totalKills += Number(m.kills) || 0;
    totalDeaths += Number(m.deaths) || 0;
    totalAssists += Number(m.assists) || 0;
    totalSeconds += approxMatchSeconds(m);

    const rw = Number(m.roundsWon) || 0;
    if (rw > 0 && (Number(m.kills) || 0) >= rw * 1.5) mvpCount += 1;

    if (isCompetitiveQueue(m.queueId)) {
      if (m.won) {
        currentWinStreak += 1; currentLossStreak = 0;
        if (currentWinStreak > longestWinStreak) longestWinStreak = currentWinStreak;
      } else {
        currentLossStreak += 1; currentWinStreak = 0;
        if (currentLossStreak > longestLossStreak) longestLossStreak = currentLossStreak;
      }
    }
  }

  const topAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0];
  const mapList = Object.entries(mapStats).filter(([_, v]) => v.games >= 3);
  const bestMap = mapList.sort((a, b) => (b[1].wins / b[1].games) - (a[1].wins / a[1].games))[0];
  const worstMap = mapList.sort((a, b) => (a[1].wins / a[1].games) - (b[1].wins / b[1].games))[0];
  const agentDiversity = Object.keys(agentCounts).length;

  return {
    totalMatches: matches.length,
    totalKills, totalDeaths, totalAssists,
    totalHours: Math.round(totalSeconds / 360) / 10,
    topAgentId: topAgent?.[0] || null,
    topAgentGames: topAgent?.[1] || 0,
    bestMapId: bestMap?.[0] || null,
    bestMapWR: bestMap ? Math.round((bestMap[1].wins / bestMap[1].games) * 100) : 0,
    worstMapId: worstMap?.[0] || null,
    worstMapWR: worstMap ? Math.round((worstMap[1].wins / worstMap[1].games) * 100) : 0,
    agentDiversity,
    mvpCount,
    longestWinStreak,
    longestLossStreak,
  };
}

export default function WrappedPage({ connected }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentLookup, setAgentLookup] = useState({});
  const [mapLookup, setMapLookup] = useState({});

  useEffect(() => {
    fetch(AGENTS_URL).then(r => r.json()).then(d => {
      const map = {};
      for (const a of d.data || []) map[a.uuid.toLowerCase()] = a;
      setAgentLookup(map);
    }).catch(() => {});
    fetch(MAPS_URL).then(r => r.json()).then(d => {
      const map = {};
      for (const m of d.data || []) {
        if (m.mapUrl) map[m.mapUrl.split("/").pop()] = m;
      }
      setMapLookup(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await invoke("match_history_list", { limit: 1000 });
        if (!cancelled) setMatches(res?.matches || []);
      } catch (e) {
        console.warn("[Wrapped] history fetch failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => summarize(matches), [matches]);
  const topAgent = summary.topAgentId ? agentLookup[summary.topAgentId.toLowerCase()] : null;
  const bestMap = summary.bestMapId ? mapLookup[summary.bestMapId] : null;
  const worstMap = summary.worstMapId ? mapLookup[summary.worstMapId] : null;

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        Connect to Valorant to view your stats.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading your story...
      </div>
    );
  }

  if (summary.totalMatches === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-text-primary font-display text-lg">No matches yet</p>
          <p className="text-text-muted text-sm mt-2">Play a few games — your Wrapped will fill in as we cache match data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 gap-4">
      <header>
        <h1 className="text-2xl font-display font-bold text-text-primary">Your Wrapped</h1>
        <p className="text-xs text-text-muted">Computed from {summary.totalMatches} cached matches</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card label="Most-played agent" delay={0}>
          {topAgent && (
            <div className="flex items-center gap-3">
              {topAgent.displayIcon && <img src={topAgent.displayIcon} className="w-12 h-12 rounded-full border border-border" />}
              <div>
                <p className="text-lg font-display font-bold text-text-primary">{topAgent.displayName}</p>
                <p className="text-xs text-text-muted">{summary.topAgentGames} games</p>
              </div>
            </div>
          )}
        </Card>

        <Card label="Best map" delay={0.05}>
          <p className="text-lg font-display font-bold text-green-400">{bestMap?.displayName || summary.bestMapId || "—"}</p>
          <p className="text-xs text-text-muted">{summary.bestMapWR}% winrate</p>
        </Card>

        <Card label="Worst map" delay={0.1}>
          <p className="text-lg font-display font-bold text-red-400">{worstMap?.displayName || summary.worstMapId || "—"}</p>
          <p className="text-xs text-text-muted">{summary.worstMapWR}% winrate</p>
        </Card>

        <Card label="Total kills" delay={0.15}>
          <p className="text-2xl font-display font-bold text-text-primary tabular-nums">{summary.totalKills.toLocaleString()}</p>
          <p className="text-xs text-text-muted">{summary.totalAssists.toLocaleString()} assists · {summary.totalDeaths.toLocaleString()} deaths</p>
        </Card>

        <Card label="Hours played" delay={0.2}>
          <p className="text-2xl font-display font-bold text-text-primary tabular-nums">{summary.totalHours}</p>
          <p className="text-xs text-text-muted">approx — based on round counts</p>
        </Card>

        <Card label="Agent diversity" delay={0.25}>
          <p className="text-2xl font-display font-bold text-text-primary tabular-nums">{summary.agentDiversity}</p>
          <p className="text-xs text-text-muted">distinct agents played</p>
        </Card>

        <Card label="Win streak" delay={0.3}>
          <p className="text-2xl font-display font-bold text-green-400 tabular-nums">{summary.longestWinStreak}</p>
          <p className="text-xs text-text-muted">longest comp streak</p>
        </Card>

        <Card label="Loss streak" delay={0.35}>
          <p className="text-2xl font-display font-bold text-red-400 tabular-nums">{summary.longestLossStreak}</p>
          <p className="text-xs text-text-muted">longest tilt run</p>
        </Card>

        <Card label="Carry games" delay={0.4}>
          <p className="text-2xl font-display font-bold text-yellow-400 tabular-nums">{summary.mvpCount}</p>
          <p className="text-xs text-text-muted">kills ≥ 1.5× round wins</p>
        </Card>
      </div>
    </div>
  );
}

function Card({ label, children, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay }}
      className="rounded-xl border border-border bg-base-700/60 p-4"
    >
      <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">{label}</p>
      {children}
    </motion.div>
  );
}
