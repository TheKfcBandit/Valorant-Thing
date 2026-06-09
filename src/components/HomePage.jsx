import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApiLookup } from "../hooks/useApiLookup";
import { motion } from "framer-motion";
import { rankIcon, rankName } from "../utils/rank";
import { normalizePenaltiesResponse, normalizeRrEntry } from "../riotShapes";
import { computeTrackerScore } from "../utils/trackerScore";
import { useAsyncEffect } from "../hooks/useAsyncEffect";
import { formatError } from "../utils/authError";
import { getAgentLookup } from "../valApiSkins";
import { formatTimer } from "../utils/format";
import { getMapMetadataByUrl } from "../utils/maps";
import { Clock, RefreshCcw, WifiSlash } from "../icons";
import { MatchDetailsModal } from "./home/MatchDetailsModal";
import { StatCard, TrackerScoreCard } from "./home/StatCards";
import { RRChart } from "./home/RRChart";
import { AggregatePanels } from "./home/AggregatePanels";
import { MatchHistorySection } from "./home/MatchHistorySection";
import { SpendCard, AccountStatusBanner } from "./home/StatusBanners";

const REFRESH_INTERVAL = 5 * 60 * 1000;

// Matches Riot's natural per-call cap on `/match-history`. Larger windows
// don't return more entries, smaller ones just multiply round trips.
const PAGE_SIZE = 20;

export default function HomePage({ connected, player, playerIsStale, refreshKey, onRefresh }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(REFRESH_INTERVAL);
  const maps = useApiLookup(getMapMetadataByUrl);
  const agentLookup = useApiLookup(getAgentLookup);
  const agentNames = useMemo(() => {
    const names = {};
    for (const [id, a] of Object.entries(agentLookup)) {
      if (a?.displayName) names[id] = a.displayName;
    }
    return names;
  }, [agentLookup]);
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

  const fetchStats = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke("get_home_stats", { queueFilter: "competitive" });
      const parsed = JSON.parse(raw);
      if (!parsed.level && !parsed.currentTier && !parsed.totalGames) {
        throw new Error("Empty stats returned â€” token may be stale");
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
  // refresh tick. Doesn't paginate backward â€” that's loadMore's job.
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

  // Read DB â†’ matches on mount and on filter change. Replaces the old
  // separate useAsyncEffect seed (this covers cache-render-before-connect).
  // Resets visible window AND hasMoreInRiot â€” switching filters must
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

  // Aggregate stats panel â€” clear stale data first so the panel hides
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
  // Gated on matchLoading === false so the boolean flipping trueâ†’false each
  // refresh fires the aggregate query exactly once per cycle (after the
  // SQLite write has actually landed), not twice.
  useEffect(() => {
    if (matchLoading) return;
    invoke("match_history_aggregate", { queueId: "competitive", limit: 500 })
      .then(setCompAggregate)
      .catch((e) => console.warn("[History] comp aggregate failed:", e));
  }, [matchLoading]);

  // Same pattern as the match-history seed above â€” render the RR chart from
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
      // `MatchID`), so we filter and put the raw shape â€” normalization
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
    // Render from cache regardless of whether the API call succeeded â€” the
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
                {wins}W / {losses}L Â· {totalGames}g
              </p>
            </StatCard>

            <TrackerScoreCard score={trackerScore} loading={loading} />
          </motion.div>
        )}

        {rrHistory && rrHistory.length >= 2 && <RRChart matches={rrHistory} />}

        {spend && (spend.thisMonthVp > 0 || spend.vpSpent > 0) && <SpendCard spend={spend} />}

        {penalties.length > 0 && <AccountStatusBanner penalties={penalties} />}

        {aggregate && aggregate.overall?.games > 0 && (
          <AggregatePanels aggregate={aggregate} maps={maps} agentNames={agentNames} />
        )}

        <MatchHistorySection
          matches={matches}
          matchLoading={matchLoading}
          maps={maps}
          queueFilter={queueFilter}
          availableQueues={availableQueues}
          onQueueFilterChange={setQueueFilter}
          loadingMore={loadingMore}
          hasMoreInRiot={hasMoreInRiot}
          loadError={loadError}
          visibleCount={visibleCount}
          onLoadMore={loadMore}
          onOpenMatch={setOpenMatch}
        />
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
