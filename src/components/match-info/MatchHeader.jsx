import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { parseGamePod } from "../../utils/gamePod";
import { LogOut, Spinner } from "../../icons";

export function MatchHeader({
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
