import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { computeHighlights } from "../matchHighlights";
import { noAnim, T0 } from "../utils/animation";
import { MODE_NAMES } from "../utils/gameMode";
import { rankIcon, rankName } from "../utils/rank";
import { normalizePenaltiesResponse, normalizeRrEntry } from "../riotShapes";
import { formatTimeRemaining, getPenaltyLabel } from "../utils/penalties";
import { computeTrackerScore, trackerScoreTier } from "../utils/trackerScore";
import { useAsyncEffect } from "../hooks/useAsyncEffect";
import { formatError } from "../utils/authError";
import { Label } from "./ui/Label";
import { getAgentLookup } from "../valApiSkins";
import { customAgentIconByUuid } from "../utils/agents";
import { formatTimer } from "../utils/format";
import { getMapMetadataByUrl } from "../utils/maps";
import { AlertTriangle, Clock, RefreshCcw, WifiSlash } from "../icons";
import { MatchDetailsModal } from "./home/MatchDetailsModal";

const REFRESH_INTERVAL = 5 * 60 * 1000;

// Matches Riot's natural per-call cap on `/match-history`. Larger windows
// don't return more entries, smaller ones just multiply round trips.
const PAGE_SIZE = 20;

export default function HomePage({ connected, player, playerIsStale, refreshKey, onRefresh }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(REFRESH_INTERVAL);
  const [maps, setMaps] = useState({});
  const [agentNames, setAgentNames] = useState({});
  const [matches, setMatches] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreInRiot, setHasMoreInRiot] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Next Riot page to ask for in loadMore. fetchMatches always takes 0, so
  // we start at 1. Monotonic across filter changes since Riot's history is
  // global, not filter-specific. Fixes the "math from DB total" bug where
  // overlap or filtered scarcity made the same page refetch forever.
  const [nextRiotPage, setNextRiotPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [queueFilter, setQueueFilter] = useState("all");
  const [availableQueues, setAvailableQueues] = useState([]);
  const [aggregate, setAggregate] = useState(null);
  // #11: competitive-only aggregate piped into the Tracker Score card.
  // Kept separate from the queue-filtered `aggregate` above so the card
  // stays consistent with Current Rank / Peak Rank (also competitive-only)
  // regardless of which queue the user is filtering match history by.
  const [compAggregate, setCompAggregate] = useState(null);
  const [penalties, setPenalties] = useState([]);
  const [spend, setSpend] = useState(null);
  const [rrHistory, setRrHistory] = useState(null);
  const [openMatch, setOpenMatch] = useState(null);
  const lastFetchRef = useRef(0);
  const lastAutoRefresh = useRef(0);

  useEffect(() => {
    getMapMetadataByUrl().then(setMaps);
    getAgentLookup()
      .then((lookup) => {
        const names = {};
        for (const [id, a] of Object.entries(lookup)) {
          if (a?.displayName) names[id] = a.displayName;
        }
        setAgentNames(names);
      })
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke("get_home_stats", { queueFilter: "competitive" });
      const parsed = JSON.parse(raw);
      if (!parsed.level && !parsed.currentTier && !parsed.totalGames) {
        throw new Error("Empty stats returned — token may be stale");
      }
      setStats(parsed);
      lastFetchRef.current = Date.now();
      setTimeLeft(REFRESH_INTERVAL);
    } catch (e) {
      setError(formatError(e, "Failed to load stats"));
      if (Date.now() - lastAutoRefresh.current > 30000) {
        lastAutoRefresh.current = Date.now();
        onRefresh?.();
      }
    }
    setLoading(false);
  }, [connected, onRefresh]);

  // Read the current visible window from the SQLite cache. Always re-reads
  // from disk so we get the latest after any insert. The queue filter is
  // applied here; load-more grows `visibleCount` and re-runs.
  const reloadVisible = useCallback(async (count, queue) => {
    try {
      const res = await invoke("match_history_list", {
        limit: count,
        offset: 0,
        queueId: queue === "all" ? null : queue,
      });
      const list = res?.matches || [];
      setMatches(list);
      return list.length;
    } catch (e) {
      console.warn("[History] DB list failed:", e);
      return 0;
    }
  }, []);

  // Live refresh from Riot: pull page 0 (newest), ingest into DB, re-read
  // the visible window. Called when `connected` flips and on every periodic
  // refresh tick. Doesn't paginate backward — that's loadMore's job.
  const fetchMatches = useCallback(
    async (retry = false) => {
      if (!connected) return;
      setMatchLoading(true);
      try {
        const raw = await invoke("get_match_page", { page: 0, pageSize: PAGE_SIZE });
        const data = JSON.parse(raw);
        const list = (data.matches || []).filter((m) => m && m.matchId);
        if (list.length === 0 && !retry) {
          setTimeout(() => fetchMatches(true), 3000);
          return;
        }
        if (list.length > 0) {
          try {
            await invoke("match_history_put_many", { entries: list });
          } catch (e) {
            console.warn("[History] DB put failed:", e);
          }
        }
        await reloadVisible(visibleCount, queueFilter);
      } catch {
        if (!retry) {
          setTimeout(() => fetchMatches(true), 3000);
          return;
        }
      }
      setMatchLoading(false);
    },
    [connected, visibleCount, queueFilter, reloadVisible]
  );

  // Load older matches: try DB first (cheap), and if DB is exhausted AND
  // Riot might still have more, fetch the next Riot page and ingest.
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setLoadError(false);
    const nextCount = visibleCount + PAGE_SIZE;
    const returned = await reloadVisible(nextCount, queueFilter);
    setVisibleCount(nextCount);

    if (returned < nextCount && hasMoreInRiot && connected) {
      try {
        const raw = await invoke("get_match_page", {
          page: nextRiotPage,
          pageSize: PAGE_SIZE,
        });
        const data = JSON.parse(raw);
        const newer = (data.matches || []).filter((m) => m && m.matchId);
        setNextRiotPage((p) => p + 1);
        if (newer.length === 0) {
          setHasMoreInRiot(false);
        } else {
          await invoke("match_history_put_many", { entries: newer });
          if (newer.length < PAGE_SIZE) setHasMoreInRiot(false);
          await reloadVisible(nextCount, queueFilter);
        }
      } catch (e) {
        console.warn("[History] loadMore from Riot failed:", e);
        setLoadError(true);
      }
    }
    setLoadingMore(false);
  }, [
    loadingMore,
    visibleCount,
    queueFilter,
    hasMoreInRiot,
    connected,
    nextRiotPage,
    reloadVisible,
  ]);

  // Populate the queue filter dropdown from whatever queues we've seen so
  // far. Runs on mount and after each successful Riot fetch.
  useEffect(() => {
    invoke("match_history_distinct_queues")
      .then((qs) => Array.isArray(qs) && setAvailableQueues(qs))
      .catch((e) => console.warn("[History] distinct queues failed:", e));
  }, [matchLoading]);

  // Read DB → matches on mount and on filter change. Replaces the old
  // separate useAsyncEffect seed (this covers cache-render-before-connect).
  // Resets visible window AND hasMoreInRiot — switching filters must
  // un-latch the "End of history" flag so the user can keep paging.
  // Also bumps nextRiotPage so legacy users (with cached pages from the
  // old 3-page backfill) don't refetch already-cached pages on Load More.
  // Max preserves monotonic-forward across filter switches.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setHasMoreInRiot(true);
    setLoadError(false);
    reloadVisible(PAGE_SIZE, queueFilter);
    invoke("match_history_stats")
      .then((s) => setNextRiotPage((p) => Math.max(p, Math.floor((s?.total ?? 0) / PAGE_SIZE))))
      .catch(() => {});
  }, [queueFilter, reloadVisible]);

  // Aggregate stats panel — clear stale data first so the panel hides
  // (via the `overall?.games > 0` guard) until the new query lands.
  useEffect(() => {
    setAggregate(null);
    invoke("match_history_aggregate", {
      queueId: queueFilter === "all" ? null : queueFilter,
      limit: 500,
    })
      .then(setAggregate)
      .catch((e) => console.warn("[History] aggregate failed:", e));
  }, [queueFilter, matchLoading]);

  // #11: separate competitive-only pull for the Tracker Score card so the
  // score sits next to Current Rank as a stable solo-MMR indicator. Pulled
  // off the same SQLite aggregate the panel below uses; same 500-row window.
  // Gated on matchLoading === false so the boolean flipping true→false each
  // refresh fires the aggregate query exactly once per cycle (after the
  // SQLite write has actually landed), not twice.
  useEffect(() => {
    if (matchLoading) return;
    invoke("match_history_aggregate", { queueId: "competitive", limit: 500 })
      .then(setCompAggregate)
      .catch((e) => console.warn("[History] comp aggregate failed:", e));
  }, [matchLoading]);

  // Same pattern as the match-history seed above — render the RR chart from
  // cache before login so reopening the app shows a trend immediately.
  useAsyncEffect(async (isCancelled) => {
    try {
      const res = await invoke("rr_history_list", { limit: 50 });
      const cached = Array.isArray(res?.matches) ? res.matches : [];
      if (!isCancelled() && cached.length > 0) {
        setRrHistory(cached.map(normalizeRrEntry));
      }
    } catch (e) {
      console.warn("[RR] cache load failed:", e);
    }
  }, []);

  const fetchPenalties = useCallback(async () => {
    if (!connected) return;
    try {
      const raw = await invoke("get_penalties");
      const { penalties: list } = normalizePenaltiesResponse(JSON.parse(raw));
      setPenalties(list);
    } catch (e) {
      // Endpoint may 404 on accounts with no record; treat as empty but log so
      // a stale-token failure isn't completely invisible.
      console.warn("[Penalties] fetch failed (treating as no penalties):", e);
      setPenalties([]);
    }
  }, [connected]);

  const fetchSpend = useCallback(async () => {
    if (!connected) return;
    try {
      const summary = await invoke("get_spend_summary");
      setSpend(summary);
    } catch (e) {
      console.warn("[Spend] summary failed:", e);
    }
  }, [connected]);

  const fetchRrHistory = useCallback(async () => {
    if (!connected) return;
    try {
      const raw = await invoke("get_rr_history", { start: 0, end: 20 });
      const json = JSON.parse(raw);
      // The backend cache stores raw PascalCase entries (it keys on
      // `MatchID`), so we filter and put the raw shape — normalization
      // happens when we read for display, below.
      const rawMatches = Array.isArray(json?.Matches) ? json.Matches : [];
      const usable = rawMatches.filter((m) => (m?.TierAfterUpdate || 0) > 0);
      try {
        await invoke("rr_history_put_many", { entries: usable });
      } catch (e) {
        console.warn("[RR] cache put failed:", e);
      }
    } catch (e) {
      console.warn("[RR] history fetch failed:", e);
    }
    // Render from cache regardless of whether the API call succeeded — the
    // cache is the source of truth for the chart, the API just refreshes the
    // head of the window.
    try {
      const res = await invoke("rr_history_list", { limit: 50 });
      const rawList = Array.isArray(res?.matches) ? res.matches : [];
      setRrHistory(rawList.map(normalizeRrEntry));
    } catch (e) {
      console.warn("[RR] cache list failed:", e);
    }
  }, [connected]);

  useEffect(() => {
    if (connected) {
      fetchStats();
      fetchMatches();
      fetchPenalties();
      fetchSpend();
      fetchRrHistory();
    }
  }, [connected, refreshKey]);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - lastFetchRef.current;
      const remaining = REFRESH_INTERVAL - elapsed;
      if (remaining <= 0) {
        fetchStats();
        fetchMatches();
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [connected, fetchStats, fetchMatches]);

  // #11: TRN-style solo score. Built from the competitive-only aggregate;
  // null score = not enough games yet (UI renders a dash + "play more" copy).
  // Lives BEFORE the early-return below so the hook is called unconditionally.
  const trackerScore = useMemo(() => {
    const o = compAggregate?.overall;
    if (!o) return null;
    return computeTrackerScore({
      games: o.games || 0,
      wins: o.wins || 0,
      totalKills: o.kills || 0,
      totalDeaths: o.deaths || 0,
    });
  }, [compAggregate]);

  // Phase A of #18: when not connected but we have cached identity, render the
  // page anyway with a stale "Offline" badge. The Waiting splash only shows
  // for users who have NEVER connected (no cached identity).
  if (!connected && !player) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <WifiSlash />
          <p className="text-sm font-display text-text-muted">Waiting for Valorant</p>
          <p className="text-[11px] font-body text-text-muted/60">
            Open Valorant and it will connect automatically
          </p>
        </div>
      </div>
    );
  }
  const showOfflineBadge = playerIsStale;

  const cardSmall = stats?.cardId
    ? `https://media.valorant-api.com/playercards/${stats.cardId}/smallart.png`
    : player?.player_card_url;
  const cardWide = stats?.cardId
    ? `https://media.valorant-api.com/playercards/${stats.cardId}/wideart.png`
    : null;
  const level = stats?.level || 0;
  const gameName = player?.game_name || "Player";
  const gameTag = player?.game_tag || "0000";

  const currentTier = stats?.currentTier || 0;
  const currentRR = stats?.currentRR || 0;
  const peakTier = stats?.peakTier || 0;
  const wins = stats?.wins || 0;
  const losses = stats?.losses || 0;
  const totalPlayed = wins + losses;
  const winRate = totalPlayed > 0 ? Math.round((wins / totalPlayed) * 100) : 0;
  const totalGames = stats?.totalGames || 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="relative h-36 shrink-0 overflow-hidden">
        {cardWide && (
          <img src={cardWide} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-base-900/95 via-base-900/60 to-base-900/30" />

        <div className="absolute top-3 right-3 flex items-center gap-2">
          {showOfflineBadge && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/20 backdrop-blur-sm border border-yellow-500/40"
              title={`Last seen on ${new Date(player.saved_at_ms).toLocaleString()} (cached)`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
              <span className="text-[10px] font-display font-semibold text-yellow-400 uppercase tracking-wider">
                Offline
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/40 backdrop-blur-sm">
            <Clock size={10} className="text-text-muted" />
            <span className="text-[10px] font-mono text-text-muted tabular-nums">
              {formatTimer(timeLeft)}
            </span>
          </div>
          <button
            onClick={() => {
              fetchStats();
              fetchMatches();
            }}
            disabled={loading}
            className="p-1.5 rounded-md bg-black/40 backdrop-blur-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="absolute bottom-3 left-4 flex items-end gap-3">
          {cardSmall && (
            <img
              src={cardSmall}
              alt=""
              className="w-14 h-14 rounded-lg border border-white/10 shadow-lg object-cover"
            />
          )}
          <div className="pb-0.5">
            <div className="flex items-baseline gap-0.5">
              <span className="text-lg font-display font-bold text-white drop-shadow-md">
                {gameName}
              </span>
              <span className="text-xs font-display text-white/50">#{gameTag}</span>
            </div>
            <p className="text-xs font-body text-white/40">Level {level}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="px-3 py-2 rounded-lg bg-status-red/10 border border-status-red/20 text-xs font-body text-status-red">
            {error}
          </div>
        )}

        {loading && !stats && (
          <div className="grid grid-cols-4 gap-3 animate-pulse">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-base-700 border border-border space-y-2">
                <div className="h-2.5 w-16 rounded bg-base-600" />
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-base-600" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-20 rounded bg-base-600" />
                    <div className="h-3 w-12 rounded bg-base-600" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {stats && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
            className="grid grid-cols-4 gap-3"
          >
            <StatCard label="Current Rank" loading={loading}>
              <div className="flex items-center gap-2.5">
                <img src={rankIcon(currentTier)} alt="" className="w-10 h-10" />
                <div>
                  <p className="text-base font-display font-bold text-text-primary leading-tight">
                    {rankName(currentTier)}
                  </p>
                  <p className="text-xs font-body text-text-muted">{currentRR} RR</p>
                </div>
              </div>
            </StatCard>

            <StatCard label="Peak Rank" loading={loading}>
              <div className="flex items-center gap-2.5">
                <img src={rankIcon(peakTier)} alt="" className="w-10 h-10" />
                <p className="text-base font-display font-bold text-text-primary">
                  {rankName(peakTier)}
                </p>
              </div>
            </StatCard>

            <StatCard label="Win Rate" loading={loading}>
              <p
                className="text-xl font-display font-bold text-text-primary"
                title={`${totalGames} total competitive games`}
              >
                {winRate}%
              </p>
              <p className="text-xs font-body text-text-muted">
                {wins}W / {losses}L · {totalGames}g
              </p>
            </StatCard>

            <TrackerScoreCard score={trackerScore} loading={loading} />
          </motion.div>
        )}

        {rrHistory && rrHistory.length >= 2 && <RRChart matches={rrHistory} />}

        {spend && (spend.thisMonthVp > 0 || spend.vpSpent > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={noAnim() ? T0 : { duration: 0.2 }}
            className="rounded-xl border border-border bg-base-700/60 p-3"
            title={
              spend.trackingSinceMs
                ? `Tracking since ${new Date(spend.trackingSinceMs).toLocaleDateString()}`
                : ""
            }
          >
            <div className="flex items-center justify-between">
              <div>
                <Label>Spent (last 30 days)</Label>
                <p className="text-base font-display font-bold text-text-primary tabular-nums mt-0.5">
                  {Number(spend.thisMonthVp || 0).toLocaleString()}{" "}
                  <span className="text-xs text-text-muted">VP</span>
                  {spend.thisMonthRp > 0 && (
                    <span className="ml-2">
                      {Number(spend.thisMonthRp).toLocaleString()}{" "}
                      <span className="text-xs text-text-muted">RP</span>
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-display text-text-muted uppercase tracking-wider">
                  All-time
                </p>
                <p className="text-xs font-mono text-text-secondary tabular-nums mt-0.5">
                  {Number(spend.vpSpent || 0).toLocaleString()} VP
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {penalties.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={noAnim() ? T0 : { duration: 0.2 }}
            className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow-400" />
              <p className="text-xs font-display font-bold text-yellow-400 uppercase tracking-wider">
                Account Status
              </p>
            </div>
            <div className="space-y-1">
              {penalties.map((p, idx) => {
                const remainingText = formatTimeRemaining(p.expiryMs);
                const label = getPenaltyLabel(p.type);
                const queueLabel = p.queueId ? MODE_NAMES[p.queueId] || p.queueId : "";
                const meta = [queueLabel, p.rrPenalty > 0 ? `${p.rrPenalty} RR` : null].filter(
                  Boolean
                );
                return (
                  <div
                    key={p.id || idx}
                    className="flex items-center justify-between gap-2 text-[11px] font-body"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-text-primary">{label}</span>
                      {meta.length > 0 && (
                        <span className="text-text-muted"> · {meta.join(" · ")}</span>
                      )}
                    </div>
                    {remainingText && (
                      <span className="text-yellow-400 tabular-nums shrink-0">{remainingText}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {aggregate && aggregate.overall?.games > 0 && (
          <AggregatePanels aggregate={aggregate} maps={maps} agentNames={agentNames} />
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-xs font-display font-semibold text-text-primary uppercase tracking-wider">
            Match History
          </h3>
          {availableQueues.length > 1 && (
            <select
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              className="text-[11px] font-body bg-base-700 border border-border rounded px-2 py-1 text-text-secondary focus:outline-none focus:border-text-muted"
              aria-label="Filter by queue"
            >
              <option value="all">All queues</option>
              {availableQueues.map((q) => (
                <option key={q} value={q}>
                  {MODE_NAMES[q] || (q ? q.charAt(0).toUpperCase() + q.slice(1) : "Custom")}
                </option>
              ))}
            </select>
          )}
        </div>

        {matchLoading && !matches && (
          <div className="space-y-1.5 animate-pulse">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-base-700 border border-border flex items-center px-3 gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-base-600 shrink-0" />
                <div className="w-14 space-y-1">
                  <div className="h-2.5 w-12 rounded bg-base-600" />
                  <div className="h-3 w-8 rounded bg-base-600" />
                </div>
                <div className="h-3 w-16 rounded bg-base-600" />
                <div className="ml-auto space-y-1 text-right">
                  <div className="h-3 w-20 rounded bg-base-600" />
                  <div className="h-2.5 w-12 rounded bg-base-600 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={`space-y-1.5 ${matchLoading ? "opacity-60 pointer-events-none" : ""}`}>
          {(matches || []).map((m, i) => {
            const delay = Math.min(i * 0.03, 0.5);
            const mapData = maps[m.map];
            const mapName = mapData?.name || m.map;
            const mapImg = mapData?.listIcon || mapData?.splash;
            const agentIcon = m.agent
              ? customAgentIconByUuid(m.agent) ||
                `https://media.valorant-api.com/agents/${m.agent}/displayicon.png`
              : null;
            const kdaVal = m.deaths > 0 ? ((m.kills + m.assists) / m.deaths).toFixed(1) : null;
            const kdaText = kdaVal ? `${kdaVal} KDA` : "Perfect KDA";

            const q = m.queueId || "";
            const modeName =
              MODE_NAMES[q] || (q ? q.charAt(0).toUpperCase() + q.slice(1) : "Custom");
            const isDeathmatch = q === "deathmatch";
            const isEscalation = q === "ggteam" || q === "dodgeball";

            let resultText, resultColor, borderColor;
            if (isDeathmatch) {
              const dmWon = m.kills >= 40;
              resultText = dmWon ? "VICTORY" : "DEFEAT";
              resultColor = dmWon ? "text-green-400" : "text-red-400";
              borderColor = dmWon ? "border-green-500/20" : "border-red-500/20";
            } else if (isEscalation) {
              resultText = m.won ? "VICTORY" : "DEFEAT";
              resultColor = m.won ? "text-green-400" : "text-red-400";
              borderColor = m.won ? "border-green-500/20" : "border-red-500/20";
            } else {
              const draw = m.roundsWon === m.roundsLost && m.roundsWon === 0;
              const realDraw = !draw && m.roundsWon === m.roundsLost;
              if (draw) {
                resultText = "REMAKE";
                resultColor = "text-text-muted";
                borderColor = "border-text-muted/20";
              } else if (realDraw) {
                resultText = "DRAW";
                resultColor = "text-text-muted";
                borderColor = "border-text-muted/20";
              } else if (m.won) {
                resultText = "VICTORY";
                resultColor = "text-green-400";
                borderColor = "border-green-500/20";
              } else {
                resultText = "DEFEAT";
                resultColor = "text-red-400";
                borderColor = "border-red-500/20";
              }
            }

            const clickable = !!m.matchId;
            return (
              <motion.div
                key={m.matchId || `idx-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={noAnim() ? T0 : { duration: 0.2, delay }}
                onClick={clickable ? () => setOpenMatch(m) : undefined}
                className={`relative rounded-lg overflow-hidden border ${borderColor} h-14 group ${clickable ? "cursor-pointer hover:border-text-muted/40 transition-colors" : ""}`}
              >
                {mapImg && (
                  <img
                    src={mapImg}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-base-900/90 via-base-900/70 to-base-900/50" />

                <div className="relative h-full flex items-center px-3 gap-3">
                  {agentIcon && (
                    <img
                      src={agentIcon}
                      alt=""
                      className="w-8 h-8 rounded-full border border-white/10 shrink-0"
                    />
                  )}

                  <div className="w-16 shrink-0">
                    <p
                      className={`text-[10px] font-display font-bold uppercase tracking-wide ${resultColor}`}
                    >
                      {resultText}
                    </p>
                    <p className="text-xs font-mono text-text-muted">
                      {isDeathmatch || isEscalation
                        ? `${m.kills} kills`
                        : `${m.roundsWon}-${m.roundsLost}`}
                    </p>
                  </div>

                  <div className="w-20 shrink-0">
                    <p className="text-xs font-display font-medium text-text-primary">{mapName}</p>
                    <p className="text-[9px] font-body text-text-muted/60">{modeName}</p>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                    {computeHighlights(m).map((b) => (
                      <span
                        key={b.id}
                        title={b.hint}
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-display font-bold uppercase tracking-wider border border-current/30 bg-base-700/40 ${b.color}`}
                      >
                        {b.label}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 ml-auto">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-0.5 text-xs font-mono">
                        <span className="text-text-primary font-semibold">{m.kills}</span>
                        <span className="text-text-muted">/</span>
                        <span className="text-red-400 font-semibold">{m.deaths}</span>
                        <span className="text-text-muted">/</span>
                        <span className="text-text-muted">{m.assists}</span>
                      </div>
                      <p className="text-[10px] font-mono text-text-muted">{kdaText}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {matches && matches.length > 0 && (
            <div className="pt-2 flex items-center justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore || (!hasMoreInRiot && (matches?.length || 0) < visibleCount)}
                className={`text-[11px] font-display font-semibold tracking-wider uppercase px-3 py-1.5 rounded-md bg-base-700 hover:bg-base-600 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${loadError ? "border-red-500/40 text-red-400 hover:text-red-300" : "border-border text-text-secondary hover:text-text-primary"}`}
              >
                {loadingMore
                  ? "Loading…"
                  : loadError
                    ? "Load failed — click to retry"
                    : !hasMoreInRiot && (matches?.length || 0) < visibleCount
                      ? "End of history"
                      : `Load more (${matches?.length || 0} shown)`}
              </button>
            </div>
          )}
        </div>
      </div>
      {openMatch && (
        <MatchDetailsModal
          match={openMatch}
          maps={maps}
          selfPuuid={player?.puuid}
          selfName={player?.game_name}
          selfTag={player?.game_tag}
          onClose={() => setOpenMatch(null)}
        />
      )}
    </div>
  );
}

// #11: TRN-style 0-100 score. Replaces the old Total Games card — that
// number now lives in the Win Rate card's subtext, freeing a slot for a
// more interesting at-a-glance metric. Color tier matches the fitness
// score convention used in PartyPage's invite list.
function TrackerScoreCard({ score, loading }) {
  const tier = trackerScoreTier(score?.score);
  const colorClass =
    tier === "high"
      ? "text-green-400"
      : tier === "low"
        ? "text-red-400"
        : tier === "mid"
          ? "text-text-primary"
          : "text-text-muted/50";
  const display = score?.score == null ? "—" : score.score;
  const hint = score
    ? score.score == null
      ? `Need ${10 - score.games} more competitive game${10 - score.games === 1 ? "" : "s"}`
      : `${score.breakdown.kd} K/D · ${score.breakdown.winrate}% WR · ${score.games}g${
          score.confidence < 1 ? ` (low confidence)` : ""
        }`
    : "";
  return (
    <StatCard label="Tracker Score" loading={loading}>
      <p className={`text-xl font-display font-bold tabular-nums ${colorClass}`} title={hint}>
        {display}
        {score?.score != null && (
          <span className="text-xs text-text-muted font-body font-normal">/100</span>
        )}
      </p>
      <p className="text-xs font-body text-text-muted">
        {score?.score != null
          ? `${score.breakdown.kd} K/D · ${score.breakdown.winrate}% WR`
          : score?.games
            ? `${score.games}g · keep going`
            : "Competitive"}
      </p>
    </StatCard>
  );
}

function StatCard({ label, children, loading }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.2 }}
      className={`p-3 rounded-xl bg-base-700 border border-border space-y-1.5 ${loading ? "opacity-60" : ""}`}
    >
      <p className="text-[10px] font-display font-medium text-text-muted uppercase tracking-wider">
        {label}
      </p>
      {children}
    </motion.div>
  );
}

// #24: hand-rolled SVG line chart for RR over the most recent ~20 ranked
// matches. Riot returns matches most-recent-first; we reverse for
// left-to-right time. Y axis uses tier*100 + rr to give a continuous signal
// across tier promotion/demotion boundaries.
//
// `matches` is an array of normalized RrEntry from riotShapes.js — all
// fields are camelCase, defensively coerced to numbers.
function RRChart({ matches }) {
  // Reverse so left = oldest, right = most recent.
  const points = [...matches].reverse().map((m) => ({
    y: m.tierAfter * 100 + m.rrAfter,
    rr: m.rrAfter,
    earned: m.rrEarned,
  }));
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(1, maxY - minY);
  // Padding around the polyline so the top/bottom dots don't clip.
  const pad = 12;
  const w = 600; // logical width; SVG scales to container
  const h = 140;
  const innerH = h - pad * 2;
  const xStep = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * xStep;
    const yNorm = (p.y - minY) / span; // 0..1
    const y = pad + (1 - yNorm) * innerH;
    // NB: spread `p` first so the scaled `x`/`y` override the raw `p.y`.
    // Spreading after `{ x, y }` would clobber the scaled `y` with the
    // raw tier*100+rr value and push the polyline off the viewBox.
    return { ...p, x, y };
  });
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const last = coords[coords.length - 1];
  const totalDelta = points.reduce((acc, p) => acc + p.earned, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl border border-border bg-base-700/60 p-3"
    >
      <div className="flex items-baseline justify-between mb-2">
        <Label>RR Trend</Label>
        <p
          className={`text-[10px] font-mono tabular-nums ${totalDelta >= 0 ? "text-green-400" : "text-red-400"}`}
        >
          {totalDelta >= 0 ? "+" : ""}
          {totalDelta} RR over {points.length} matches
        </p>
      </div>
      <div className="relative w-full h-[140px]">
        {/* eslint-disable-next-line no-restricted-syntax -- dynamic data viz, not an icon */}
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
        >
          <path
            d={pathD}
            fill="none"
            stroke="rgb(var(--val-red))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={i === coords.length - 1 ? 4 : 2.5}
              fill="rgb(var(--val-red))"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* Labels as HTML overlays so preserveAspectRatio="none" doesn't
            horizontally smear the text along with the line. */}
        <span className="absolute right-1.5 top-1 text-[9px] font-mono tabular-nums text-text-muted">
          {maxY}
        </span>
        <span className="absolute right-1.5 bottom-1 text-[9px] font-mono tabular-nums text-text-muted">
          {minY}
        </span>
        <span
          className="absolute right-2 text-[10px] font-mono tabular-nums text-text-primary"
          style={{ top: `${(last.y / h) * 100}%`, transform: "translateY(-130%)" }}
        >
          {last.rr}
        </span>
      </div>
    </motion.div>
  );
}

// Tracker.gg-style rollup panels. Renders three sections collapsed inside
// a <details> so the page layout doesn't change for users who don't care:
// overall stats for the current queue filter, top agents, top maps.
//
// Data shape (from `match_history_aggregate`):
//   { byAgent: [{agentId, games, wins, kills, deaths, assists}, ...],
//     byMap:   [{mapId,   games, wins}, ...],
//     overall: {games, wins, kills, deaths, assists}, limit, queueId }
function AggregatePanels({ aggregate, maps, agentNames }) {
  const { overall, byAgent, byMap } = aggregate;
  const winPct = overall.games > 0 ? Math.round((overall.wins / overall.games) * 100) : 0;
  const kdRatio = overall.deaths > 0 ? (overall.kills / overall.deaths).toFixed(2) : "—";
  const avgK = overall.games > 0 ? (overall.kills / overall.games).toFixed(1) : "—";
  const avgD = overall.games > 0 ? (overall.deaths / overall.games).toFixed(1) : "—";
  const avgA = overall.games > 0 ? (overall.assists / overall.games).toFixed(1) : "—";

  return (
    <details className="rounded-xl border border-border bg-base-700/60 group" open>
      <summary className="cursor-pointer list-none p-3 flex items-center justify-between hover:bg-base-700/80 rounded-xl">
        <div className="flex items-baseline gap-3">
          <Label>Stats</Label>
          <span className="text-[11px] font-mono tabular-nums text-text-muted">
            {overall.games} games · {winPct}% WR · {kdRatio} K/D · {avgK}/{avgD}/{avgA}
          </span>
        </div>
        <span className="text-text-muted text-[10px] group-open:rotate-90 transition-transform">
          ▶
        </span>
      </summary>
      <div className="px-3 pb-3 grid grid-cols-2 gap-3">
        <AggregateList
          title="Top Agents"
          rows={byAgent.slice(0, 5)}
          renderRow={(r) => {
            const iconUrl = r.agentId
              ? customAgentIconByUuid(r.agentId) ||
                `https://media.valorant-api.com/agents/${r.agentId}/displayicon.png`
              : null;
            const wr = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
            const kd = r.deaths > 0 ? (r.kills / r.deaths).toFixed(2) : "—";
            return (
              <>
                {iconUrl && <img src={iconUrl} alt="" className="w-5 h-5 rounded-full shrink-0" />}
                <span className="flex-1 truncate text-text-primary">
                  {agentNames[r.agentId?.toLowerCase()] || r.agentId?.slice(0, 8) || "Unknown"}
                </span>
                <span className="text-text-muted tabular-nums">{r.games}g</span>
                <span className={`tabular-nums ${wr >= 50 ? "text-green-400" : "text-red-400"}`}>
                  {wr}%
                </span>
                <span className="text-text-muted tabular-nums">{kd}</span>
              </>
            );
          }}
        />
        <AggregateList
          title="Top Maps"
          rows={byMap.slice(0, 5)}
          renderRow={(r) => {
            const key = r.mapId?.split("/").pop();
            const mapData = key ? maps[key] : null;
            const name = mapData?.name || key || "Unknown";
            const wr = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
            return (
              <>
                <span className="flex-1 truncate text-text-primary">{name}</span>
                <span className="text-text-muted tabular-nums">{r.games}g</span>
                <span className={`tabular-nums ${wr >= 50 ? "text-green-400" : "text-red-400"}`}>
                  {wr}%
                </span>
              </>
            );
          }}
        />
      </div>
    </details>
  );
}

function AggregateList({ title, rows, renderRow }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-display font-bold text-text-muted uppercase tracking-wider mb-1">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-[10px] font-body text-text-muted italic">No data</p>
      ) : (
        rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-[10px] font-mono px-1.5 py-1 rounded hover:bg-base-600/40"
          >
            {renderRow(r)}
          </div>
        ))
      )}
    </div>
  );
}
