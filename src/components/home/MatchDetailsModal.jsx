import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { computeScoreboardBadges } from "../../matchHighlights";
import { noAnim, T0 } from "../../utils/animation";
import { MODE_NAMES } from "../../utils/gameMode";
import { useAsyncEffect } from "../../hooks/useAsyncEffect";
import { formatError } from "../../utils/authError";
import { getCached, setCache } from "../../matchCache";
import { X } from "../../icons";
import { MatchScoreboardColumn } from "./MatchScoreboardColumn";
import { MatchRoundsStrip } from "./MatchRoundsStrip";

// Drill-down for one match row clicked on Home. Moved from HomePage.jsx in
// commit (#36 pure-move). Renders the scoreboard, per-round W/L strip, and
// header (map / mode / date / score). Name hydration: self → account cache →
// resolve_player_names batch (HomePage.jsx history at 0ce230d for the
// puuid-hex regression fix).
export function MatchDetailsModal({ match, maps, selfPuuid, selfName, selfTag, onClose }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);

  useAsyncEffect(
    async (isCancelled) => {
      try {
        const raw = await invoke("get_match_details", { matchId: match.matchId });
        if (isCancelled()) return;
        const parsed = JSON.parse(raw);

        const sourcePlayers = Array.isArray(parsed?.players) ? parsed.players : [];
        const hydrated = sourcePlayers.map((p) => {
          if (p?.gameName) return p;
          if (p?.subject === selfPuuid && selfName) {
            return { ...p, gameName: selfName, tagLine: selfTag || "" };
          }
          const cached = p?.subject ? getCached(p.subject, "account") : null;
          if (cached?.name) {
            return { ...p, gameName: cached.name, tagLine: cached.tag || "" };
          }
          return p;
        });

        setDetails({ ...parsed, players: hydrated });

        const needsResolve = hydrated
          .filter((p) => p?.subject && !p.gameName)
          .map((p) => p.subject);

        if (needsResolve.length > 0) {
          try {
            const rawNames = await invoke("resolve_player_names", { puuids: needsResolve });
            if (isCancelled()) return;
            const names = JSON.parse(rawNames);
            const byPuuid = new Map();
            for (const n of names || []) {
              if (n?.puuid && n.name) {
                byPuuid.set(n.puuid, { name: n.name, tag: n.tag || "" });
                setCache(n.puuid, "account", { name: n.name, tag: n.tag || "" });
              }
            }
            if (byPuuid.size > 0) {
              setDetails((prev) => {
                if (!prev) return prev;
                const patched = (prev.players || []).map((p) => {
                  if (p?.gameName || !p?.subject) return p;
                  const hit = byPuuid.get(p.subject);
                  return hit ? { ...p, gameName: hit.name, tagLine: hit.tag } : p;
                });
                return { ...prev, players: patched };
              });
            }
          } catch {
            // Name-service is best-effort; leave the puuid-hex fallback in place.
          }
        }
      } catch (e) {
        if (!isCancelled()) setError(formatError(e, "Failed to load"));
      }
    },
    [match.matchId, selfPuuid, selfName, selfTag]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mapData = maps[match.map];
  const mapName = mapData?.name || match.map || "Unknown map";
  const modeName = MODE_NAMES[match.queueId] || (match.queueId ? match.queueId : "Custom");
  const dateStr = match.dateMs ? new Date(match.dateMs).toLocaleString() : "";

  const roundsPlayed = Math.max(1, details?.matchInfo?.roundsPlayed || 0);
  const players = Array.isArray(details?.players) ? details.players : [];
  const teams = Array.isArray(details?.teams) ? details.teams : [];
  const roundResults = Array.isArray(details?.roundResults) ? details.roundResults : [];
  const scoreboardBadges = useMemo(() => computeScoreboardBadges(details), [details]);

  // Group by team. Deathmatch/escalation/etc. have no real team structure —
  // detect that and fall back to one flat sorted list. Also fall back when
  // we don't know who "self" is (offline-cached identity with no puuid):
  // an empty "Your team" column would just be confusing.
  const teamIds = new Set(players.map((p) => String(p.teamId || "").toLowerCase()));
  const hasTeams = !!selfPuuid && teams.length >= 2 && teamIds.size >= 2;
  const sortedFlat = [...players].sort((a, b) => (b.stats?.score || 0) - (a.stats?.score || 0));

  const selfPlayer = hasTeams ? players.find((p) => p.subject === selfPuuid) : null;
  const selfTeam = String(selfPlayer?.teamId || "").toLowerCase();

  let leftTeam = [];
  let rightTeam = [];
  let leftWon = false;
  let rightWon = false;
  if (hasTeams) {
    const otherTeam = teams.find((t) => String(t.teamId).toLowerCase() !== selfTeam)?.teamId;
    leftTeam = players
      .filter((p) => String(p.teamId || "").toLowerCase() === selfTeam)
      .sort((a, b) => (b.stats?.score || 0) - (a.stats?.score || 0));
    rightTeam = players
      .filter((p) => String(p.teamId || "").toLowerCase() !== selfTeam)
      .sort((a, b) => (b.stats?.score || 0) - (a.stats?.score || 0));
    leftWon = teams.find((t) => String(t.teamId).toLowerCase() === selfTeam)?.won === true;
    rightWon = teams.find((t) => t.teamId === otherTeam)?.won === true;
  }

  const resultText = match.won
    ? "VICTORY"
    : match.roundsWon === match.roundsLost
      ? "DRAW"
      : "DEFEAT";
  const resultColor = match.won
    ? "text-green-400"
    : match.roundsWon === match.roundsLost
      ? "text-text-muted"
      : "text-red-400";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-900/80 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={noAnim() ? T0 : { duration: 0.15 }}
        className="relative w-full max-w-3xl max-h-[85vh] rounded-xl border border-border bg-base-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative h-24 shrink-0 overflow-hidden border-b border-border">
          {mapData?.listIcon && (
            <img
              src={mapData.listIcon}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-25"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-base-900/95 via-base-900/70 to-base-900/50" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 text-text-muted hover:text-text-primary z-10"
          >
            <X size={18} />
          </button>
          <div className="relative h-full flex items-center px-5 gap-4">
            <div className="flex-1 min-w-0">
              <p className={`text-xl font-display font-bold ${resultColor}`}>{resultText}</p>
              <p className="text-sm font-display text-text-primary">
                {mapName} <span className="text-text-muted">·</span> {modeName}
              </p>
              <p className="text-[11px] font-body text-text-muted">{dateStr}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-display font-bold text-text-primary tabular-nums">
                {match.roundsWon} <span className="text-text-muted">-</span> {match.roundsLost}
              </p>
              <p className="text-[11px] font-mono text-text-muted">
                {match.kills}/{match.deaths}/{match.assists} K/D/A
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="px-3 py-2 rounded-md border border-val-red/40 bg-val-red/10 text-sm text-val-red">
              {error}
            </div>
          )}
          {!error && !details && (
            <div className="space-y-1.5 animate-pulse">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                <div key={i} className="h-9 rounded bg-base-700 border border-border" />
              ))}
            </div>
          )}
          {details && hasTeams && selfTeam && roundResults.length > 0 && (
            <MatchRoundsStrip
              rounds={roundResults}
              selfTeam={selfTeam}
              players={players}
              queueId={match.queueId}
            />
          )}
          {details && hasTeams && (
            <div className="grid grid-cols-2 gap-4">
              <MatchScoreboardColumn
                label={leftWon ? "Your team — won" : "Your team"}
                players={leftTeam}
                roundsPlayed={roundsPlayed}
                selfPuuid={selfPuuid}
                badges={scoreboardBadges}
              />
              <MatchScoreboardColumn
                label={rightWon ? "Enemy team — won" : "Enemy team"}
                players={rightTeam}
                roundsPlayed={roundsPlayed}
                selfPuuid={selfPuuid}
                badges={scoreboardBadges}
              />
            </div>
          )}
          {details && !hasTeams && (
            <MatchScoreboardColumn
              label={`${sortedFlat.length} players`}
              players={sortedFlat}
              roundsPlayed={roundsPlayed}
              selfPuuid={selfPuuid}
              badges={scoreboardBadges}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}
