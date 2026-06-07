import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { getCached, setCache } from "../matchCache";
import { noAnim, T0 } from "../utils/animation";
import { resolveModeName } from "../utils/gameMode";
import { LIVE_MODULES } from "../live/registry";
import { getAgentLookup, getMapLookup, getTierLookup } from "../valApiSkins";
import { useApiLookup } from "../hooks/useApiLookup";
import { parseGamePod } from "../utils/gamePod";
import { EyeOff, LogOut, Spinner, Users, WifiSlash, X } from "../icons";

const POLL_INTERVAL = 2000;

export default function MatchInfoPage({
  splooshimaApiKey,
  splooshimaAvailable,
  player: selfPlayer,
  connected,
  addLog,
}) {
  const myPuuid = selfPlayer?.puuid;
  const [players, setPlayers] = useState([]);
  const agents = useApiLookup(getAgentLookup);
  const tiers = useApiLookup(getTierLookup);
  const maps = useApiLookup(getMapLookup);
  const [matchPhase, setMatchPhase] = useState(null);
  const [mapId, setMapId] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const [matchInfo, setMatchInfo] = useState(null);
  const [_loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const [moduleData, setModuleData] = useState({});
  const [openPuuid, setOpenPuuid] = useState(null);
  const fetchedMatchRef = useRef(null);
  const fetchedModuleKeysRef = useRef({});
  const cancelledRef = useRef(false);

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
      const match = JSON.parse(raw);
      const phase = match._phase === "pregame" ? "PREGAME" : "INGAME";
      const matchId = match.ID || match.MatchID;
      setMatchPhase(phase);
      setMapId(match.MapID || null);
      setMatchId(matchId);

      const modeUrl = match.GameMode || match.Mode || "";
      const queueId = match.MatchmakingData?.QueueID || match.QueueID || "";
      const modeName = resolveModeName(queueId, modeUrl);

      const nonTeamModes = ["Deathmatch"];
      const isTeamMode = !nonTeamModes.includes(modeName);
      const info = { mode: modeName, server: match.GamePodID || "", isTeamMode };

      setMatchInfo(info);

      let playerList = [];
      if (phase === "PREGAME") {
        const ally = match.AllyTeam?.Players || [];
        playerList = ally.map((p) => ({
          puuid: p.Subject,
          characterId: p.CharacterID,
          team: "ally",
          accountLevel: p.PlayerIdentity?.AccountLevel || 0,
          incognito: p.PlayerIdentity?.Incognito || false,
          hideLevel: p.PlayerIdentity?.HideAccountLevel || false,
        }));
      } else {
        const all = match.Players || [];
        playerList = all.map((p) => ({
          puuid: p.Subject,
          characterId: p.CharacterID,
          team: p.TeamID,
          accountLevel: p.PlayerIdentity?.AccountLevel || 0,
          incognito: p.PlayerIdentity?.Incognito || false,
          hideLevel: p.PlayerIdentity?.HideAccountLevel || false,
        }));
      }

      const prevKey = fetchedMatchRef.current;
      const newKey = `${matchId}_${phase}`;
      if (prevKey === newKey) {
        setPlayers((prev) =>
          prev.map((old) => {
            const updated = playerList.find((p) => p.puuid === old.puuid);
            return updated
              ? {
                  ...old,
                  characterId: updated.characterId,
                  team: updated.team,
                  accountLevel: updated.accountLevel,
                }
              : old;
          })
        );
        setLoading(false);
        runModules(matchId, phase, playerList);
        return;
      }
      fetchedMatchRef.current = newKey;
      const withCached = playerList.map((p) => ({
        ...p,
        account: getCached(p.puuid, "account") || null,
        mmr: getCached(p.puuid, "mmr") || null,
        _loading: !getCached(p.puuid, "account"),
      }));
      setPlayers(withCached);
      setLoading(false);
      for (const p of playerList) seedModuleCache(p.puuid);
      runModules(matchId, phase, playerList);

      const needsAccount = withCached.filter((p) => !p.account);

      setError(null);
      if (needsAccount.length > 0) setFetching(true);

      if (needsAccount.length > 0) {
        const puuidsToResolve = needsAccount.map((p) => p.puuid);
        const resolved = {};

        try {
          const raw = await invoke("resolve_player_names", { puuids: puuidsToResolve });
          if (cancelledRef.current) return;
          const names = JSON.parse(raw);
          addLog?.(
            "info",
            `[Riot] Name-service resolved ${names.filter((n) => n.name).length}/${puuidsToResolve.length} players`
          );
          names.forEach((n) => {
            if (n.name) {
              resolved[n.puuid] = { name: n.name, tag: n.tag };
              setCache(n.puuid, "account", resolved[n.puuid]);
            }
          });
        } catch (e) {
          addLog?.("error", `[Riot] Name-service failed`, { error: String(e) });
        }

        const needLevel = needsAccount.filter(
          (p) => (p.hideLevel || p.accountLevel === 0) && resolved[p.puuid]
        );
        if (needLevel.length > 0) {
          addLog?.(
            "info",
            `[Riot] Fetching levels from match history for ${needLevel.length} hidden-level players`
          );
          const levelResults = await Promise.all(
            needLevel.map(async (p) => {
              try {
                const raw = await invoke("get_player_level_from_history", { targetPuuid: p.puuid });
                const data = JSON.parse(raw);
                addLog?.(
                  "info",
                  `[Riot] History level for ${p.puuid.slice(0, 8)}… = ${data.level}`
                );
                return { puuid: p.puuid, level: data.level || 0 };
              } catch (e) {
                addLog?.("error", `[Riot] History level failed for ${p.puuid.slice(0, 8)}…`, {
                  error: String(e),
                });
                return { puuid: p.puuid, level: 0 };
              }
            })
          );
          if (cancelledRef.current) return;
          levelResults.forEach((r) => {
            if (r.level > 0 && resolved[r.puuid]) {
              resolved[r.puuid] = { ...resolved[r.puuid], account_level: r.level };
              setCache(r.puuid, "account", resolved[r.puuid]);
            }
          });
        }

        let unresolvedNames = puuidsToResolve.filter((id) => !resolved[id]);
        let stillNeedLevel = needLevel.filter((p) => !resolved[p.puuid]?.account_level);
        if (
          (unresolvedNames.length > 0 || stillNeedLevel.length > 0) &&
          splooshimaApiKey &&
          splooshimaAvailable
        ) {
          try {
            const sPuuids = [
              ...new Set([...unresolvedNames, ...stillNeedLevel.map((p) => p.puuid)]),
            ];
            const sRaw = await invoke("splooshima_lookup", {
              puuids: sPuuids,
              apiKey: splooshimaApiKey,
            });
            if (cancelledRef.current) return;
            const sData = JSON.parse(sRaw);
            addLog?.(
              "info",
              `[Splooshima] Fallback resolved ${sData.found ?? 0}/${sData.requested ?? 0} players`
            );
            (sData?.results || []).forEach((r) => {
              const entry = {
                name: r.gameName || resolved[r.puuid]?.name,
                tag: r.tagLine || resolved[r.puuid]?.tag,
                account_level: r.level ?? resolved[r.puuid]?.account_level ?? null,
              };
              if (entry.name) {
                resolved[r.puuid] = { ...resolved[r.puuid], ...entry };
                setCache(r.puuid, "account", resolved[r.puuid]);
              }
              if (r.currentTier != null) {
                setCache(r.puuid, "mmr", {
                  currenttier: r.currentTier || 0,
                  ranking_in_tier: r.currentRR || 0,
                  peaktier: r.peakTier || 0,
                  peak_rr: r.peakRR || 0,
                });
              }
            });
          } catch (e) {
            addLog?.("error", `[Splooshima] Fallback lookup failed`, { error: String(e) });
          }
        }

        setPlayers((prev) =>
          prev.map((p) => {
            const r = resolved[p.puuid];
            const cachedMmr = getCached(p.puuid, "mmr") || null;
            return r
              ? { ...p, account: { ...p.account, ...r }, mmr: cachedMmr || p.mmr, _loading: false }
              : { ...p, mmr: cachedMmr || p.mmr, _loading: false };
          })
        );
        setFetching(false);
      }

      const needsMmr = withCached.filter((p) => !getCached(p.puuid, "mmr"));
      if (needsMmr.length === 0) return;

      const extractPeak = (rawJson) => {
        try {
          const seasons = rawJson?.QueueSkills?.competitive?.SeasonalInfoBySeasonID;
          if (!seasons) return { peaktier: 0, peak_rr: 0 };
          let best = 0,
            bestRr = 0;
          Object.values(seasons).forEach((s) => {
            const t = s.CompetitiveTier || 0;
            const r = s.RankedRating || 0;
            if (t > best || (t === best && r > bestRr)) {
              best = t;
              bestRr = r;
            }
          });
          return { peaktier: best, peak_rr: bestRr };
        } catch {
          return { peaktier: 0, peak_rr: 0 };
        }
      };

      const fetchMmr = (puuid) =>
        invoke("get_player_mmr", { targetPuuid: puuid })
          .then((raw) => {
            const json = JSON.parse(raw);
            const tier = json.currenttier || 0;
            const rr = json.ranking_in_tier || 0;
            if (tier === 0 && rr === 0) return { puuid, data: null, needsFallback: true };
            const peak = extractPeak(json.raw);
            return { puuid, data: { currenttier: tier, ranking_in_tier: rr, ...peak } };
          })
          .catch(() => ({ puuid, data: null, needsFallback: true }));

      let mmrResults = await Promise.all(needsMmr.map((p) => fetchMmr(p.puuid)));
      if (cancelledRef.current) return;

      mmrResults.filter((r) => r.data).forEach((r) => setCache(r.puuid, "mmr", r.data));
      setPlayers((prev) =>
        prev.map((p) => {
          const r = mmrResults.find((a) => a.puuid === p.puuid);
          return r?.data ? { ...p, mmr: r.data } : p;
        })
      );

      let mmrFailed = mmrResults.filter((r) => r.needsFallback).map((r) => r.puuid);

      if (mmrFailed.length > 0 && splooshimaApiKey && splooshimaAvailable) {
        try {
          const sRaw = await invoke("splooshima_lookup", {
            puuids: mmrFailed,
            apiKey: splooshimaApiKey,
          });
          if (cancelledRef.current) return;
          const sData = JSON.parse(sRaw);
          addLog?.(
            "info",
            `[Splooshima] MMR bulk lookup — ${sData.found ?? 0}/${sData.requested ?? 0} resolved`,
            sData
          );
          const smmrMap = {};
          (sData?.results || []).forEach((r) => {
            if (r.currentTier != null && r.currentTier > 0) {
              smmrMap[r.puuid] = {
                currenttier: r.currentTier || 0,
                ranking_in_tier: r.currentRR || 0,
                peaktier: r.peakTier || 0,
                peak_rr: r.peakRR || 0,
              };
              setCache(r.puuid, "mmr", smmrMap[r.puuid]);
            }
          });
          setPlayers((prev) =>
            prev.map((p) => (smmrMap[p.puuid] ? { ...p, mmr: smmrMap[p.puuid] } : p))
          );
          mmrFailed = mmrFailed.filter((id) => !smmrMap[id]);
        } catch (e) {
          addLog?.("error", `[Splooshima] MMR lookup failed`, { error: String(e) });
        }
      }
    } catch (err) {
      const msg = typeof err === "string" ? err : err?.message || "";
      if (msg.includes("Not in a match")) {
        setMatchPhase(null);
        setPlayers([]);
        setModuleData({});
        fetchedMatchRef.current = null;
        fetchedModuleKeysRef.current = {};
        setError(null);
        setFetching(false);
      }
      setLoading(false);
    }
  }, []);

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
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
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

function MatchHeader({
  mapId,
  maps,
  matchPhase,
  matchInfo,
  matchId,
  playerCount,
  fetching,
  error,
}) {
  const mapData = mapId ? maps[mapId.toLowerCase()] || null : null;
  const mapName = mapData?.displayName || "Unknown Map";
  const mapImg = mapData?.listViewIcon || mapData?.splash || "";
  const canLeave = matchInfo?.mode === "Deathmatch" || matchInfo?.mode === "Custom";
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="shrink-0 rounded-xl overflow-hidden border border-border bg-base-700 relative">
      {mapImg && (
        <div className="absolute inset-0">
          <img src={mapImg} alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-r from-base-700 via-base-700/80 to-transparent" />
        </div>
      )}
      <div className="relative flex items-center gap-4 px-4 py-3">
        {mapImg && (
          <div className="w-16 h-10 rounded-lg overflow-hidden bg-base-600 shrink-0 border border-border/50">
            <img src={mapImg} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-display font-bold text-text-primary">{mapName}</h2>
            <span className="text-[10px] font-body text-text-muted px-1.5 py-0.5 rounded bg-base-600/80 border border-border/50">
              {matchPhase === "PREGAME" ? "Agent Select" : "In Game"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-body text-text-muted">{matchInfo?.mode || ""}</span>
            {matchInfo?.server && (
              <>
                <span className="text-[11px] text-text-muted/40">·</span>
                <span className="text-[11px] font-body text-text-muted">
                  {parseGamePod(matchInfo.server)}
                </span>
              </>
            )}
            <span className="text-[11px] text-text-muted/40">·</span>
            <span className="text-[11px] font-body text-text-muted">{playerCount} players</span>
          </div>
        </div>

        {/* Score display disabled — coregame endpoint doesn't provide round scores */}

        {canLeave && matchPhase === "INGAME" && matchId && (
          <button
            disabled={leaving}
            onClick={async () => {
              setLeaving(true);
              try {
                await invoke("coregame_quit", { matchId });
              } catch (e) {
                console.warn("[MatchInfo] suppressed:", e);
              }
              setLeaving(false);
            }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-red/15 border border-status-red/30 text-xs font-display font-semibold text-status-red hover:bg-status-red/25 transition-colors disabled:opacity-50"
          >
            <LogOut />
            {leaving ? "..." : "Leave"}
          </button>
        )}

        <div className="flex flex-col items-end gap-1 shrink-0">
          {fetching && (
            <div className="flex items-center gap-1.5">
              <Spinner size={16} className="text-text-muted" />
              <span className="text-[10px] font-body text-text-muted">Fetching...</span>
            </div>
          )}
          {error && (
            <span className="text-[10px] font-body text-yellow-400 max-w-[140px] truncate">
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, agents, tiers, moduleData, isSelf, onOpen }) {
  const agent = agents[player.characterId?.toLowerCase()];
  const acct = player.account;
  const mmr = player.mmr;
  const tierInfo = tiers[mmr?.currenttier] || null;
  const peakTierInfo = tiers[mmr?.peaktier] || null;
  const isLoading = player._loading;
  const displayName = acct?.name || agent?.displayName || player.puuid.slice(0, 8);
  const displayLevel = acct?.account_level || player.accountLevel || 0;

  const slots = [];
  for (const mod of LIVE_MODULES) {
    if (!mod.CardSlot) continue;
    const data = moduleData?.[mod.id]?.[player.puuid];
    if (data == null) continue;
    slots.push({ mod, data });
  }
  const hasModuleData = slots.length > 0 || hasAnyDialogContent(player, moduleData);

  return (
    <div
      role={hasModuleData ? "button" : undefined}
      tabIndex={hasModuleData ? 0 : undefined}
      onClick={hasModuleData ? onOpen : undefined}
      onKeyDown={
        hasModuleData
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
        isSelf ? "bg-val-red/10 border-val-red/30" : "bg-base-700 border-border"
      } ${hasModuleData ? "cursor-pointer hover:border-val-red/40" : ""}`}
    >
      <div className="w-10 h-10 rounded-lg bg-base-600 overflow-hidden shrink-0 flex items-center justify-center">
        {agent?.displayIconSmall ? (
          <img src={agent.displayIconSmall} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-text-muted text-[10px]">?</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {isLoading ? (
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 rounded bg-base-500 animate-pulse" />
            <div className="h-3 w-12 rounded bg-base-500/60 animate-pulse" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <p
                className={`text-sm font-display font-bold truncate ${isSelf ? "text-val-red" : "text-text-primary"}`}
              >
                {displayName}
              </p>
              {acct?.tag && <span className="text-xs font-body text-text-muted">#{acct.tag}</span>}
              {(player.incognito || player.hideLevel) && (
                <EyeOff className="text-text-muted/50 shrink-0" title="Hidden identity" />
              )}
              {isSelf && (
                <span className="text-[9px] font-display font-bold text-val-red/70 uppercase tracking-wider ml-0.5">
                  you
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="text-[11px] font-body text-text-primary shrink-0">
                {displayLevel > 0 ? `Level ${displayLevel}` : "Level ?"}
              </span>
              <span className="text-[11px] text-text-primary/50 shrink-0">·</span>
              <img
                src={
                  tierInfo?.icon ||
                  "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png"
                }
                alt=""
                className="w-3.5 h-3.5 shrink-0"
              />
              <span className="text-[11px] font-display font-semibold text-text-primary">
                {tierInfo?.name || "Unranked"}
              </span>
              <span className="text-[11px] font-body text-text-primary/70 shrink-0">
                {mmr?.ranking_in_tier ?? 0}RR
              </span>
              {peakTierInfo && mmr?.peaktier > 0 && (
                <>
                  <span className="text-[11px] text-text-primary/50 shrink-0">·</span>
                  <span className="text-[11px] font-body text-text-primary shrink-0">Peak:</span>
                  <img src={peakTierInfo.icon} alt="" className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-display font-semibold text-text-primary">
                    {peakTierInfo.name}
                  </span>
                  <span className="text-[11px] font-body text-text-primary/70">
                    {mmr?.peak_rr ?? 0}RR
                  </span>
                </>
              )}
            </div>
            {slots.map(({ mod, data }) => (
              <mod.CardSlot key={mod.id} player={player} data={data} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function hasAnyDialogContent(player, moduleData) {
  for (const mod of LIVE_MODULES) {
    if (!mod.DialogSection) continue;
    if (moduleData?.[mod.id]?.[player.puuid] != null) return true;
  }
  return false;
}

function PlayerDetailDialog({ player, agents, tiers, moduleData, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!player) return null;

  const agent = agents[player.characterId?.toLowerCase()];
  const acct = player.account;
  const mmr = player.mmr;
  const tierInfo = tiers[mmr?.currenttier] || null;
  const displayName = acct?.name || agent?.displayName || player.puuid.slice(0, 8);

  const sections = [];
  for (const mod of LIVE_MODULES) {
    if (!mod.DialogSection) continue;
    const data = moduleData?.[mod.id]?.[player.puuid];
    if (data == null) continue;
    sections.push({ mod, data });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={noAnim() ? T0 : { duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={noAnim() ? T0 : { type: "spring", stiffness: 400, damping: 28 }}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-border bg-base-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-base-700/60">
          <div className="w-10 h-10 rounded-lg bg-base-600 overflow-hidden shrink-0 flex items-center justify-center">
            {agent?.displayIconSmall ? (
              <img src={agent.displayIconSmall} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-text-muted text-[10px]">?</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p className="text-base font-display font-bold text-text-primary truncate">
                {displayName}
              </p>
              {acct?.tag && <span className="text-xs font-body text-text-muted">#{acct.tag}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {tierInfo?.icon && <img src={tierInfo.icon} alt="" className="w-3.5 h-3.5" />}
              <span className="text-[11px] font-display font-semibold text-text-secondary">
                {tierInfo?.name || "Unranked"}
              </span>
              <span className="text-[11px] font-body text-text-muted">
                {mmr?.ranking_in_tier ?? 0}RR
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded-md text-text-muted hover:text-text-primary hover:bg-base-600 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X size={14} strokeLinecap="round" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {sections.length === 0 ? (
            <p className="text-xs font-body text-text-muted italic text-center py-8">
              No additional info available for this player.
            </p>
          ) : (
            sections.map(({ mod, data }) => (
              <mod.DialogSection key={mod.id} player={player} data={data} />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
