import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCached, setCache } from "../matchCache";
import { normalizeSeasonalPeak } from "../riotShapes";

// Owns the live-match roster and the name/level/MMR resolution pipeline:
// Riot name-service → match-history level backfill for hidden levels →
// Splooshima fallback for both → per-player MMR fetch → Splooshima MMR
// bulk fallback. Extracted from MatchInfoPage's fetchMatchData; results
// land in matchCache so a re-entered match resolves instantly.
export function useLiveMatchPlayers({ splooshimaApiKey, splooshimaAvailable, addLog }) {
  const [players, setPlayers] = useState([]);
  const [fetching, setFetching] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const reset = useCallback(() => {
    setPlayers([]);
    setFetching(false);
  }, []);

  // Same-match poll tick: refresh the mutable roster fields without
  // discarding resolved accounts/MMR.
  const refreshRoster = useCallback((playerList) => {
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
  }, []);

  const ingestNewMatch = useCallback(
    async (playerList) => {
      const withCached = playerList.map((p) => ({
        ...p,
        account: getCached(p.puuid, "account") || null,
        mmr: getCached(p.puuid, "mmr") || null,
        _loading: !getCached(p.puuid, "account"),
      }));
      setPlayers(withCached);

      const needsAccount = withCached.filter((p) => !p.account);
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
                const raw = await invoke("get_player_level_from_history", {
                  targetPuuid: p.puuid,
                });
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

      const fetchMmr = (puuid) =>
        invoke("get_player_mmr", { targetPuuid: puuid })
          .then((raw) => {
            const json = JSON.parse(raw);
            const tier = json.currenttier || 0;
            const rr = json.ranking_in_tier || 0;
            if (tier === 0 && rr === 0) return { puuid, data: null, needsFallback: true };
            const peak = normalizeSeasonalPeak(json.raw);
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
    },
    [splooshimaApiKey, splooshimaAvailable, addLog]
  );

  return { players, fetching, reset, refreshRoster, ingestNewMatch };
}
