import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { resolveModeName } from "../utils/gameMode";
import { parseGamePod } from "../utils/gamePod";

const MATCH_POLL_INTERVAL = 1500;

// Self-rescheduling pre/in-game poller. Drives the instalock select/lock
// sequence, the map-dodge auto-quit, the match-found / locking / locked
// notification toasts, and auto-unqueue / auto-requeue side effects.
//
// The function is large because the state machine it implements is
// large — see the original App.jsx history before extraction. Refactor
// candidate when issue #14 ("shared health_check wrapper") lands.
export function useMatchPoller({
  status,
  instalockActive,
  mapDodgeActive,
  notificationsEnabled,
  player,
  addLog,
  pushNotification,
  setPregameMatchId,
  refs,
}) {
  // Mirror `player` into a ref so the poll closure reads the live value
  // without listing `player` in the effect deps (which would tear down
  // and restart the self-rescheduling poll chain on every health-check
  // tick — see useConnectionLifecycle's setPlayer in `check`).
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    if ((!instalockActive && !mapDodgeActive && !notificationsEnabled) || status !== "connected") {
      addLog(
        "info",
        `[Notif] Poll skipped: instalock=${instalockActive}, dodge=${mapDodgeActive}, notif=${notificationsEnabled}, status=${status}`
      );
      return;
    }
    addLog(
      "info",
      `[Notif] Poll started (instalock=${instalockActive}, dodge=${mapDodgeActive}, notif=${notificationsEnabled})`
    );
    let cancelled = false;

    const logOnce = (key, type, message, data) => {
      if (refs.lastLogKey.current === key) return;
      refs.lastLogKey.current = key;
      addLog(type, message, data);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const raw = await invoke("check_current_game");
        const match = JSON.parse(raw);
        const phase = match._phase === "pregame" ? "PREGAME" : "INGAME";
        const matchId = match.ID || match.MatchID;
        logOnce(
          `match:${matchId}:${phase}`,
          "match",
          `[${phase}] Match ${matchId} — Map: ${match.MapID}`,
          raw
        );

        const currentPhase = match._phase === "pregame" ? "pregame" : "ingame";
        refs.gamePhase.current = currentPhase;

        if (currentPhase === "ingame") {
          const mapData = refs.mapLookup.current[match.MapID?.toLowerCase()] || null;
          if (mapData) refs.currentMatchMap.current = mapData;
          const myPuuid = playerRef.current?.puuid;
          const me = (match.Players || []).find((p) => p.Subject === myPuuid);
          const myTeam = me?.TeamID;
          const blueTeam = (match.Teams || []).find((t) => t.TeamID === "Blue");
          const redTeam = (match.Teams || []).find((t) => t.TeamID === "Red");
          const allyScore =
            myTeam === "Blue" ? (blueTeam?.RoundsWon ?? 0) : (redTeam?.RoundsWon ?? 0);
          const enemyScore =
            myTeam === "Blue" ? (redTeam?.RoundsWon ?? 0) : (blueTeam?.RoundsWon ?? 0);
          const modeUrl = match.GameMode || "";
          const queueId = match.MatchmakingData?.QueueID || match.QueueID || "";
          const mode = resolveModeName(queueId, modeUrl);
          refs.rpcMatchInfo.current = {
            allyScore,
            enemyScore,
            mode,
            isDeathmatch: mode === "Deathmatch",
          };

          if (
            mode === "Deathmatch" &&
            refs.notifiedMatch.current !== matchId &&
            localStorage.getItem("notifications_enabled") !== "false"
          ) {
            refs.notifiedMatch.current = matchId;
            const podId = match.GamePodID || "";
            addLog(
              "info",
              `[Notif] Deathmatch detected — triggering match-found (match: ${matchId})`
            );
            pushNotification({
              id: `match-${matchId}`,
              type: "match-found",
              mapName: mapData?.displayName || "Unknown Map",
              mapImage: mapData?.listViewIcon || mapData?.splash || null,
              server: parseGamePod(podId),
              canDodge: false,
            });
          }
        } else {
          refs.rpcMatchInfo.current = null;
        }

        if (match._phase === "pregame") {
          setPregameMatchId(matchId);

          if (
            refs.notifiedMatch.current !== matchId &&
            localStorage.getItem("notifications_enabled") !== "false"
          ) {
            refs.notifiedMatch.current = matchId;
            const mapData = refs.mapLookup.current[match.MapID?.toLowerCase()] || null;
            const podId = match.GamePodID || "";
            const dodgeKeybindEnabled = localStorage.getItem("dodge_keybind_enabled") !== "false";
            const dodgeKeybind = dodgeKeybindEnabled
              ? localStorage.getItem("dodge_keybind") || "Ctrl+D"
              : null;
            addLog(
              "info",
              `[Notif] Pregame detected — triggering match-found (match: ${matchId}, map: ${mapData?.displayName || match.MapID})`
            );
            pushNotification({
              id: `match-${matchId}`,
              type: "match-found",
              mapName: mapData?.displayName || "Unknown Map",
              mapImage: mapData?.listViewIcon || mapData?.splash || null,
              server: parseGamePod(podId),
              canDodge: true,
              dodgeKeybind,
            });
          }

          if (refs.mapDodgeActive.current && refs.dodgedMatch.current !== matchId) {
            const dodgeCfg = refs.mapDodge.current;
            if (dodgeCfg.blacklist.has(match.MapID)) {
              refs.dodgedMatch.current = matchId;
              addLog("info", `Map blacklisted — auto-dodging ${match.MapID}`);
              try {
                await invoke("pregame_quit", { matchId });
                addLog("match", "Auto-dodged blacklisted map!");
                const dodgeMapData = refs.mapLookup.current[match.MapID?.toLowerCase()];
                pushNotification({
                  id: `dodge-${matchId}`,
                  type: "dodged",
                  reason: "map",
                  mapName: dodgeMapData?.displayName || match.MapID,
                });
                setPregameMatchId(null);
                refs.lockedMatch.current = null;
              } catch (dodgeErr) {
                const dodgeMsg =
                  typeof dodgeErr === "string" ? dodgeErr : dodgeErr?.message || "Dodge failed";
                addLog("error", `Auto-dodge failed: ${dodgeMsg}`);
              }
              if (!cancelled) setTimeout(poll, MATCH_POLL_INTERVAL);
              return;
            }
          }

          // Late-lock watcher: if we previously selected (last-second mode), check countdown.
          if (refs.pendingLock.current.has(matchId)) {
            if (match.PregameState !== "character_select_active") {
              // Phase ended (locked-in, dodged, or transitioned to ingame) — drop the entry.
              refs.pendingLock.current.delete(matchId);
            } else {
              const pending = refs.pendingLock.current.get(matchId);
              const remainingSec = (Number(match.PhaseTimeRemainingNS) || 0) / 1e9;
              if (remainingSec > 0 && remainingSec < 2.5) {
                refs.pendingLock.current.delete(matchId);
                try {
                  await invoke("lock_agent", { matchId, agentId: pending.agentId });
                  refs.lockedAgentName.current = pending.agentName;
                  addLog(
                    "match",
                    `Late-locked ${pending.agentName} at ${remainingSec.toFixed(2)}s remaining!`
                  );
                  if (localStorage.getItem("notifications_enabled") !== "false") {
                    pushNotification({
                      id: `lock-${matchId}`,
                      type: "locked",
                      agentName: pending.agentName,
                    });
                  }
                } catch (e) {
                  addLog("error", `Late-lock failed: ${e}`);
                }
              }
            }
          }

          if (
            instalockActive &&
            refs.lockedMatch.current !== matchId &&
            match.PregameState === "character_select_active"
          ) {
            const cfg = refs.instalockConfig.current;
            const mapEntry = cfg.maps.find((m) => m.mapUrl === match.MapID);
            const agent = mapEntry
              ? cfg.perMapSelections[mapEntry.uuid] || cfg.selectedAgent
              : cfg.selectedAgent;

            if (agent && agent.uuid === "none") {
              refs.lockedMatch.current = matchId;
              logOnce(`none:${matchId}`, "info", "Instalock disabled for this map (None selected)");
            } else if (agent) {
              refs.lockedMatch.current = matchId;
              const mode = refs.lockMode.current;
              const sd = refs.selectDelay.current;
              const ld = refs.lockDelay.current;
              const totalMs = mode === "instant" ? sd + ld : sd;
              if (localStorage.getItem("notifications_enabled") !== "false" && mode === "instant") {
                pushNotification({
                  id: `lock-${matchId}`,
                  type: "locking",
                  agentName: agent.displayName,
                  totalMs,
                  startTime: Date.now(),
                });
              }
              addLog("info", `Selecting ${agent.displayName} in ${sd}ms (mode: ${mode})`);
              await new Promise((r) => setTimeout(r, sd));
              if (cancelled) return;
              await invoke("select_agent", { matchId, agentId: agent.uuid });

              if (mode === "instant") {
                addLog("info", `Selected — locking in ${ld}ms`);
                await new Promise((r) => setTimeout(r, ld));
                if (cancelled) return;
                await invoke("lock_agent", { matchId, agentId: agent.uuid });
                refs.lockedAgentName.current = agent.displayName;
                addLog("match", `Locked ${agent.displayName}!`);
                if (localStorage.getItem("notifications_enabled") !== "false") {
                  pushNotification({
                    id: `lock-${matchId}`,
                    type: "locked",
                    agentName: agent.displayName,
                  });
                }
              } else if (mode === "last-second") {
                refs.pendingLock.current.set(matchId, {
                  agentId: agent.uuid,
                  agentName: agent.displayName,
                });
                refs.lockedAgentName.current = agent.displayName;
                addLog(
                  "info",
                  `Selected ${agent.displayName} — will lock at countdown end (~2s remaining)`
                );
              } else {
                // select-only
                refs.lockedAgentName.current = agent.displayName;
                addLog("info", `Selected ${agent.displayName} — auto-lock disabled, lock manually`);
              }
            } else {
              logOnce(`noagent:${matchId}`, "info", "No agent configured for this map");
            }
          }
        } else {
          setPregameMatchId(null);
        }
      } catch (err) {
        const msg = typeof err === "string" ? err : err?.message || "Unknown error";
        if (!msg.includes("Not in a match")) {
          addLog("error", msg);
        } else {
          handleOutOfMatch({ refs, addLog, pushNotification, isCancelled: () => cancelled });
          logOnce("not_in_match", "info", "Not in a match");
          setPregameMatchId(null);
          refs.lockedMatch.current = null;
          refs.lockedAgentName.current = null;
          refs.rpcMatchInfo.current = null;
          refs.dodgedMatch.current = null;
          refs.notifiedMatch.current = null;
          if (refs.pendingLock.current.size > 0) refs.pendingLock.current.clear();
        }
      }
      if (!cancelled) setTimeout(poll, MATCH_POLL_INTERVAL);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [instalockActive, mapDodgeActive, notificationsEnabled, status, addLog]);
}

// Out-of-match side effects: auto-unqueue after dodge, auto-requeue after
// match end. Both gated on "I am party leader" — the party endpoint can
// only be hit from the leader.
//
// `isCancelled` is the parent effect's teardown signal — if the user
// toggled instalock/dodge/notifications off mid-Promise, we must NOT
// fire the queue action, or they'd see a surprise leave/enter after
// explicitly disabling the feature.
function handleOutOfMatch({ refs, addLog, pushNotification, isCancelled }) {
  const prevPhase = refs.gamePhase.current;
  refs.gamePhase.current = null;

  if (prevPhase === "pregame" && refs.autoUnqueue.current) {
    addLog(
      "info",
      `[Misc] Dodge detected (phase: ${prevPhase} → none) — waiting for confirmed out-of-match`
    );
    refs.pendingUnqueue.current = true;
  } else if (prevPhase === "pregame") {
    addLog("info", `[Misc] Dodge detected but auto-unqueue is off`);
  }
  if (prevPhase === "ingame" && refs.autoRequeue.current) {
    addLog(
      "info",
      `[Misc] Match ended (phase: ${prevPhase} → none) — waiting for confirmed out-of-match`
    );
    refs.pendingRequeue.current = true;
  } else if (prevPhase === "ingame") {
    addLog("info", `[Misc] Match ended but auto-requeue is off`);
  }

  if (!prevPhase && refs.pendingUnqueue.current) {
    refs.pendingUnqueue.current = false;
    addLog("info", "[Misc] Confirmed out-of-match — checking party leader for unqueue");
    invoke("get_party")
      .then((raw) => {
        if (isCancelled()) return;
        const party = JSON.parse(raw);
        const me = party.members?.find((m) => m.puuid === party.my_puuid);
        if (!me?.is_owner) {
          addLog("info", "[Misc] Not party leader — skipping unqueue");
          return;
        }
        return invoke("leave_queue").then(() => {
          if (isCancelled()) return;
          addLog("info", "[Misc] Successfully left queue after dodge");
          pushNotification({
            id: `queue-unqueue-${Date.now()}`,
            type: "queue",
            action: "unqueue",
          });
        });
      })
      .catch((e) => {
        if (isCancelled()) return;
        addLog("error", `[Misc] Unqueue failed: ${e}`);
      });
  }
  if (!prevPhase && refs.pendingRequeue.current) {
    refs.pendingRequeue.current = false;
    addLog("info", "[Misc] Confirmed out-of-match — checking party leader for requeue");
    invoke("get_party")
      .then((raw) => {
        if (isCancelled()) return;
        const party = JSON.parse(raw);
        const me = party.members?.find((m) => m.puuid === party.my_puuid);
        if (!me?.is_owner) {
          addLog("info", "[Misc] Not party leader — skipping requeue");
          return;
        }
        return invoke("enter_queue").then(() => {
          if (isCancelled()) return;
          addLog("info", "[Misc] Successfully requeued after match");
          pushNotification({
            id: `queue-requeue-${Date.now()}`,
            type: "queue",
            action: "requeue",
          });
        });
      })
      .catch((e) => {
        if (isCancelled()) return;
        addLog("error", `[Misc] Requeue failed: ${e}`);
      });
  }
}
