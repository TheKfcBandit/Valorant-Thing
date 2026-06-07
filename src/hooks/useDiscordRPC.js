import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Persist the toggle + start/stop the backend RPC client.
function useDiscordRPCToggle({ discordRpc, addLog }) {
  useEffect(() => {
    localStorage.setItem("discord_rpc", String(discordRpc));
    if (discordRpc) {
      invoke("start_discord_rpc")
        .then(() => addLog("info", "[Discord] RPC connected"))
        .catch((e) => addLog("error", `[Discord] RPC start failed: ${e}`));
    } else {
      invoke("stop_discord_rpc").catch(() => {});
    }
  }, [discordRpc, addLog]);
}

// Discord Rich Presence presence builder. Ticks every 5s while RPC is
// on, deriving the "details" and "state" strings from app status, game
// phase, instalock/dodge feature flags, and live match info (score for
// in-game).
//
// Pulls live data from refs (gamePhase, rpcMatchInfo, instalockConfig,
// mapDodge) so the latest tick is always fresh without re-subscribing.
export function useDiscordRPC({
  status,
  discordRpc,
  instalockActive,
  mapDodgeActive,
  addLog,
  refs,
}) {
  useDiscordRPCToggle({ discordRpc, addLog });

  useEffect(() => {
    if (!discordRpc) return;
    const buildRpc = () => {
      let details = "In Lobby";
      let rpcState = "";

      if (status === "disconnected") {
        details = "Idle";
        rpcState = "App Open";
      } else if (status === "connecting") {
        details = "Connecting...";
      } else if (status === "waiting") {
        details = "Waiting for Valorant";
      } else if (status === "connected") {
        const phase = refs.gamePhase.current;
        const mi = refs.rpcMatchInfo.current;
        const features = [];

        if (instalockActive) {
          const cfg = refs.instalockConfig.current;
          const agentNames = new Set();
          if (cfg?.selectedAgent?.displayName && cfg.selectedAgent.displayName !== "none") {
            agentNames.add(cfg.selectedAgent.displayName);
          }
          if (cfg?.perMapSelections) {
            Object.values(cfg.perMapSelections).forEach((a) => {
              if (a?.displayName && a.displayName !== "none") agentNames.add(a.displayName);
            });
          }
          if (agentNames.size === 1) features.push(`Autolock: ${[...agentNames][0]}`);
          else if (agentNames.size > 1) features.push(`Autolocking ${agentNames.size} agents`);
        }
        if (mapDodgeActive) {
          const count = refs.mapDodge.current?.blacklist?.size || 0;
          if (count > 0) features.push(`Dodging ${count} map${count !== 1 ? "s" : ""}`);
        }

        if (phase === "pregame") {
          details = refs.lockedAgentName.current
            ? `Locked ${refs.lockedAgentName.current}`
            : "Agent Select";
          rpcState = features.length > 0 ? features.join(" · ") : "Picking agents...";
        } else if (phase === "ingame" && mi) {
          if (mi.isDeathmatch) {
            details = `In Game — ${mi.mode}`;
          } else {
            details = `In Game — ${mi.allyScore} - ${mi.enemyScore}`;
          }
          rpcState = mi.mode;
        } else {
          details = "In Lobby";
          rpcState = features.length > 0 ? features.join(" · ") : "Waiting for match";
        }
      }

      invoke("update_discord_rpc", {
        details,
        rpcState,
        largeImage: "valorant",
        largeText: "Valorant",
        smallImage: "logo",
        smallText: "Valorant Thing",
      }).catch(() => {});
    };
    buildRpc();
    const interval = setInterval(buildRpc, 5000);
    return () => clearInterval(interval);
  }, [status, discordRpc, instalockActive, mapDodgeActive, refs]);
}
