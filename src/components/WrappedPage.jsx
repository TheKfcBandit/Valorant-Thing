import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };

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
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted mx-auto">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <p className="text-sm font-display text-text-muted">Waiting for Valorant</p>
          <p className="text-[11px] font-body text-text-muted/60">Open Valorant to see your wrapped stats</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg className="animate-spin h-8 w-8 mx-auto text-text-muted" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-sm font-display text-text-muted">Loading your story</p>
          <p className="text-[11px] font-body text-text-muted/60">Reading cached match history</p>
        </div>
      </div>
    );
  }

  if (summary.totalMatches === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted mx-auto">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
          <p className="text-sm font-display text-text-muted">No matches yet</p>
          <p className="text-[11px] font-body text-text-muted/60">Play a few games — your Wrapped will fill in as the cache grows</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: noAnim() ? 0 : 0.04 } } }}
      className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-3"
    >
      <header>
        <h1 className="text-2xl font-display font-bold text-text-primary">Your Wrapped</h1>
        <p className="text-xs text-text-muted">Computed from {summary.totalMatches} cached matches</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card label="Most-played agent">
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

        <Card label="Best map">
          <p className="text-lg font-display font-bold text-green-400">{bestMap?.displayName || summary.bestMapId || "—"}</p>
          <p className="text-xs text-text-muted">{summary.bestMapWR}% winrate</p>
        </Card>

        <Card label="Worst map">
          <p className="text-lg font-display font-bold text-red-400">{worstMap?.displayName || summary.worstMapId || "—"}</p>
          <p className="text-xs text-text-muted">{summary.worstMapWR}% winrate</p>
        </Card>

        <Card label="Total kills">
          <p className="text-2xl font-display font-bold text-text-primary tabular-nums">{summary.totalKills.toLocaleString()}</p>
          <p className="text-xs text-text-muted">{summary.totalAssists.toLocaleString()} assists · {summary.totalDeaths.toLocaleString()} deaths</p>
        </Card>

        <Card label="Hours played">
          <p className="text-2xl font-display font-bold text-text-primary tabular-nums">{summary.totalHours}</p>
          <p className="text-xs text-text-muted">approx — based on round counts</p>
        </Card>

        <Card label="Agent diversity">
          <p className="text-2xl font-display font-bold text-text-primary tabular-nums">{summary.agentDiversity}</p>
          <p className="text-xs text-text-muted">distinct agents played</p>
        </Card>

        <Card label="Win streak">
          <p className="text-2xl font-display font-bold text-green-400 tabular-nums">{summary.longestWinStreak}</p>
          <p className="text-xs text-text-muted">longest comp streak</p>
        </Card>

        <Card label="Loss streak">
          <p className="text-2xl font-display font-bold text-red-400 tabular-nums">{summary.longestLossStreak}</p>
          <p className="text-xs text-text-muted">longest tilt run</p>
        </Card>

        <Card label="Carry games">
          <p className="text-2xl font-display font-bold text-yellow-400 tabular-nums">{summary.mvpCount}</p>
          <p className="text-xs text-text-muted">kills ≥ 1.5× round wins</p>
        </Card>
      </div>
    </motion.div>
  );
}

function Card({ label, children }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl border border-border bg-base-700/60 p-4"
    >
      <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">{label}</p>
      {children}
    </motion.div>
  );
}
