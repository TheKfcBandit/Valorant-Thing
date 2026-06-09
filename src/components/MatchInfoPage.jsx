import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { noAnim, T0 } from "../utils/animation";
import { resolveModeName } from "../utils/gameMode";
import { LIVE_MODULES } from "../live/registry";
import { normalizeLiveMatch } from "../riotShapes";
import { getAgentLookup, getMapLookup, getTierLookup } from "../valApiSkins";
import { useApiLookup } from "../hooks/useApiLookup";
import { useLiveMatchPlayers } from "../hooks/useLiveMatchPlayers";
import { Users, WifiSlash } from "../icons";
import { MatchHeader } from "./match-info/MatchHeader";
import { PlayerCard } from "./match-info/PlayerCard";
import { PlayerDetailDialog } from "./match-info/PlayerDetailDialog";

const POLL_INTERVAL = 2000;

export default function MatchInfoPage({
  splooshimaApiKey,
  splooshimaAvailable,
  player: selfPlayer,
  connected,
  addLog,
}) {
  const myPuuid = selfPlayer?.puuid;
  const agents = useApiLookup(getAgentLookup);
  const tiers = useApiLookup(getTierLookup);
  const maps = useApiLookup(getMapLookup);
  const [matchPhase, setMatchPhase] = useState(null);
  const [mapId, setMapId] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const [matchInfo, setMatchInfo] = useState(null);
  const [_loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moduleData, setModuleData] = useState({});
  const [openPuuid, setOpenPuuid] = useState(null);
  const fetchedMatchRef = useRef(null);
  const fetchedModuleKeysRef = useRef({});
  const cancelledRef = useRef(false);

  const { players, fetching, reset, refreshRoster, ingestNewMatch } = useLiveMatchPlayers({
    splooshimaApiKey,
    splooshimaAvailable,
    addLog,
  });

  // Generic module orchestrator: run each registered LiveModule's fetch
  // once per (matchId, phase, moduleId). Modules don't see each other —
  // each one's result lands in moduleData[module.id][puuid] independently.
  const runModules = useCallback(
    (matchId, phase, currentPlayers) => {
      if (!matchId) return;
      for (const mod of LIVE_MODULES) {
        if (typeof mod.fetch !== "function") continue;
        const key = `${matchId}_${phase}_${mod.id}`;
        if (fetchedModuleKeysRef.current[mod.id] === key) continue;
        fetchedModuleKeysRef.current[mod.id] = key;
        Promise.resolve()
          .then(() => mod.fetch({ matchId, phase, players: currentPlayers, addLog }))
          .then((result) => {
            if (cancelledRef.current) return;
            if (!result) return;
            setModuleData((prev) => ({
              ...prev,
              [mod.id]: { ...(prev[mod.id] || {}), ...result },
            }));
          })
          .catch((e) => {
            if (cancelledRef.current) return;
            fetchedModuleKeysRef.current[mod.id] = null;
            const msg = typeof e === "string" ? e : e?.message || String(e);
            addLog?.("error", `[Live] Module '${mod.id}' failed: ${msg}`);
          });
      }
    },
    [addLog]
  );

  const seedModuleCache = useCallback((puuid) => {
    const seeded = {};
    for (const mod of LIVE_MODULES) {
      if (typeof mod.cachedFor !== "function") continue;
      const cached = mod.cachedFor(puuid);
      if (cached != null) {
        if (!seeded[mod.id]) seeded[mod.id] = {};
        seeded[mod.id][puuid] = cached;
      }
    }
    if (Object.keys(seeded).length === 0) return;
    setModuleData((prev) => {
      const next = { ...prev };
      for (const [mid, byPuuid] of Object.entries(seeded)) {
        next[mid] = { ...(next[mid] || {}), ...byPuuid };
      }
      return next;
    });
  }, []);

  const fetchMatchData = useCallback(async () => {
    try {
      const raw = await invoke("check_current_game");
      const live = normalizeLiveMatch(JSON.parse(raw));
      setMatchPhase(live.phase);
      setMapId(live.mapId || null);
      setMatchId(live.matchId);

      const modeName = resolveModeName(live.queueId, live.modeUrl);
      const nonTeamModes = ["Deathmatch"];
      const isTeamMode = !nonTeamModes.includes(modeName);
      setMatchInfo({ mode: modeName, server: live.gamePodId, isTeamMode });

      const prevKey = fetchedMatchRef.current;
      const newKey = `${live.matchId}_${live.phase}`;
      if (prevKey === newKey) {
        refreshRoster(live.players);
        setLoading(false);
        runModules(live.matchId, live.phase, live.players);
        return;
      }
      fetchedMatchRef.current = newKey;
      // ingestNewMatch seeds the roster synchronously (before its first
      // await), preserving the original render order vs runModules.
      const pending = ingestNewMatch(live.players);
      setLoading(false);
      for (const p of live.players) seedModuleCache(p.puuid);
      runModules(live.matchId, live.phase, live.players);
      setError(null);
      await pending;
    } catch (err) {
      const msg = typeof err === "string" ? err : err?.message || "";
      if (msg.includes("Not in a match")) {
        setMatchPhase(null);
        reset();
        setModuleData({});
        fetchedMatchRef.current = null;
        fetchedModuleKeysRef.current = {};
        setError(null);
      }
      setLoading(false);
    }
  }, [refreshRoster, ingestNewMatch, reset, runModules, seedModuleCache]);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    fetchMatchData();
    const timer = setInterval(fetchMatchData, POLL_INTERVAL);
    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [fetchMatchData]);

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <WifiSlash className="text-text-muted" />
        <p className="text-text-muted text-sm font-display">Waiting for Valorant</p>
        <p className="text-[11px] font-body text-text-muted/60">
          Open Valorant and it will connect automatically
        </p>
      </div>
    );
  }

  if (!matchPhase) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Users size={36} className="text-text-muted/25" />
        <div className="text-center space-y-1">
          <p className="text-sm font-display font-semibold text-text-secondary">No Active Match</p>
          <p className="text-xs font-body text-text-muted">
            Player info will appear when you enter a match
          </p>
        </div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 animate-pulse">
        <div className="h-[72px] rounded-xl bg-base-700 border border-border" />
        <div className="grid grid-cols-2 gap-4 flex-1">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-1.5">
              <div className="h-3 w-20 rounded bg-base-600 mb-2" />
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 p-2 rounded-lg bg-base-700 border border-border h-12"
                >
                  <div className="w-8 h-8 rounded-md bg-base-600 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-24 rounded bg-base-600" />
                    <div className="h-2.5 w-14 rounded bg-base-600" />
                  </div>
                  <div className="h-6 w-6 rounded bg-base-600" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const teamData = splitTeams(players, matchPhase, myPuuid);

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <MatchHeader
        mapId={mapId}
        maps={maps}
        matchPhase={matchPhase}
        matchInfo={matchInfo}
        matchId={matchId}
        playerCount={players.length}
        fetching={fetching}
        error={error}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {teamData.mode === "teams" ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-display font-bold tracking-wider text-status-green mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-green inline-block" />
                YOUR TEAM
              </p>
              {teamData.ally.map((p, i) => (
                <motion.div
                  key={p.puuid}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={noAnim() ? T0 : { duration: 0.15, delay: i * 0.04 }}
                >
                  <PlayerCard
                    player={p}
                    agents={agents}
                    tiers={tiers}
                    moduleData={moduleData}
                    isSelf={p.puuid === myPuuid}
                    onOpen={() => setOpenPuuid(p.puuid)}
                  />
                </motion.div>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-display font-bold tracking-wider text-val-red mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-val-red inline-block" />
                ENEMY TEAM
              </p>
              {teamData.enemy.map((p, i) => (
                <motion.div
                  key={p.puuid}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={noAnim() ? T0 : { duration: 0.15, delay: i * 0.04 }}
                >
                  <PlayerCard
                    player={p}
                    agents={agents}
                    tiers={tiers}
                    moduleData={moduleData}
                    isSelf={p.puuid === myPuuid}
                    onOpen={() => setOpenPuuid(p.puuid)}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {teamData.all.map((p, i) => (
              <motion.div
                key={p.puuid}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={noAnim() ? T0 : { duration: 0.15, delay: i * 0.04 }}
              >
                <PlayerCard
                  player={p}
                  agents={agents}
                  tiers={tiers}
                  moduleData={moduleData}
                  isSelf={p.puuid === myPuuid}
                  onOpen={() => setOpenPuuid(p.puuid)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openPuuid && (
          <PlayerDetailDialog
            player={players.find((p) => p.puuid === openPuuid)}
            agents={agents}
            tiers={tiers}
            moduleData={moduleData}
            onClose={() => setOpenPuuid(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function splitTeams(players, phase, myPuuid) {
  if (phase === "PREGAME") {
    return { mode: "list", all: players };
  }
  const teamIds = [...new Set(players.map((p) => p.team))];
  if (teamIds.length === 2) {
    const me = players.find((p) => p.puuid === myPuuid);
    const myTeam = me?.team || teamIds[0];
    return {
      mode: "teams",
      ally: players.filter((p) => p.team === myTeam),
      enemy: players.filter((p) => p.team !== myTeam),
    };
  }
  return { mode: "list", all: players };
}
