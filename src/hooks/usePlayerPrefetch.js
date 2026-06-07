import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCached, setCache } from "../matchCache";

const PREFETCH_INTERVAL = 250;

// Background prefetcher for the live match-info page. Polls
// `check_current_game` every 250ms and, when a new pregame/coregame is
// detected, kicks off a Splooshima batch lookup for every player in
// the match that isn't already cached. The resolved entries land in
// `matchCache` so MatchInfoPage can render names + ranks without a
// per-row roundtrip.
//
// Splooshima is a soft dependency: when no key is set or the session's
// health check failed, this hook becomes a no-op and MatchInfoPage
// falls back to whatever Riot exposes directly.
export function usePlayerPrefetch({ status, addLog, refs }) {
  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;

    const prefetch = async () => {
      if (cancelled) return;
      try {
        const raw = await invoke("check_current_game");
        const match = JSON.parse(raw);
        const matchId = match.ID || match.MatchID;
        // Riot returns transitional payloads where ID/MatchID are
        // temporarily missing (pregame→ingame switchover). Without
        // this guard the slice() below throws, the catch swallows it,
        // and we re-fire every 250ms hammering check_current_game.
        if (!matchId) return;
        const phase = match._phase === "pregame" ? "PREGAME" : "INGAME";
        const key = `${matchId}_${phase}`;
        if (refs.prefetchedMatch.current === key) return;

        const rawPlayers =
          phase === "PREGAME" ? match.AllyTeam?.Players || [] : match.Players || [];

        const puuids = rawPlayers
          .map((p) => p.Subject)
          .filter((id) => id && !getCached(id, "account"));

        if (puuids.length === 0) {
          refs.prefetchedMatch.current = key;
          return;
        }

        addLog(
          "info",
          `[Prefetch] Match ${matchId.slice(0, 8)}… found — resolving ${puuids.length} players`
        );
        const resolved = {};

        const sKey = refs.splooshimaApiKey.current;
        const sAvail = refs.splooshimaAvailable.current;
        if (sKey && sAvail) {
          try {
            const sRaw = await invoke("splooshima_lookup", { puuids, apiKey: sKey });
            if (cancelled) return;
            const sData = JSON.parse(sRaw);
            (sData?.results || []).forEach((r) => {
              const entry = {
                name: r.gameName,
                tag: r.tagLine,
                account_level: r.level != null ? r.level : null,
              };
              resolved[r.puuid] = entry;
              setCache(r.puuid, "account", entry);
              if (r.currentTier != null) {
                setCache(r.puuid, "mmr", {
                  currenttier: r.currentTier || 0,
                  ranking_in_tier: r.currentRR || 0,
                  peaktier: r.peakTier || 0,
                  peak_rr: r.peakRR || 0,
                });
              }
            });
            addLog(
              "info",
              `[Prefetch] Splooshima resolved ${sData.found ?? 0}/${sData.requested ?? 0}`
            );
          } catch (e) {
            addLog("error", `[Prefetch] Splooshima failed: ${e}`);
          }
        }

        refs.prefetchedMatch.current = key;
        addLog("info", `[Prefetch] Done — ${Object.keys(resolved).length} accounts cached`);
      } catch (e) {
        console.warn("[App] suppressed:", e);
      }
    };

    prefetch();
    const timer = setInterval(prefetch, PREFETCH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, addLog, refs]);
}
