import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { normalizeMenuVideoConfig } from "../utils/menuVideo";

const RECONNECT_INTERVAL = 3000;
const HEALTH_CHECK_INTERVAL = 10000;

// Owns the connect → connected → waiting → connected lifecycle plus the
// reauth banner state (#26 rung-3) and identity cache hydration. The
// callbacks (`doConnect`, `confirmRefresh`, `doOAuthSignin`,
// `doOAuthSignout`, `handleRefreshClick`) are exposed for UI buttons.
//
// `setRefreshKey` is a bump used by HomePage/PremierPage to force a
// re-fetch when the user clicks Refresh — kept external because both
// pages key off it independently.
export function useConnectionLifecycle({ addLog, setRefreshKey }) {
  const [status, setStatus] = useState("waiting");
  const [player, setPlayer] = useState(null);
  const [playerIsStale, setPlayerIsStale] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [splooshimaAvailable, setSplooshimaAvailable] = useState(true);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [tokenAge, setTokenAge] = useState(0);

  const connectingRef = useRef(false);

  // Phase A of #18: hydrate `player` from the on-disk identity cache so
  // the home page + dependent UI render last-seen state before (and
  // instead of) a live connect.
  useEffect(() => {
    if (player) return;
    invoke("get_cached_identity")
      .then((snap) => {
        if (!snap) return;
        setPlayer({
          puuid: snap.puuid,
          game_name: snap.game_name,
          game_tag: snap.game_tag,
          region: snap.region,
          shard: snap.shard,
          client_version: snap.client_version,
          player_card_url: snap.player_card_url,
          saved_at_ms: snap.saved_at_ms,
        });
        setPlayerIsStale(true);
      })
      .catch((e) => console.warn("[IdentityCache] hydrate failed:", e));
    // `status` was originally included here but is unread — would
    // re-fire on every connect cycle and waste IPC round trips.
  }, [player]);

  useEffect(() => {
    const unlisten = listen("oauth-needs-reauth", () => {
      setNeedsReauth(true);
      setPlayer(null);
      setStatus("waiting");
      addLog("error", "[OAuth] Session expired and silent refresh failed; re-sign-in required");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addLog]);

  // Phase B fix-pass (#11): the listener above is a fast-path hint — Tauri
  // events don't buffer for absent listeners. State-poll get_oauth_state
  // as the canonical truth.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await invoke("get_oauth_state");
        if (cancelled) return;
        if (s === "needs-reauth") setNeedsReauth(true);
        else if (s === "active") setNeedsReauth(false);
      } catch {
        // Backend may not be ready on first ticks; silent retry.
      }
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const doConnect = async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setStatus("connecting");
    addLog("info", "[Connect] Attempting to connect to Riot Client...");
    try {
      const running = await invoke("is_valorant_running");
      if (!running) {
        addLog("error", "[Connect] Valorant and Riot Client must both be running");
        setStatus("waiting");
        connectingRef.current = false;
        return;
      }
      const info = await invoke("connect");
      setPlayer(info);
      setPlayerIsStale(false);
      setStatus("connected");
      setRefreshKey((k) => k + 1);
      addLog(
        "info",
        `[Connect] Connected as ${info.game_name}#${info.game_tag} (${info.puuid?.slice(0, 8)}...)`
      );
      if (info.rso_debug) {
        try {
          addLog("info", "RSO Userinfo (auth.riotgames.com/userinfo)", JSON.parse(info.rso_debug));
        } catch {
          addLog("info", "RSO Userinfo", info.rso_debug);
        }
      }
      if (info.loadout_debug) {
        try {
          addLog("info", "PD Player Loadout (playerloadout)", JSON.parse(info.loadout_debug));
        } catch {
          addLog("info", "PD Player Loadout", info.loadout_debug);
        }
      }
      const sKey = localStorage.getItem("splooshima_api_key") || "";
      if (sKey && info.puuid) {
        try {
          await invoke("splooshima_lookup", { puuids: [info.puuid], apiKey: sKey });
          setSplooshimaAvailable(true);
          addLog("info", "[Splooshima] Health check passed — available this session");
        } catch (sErr) {
          setSplooshimaAvailable(false);
          addLog(
            "error",
            `[Splooshima] Health check failed — Splooshima unavailable this session: ${sErr}`
          );
        }
      }
    } catch (err) {
      const errMsg = typeof err === "string" ? err : err?.message || String(err);
      addLog("error", `[Connect] Failed: ${errMsg}`);
      console.error("[connect]", err);
      setStatus("waiting");
    } finally {
      connectingRef.current = false;
    }
  };

  useEffect(() => {
    if (!showRefreshModal) return;
    const id = setInterval(() => setTokenAge((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [showRefreshModal]);

  const handleRefreshClick = async () => {
    if (status !== "connected") {
      doConnect();
      return;
    }
    try {
      const age = await invoke("get_token_age");
      setTokenAge(Number(age));
    } catch {
      setTokenAge(0);
    }
    setShowRefreshModal(true);
  };

  const confirmRefresh = async () => {
    setShowRefreshModal(false);
    try {
      await invoke("disconnect");
    } catch (e) {
      console.warn("[App] suppressed:", e);
    }
    setPlayer(null);
    setStatus("waiting");
    doConnect();
  };

  // Phase B (#26): webview OAuth sign-in. Pops Riot's official login page
  // and, on success, lights up ConnectionState the same way doConnect does.
  const doOAuthSignin = async () => {
    addLog("info", "[OAuth] Opening Riot sign-in webview...");
    setNeedsReauth(false);
    try {
      const info = await invoke("oauth_signin");
      setPlayer(info);
      setPlayerIsStale(false);
      setStatus("connected");
      setRefreshKey((k) => k + 1);
      addLog("info", `[OAuth] Signed in as ${info.game_name}#${info.game_tag}`);
    } catch (err) {
      const errMsg = typeof err === "string" ? err : err?.message || String(err);
      addLog("error", `[OAuth] Sign-in failed: ${errMsg}`);
      throw err;
    }
  };

  const doOAuthSignout = async () => {
    try {
      await invoke("oauth_signout");
    } catch (e) {
      addLog("error", `[OAuth] Sign-out: ${e}`);
    }
    setPlayer(null);
    setStatus("waiting");
    addLog("info", "[OAuth] Signed out, cookies wiped");
  };

  // Reconnect poll while we're waiting for the Riot Client to come up.
  useEffect(() => {
    if (status !== "waiting") return;
    let cancelled = false;
    addLog("info", "[Connect] Waiting for Valorant process...");
    const check = async () => {
      if (cancelled) return;
      try {
        const running = await invoke("is_valorant_running");
        if (running && !cancelled) {
          addLog("info", "[Connect] Valorant detected, connecting...");
          doConnect();
        }
      } catch (err) {
        const errMsg = typeof err === "string" ? err : err?.message || String(err);
        addLog("error", `[Connect] is_valorant_running check failed: ${errMsg}`);
      }
    };
    check();
    const timer = setInterval(check, RECONNECT_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status]);

  // Health check while connected. Also runs the menu-video re-restore
  // pass — if Riot reverted the user's custom menu video file (happens
  // after patches), copy the backup back over.
  useEffect(() => {
    if (status !== "connected") return;
    const check = async () => {
      try {
        const info = await invoke("health_check");
        if (info) {
          setPlayer(info);
        } else {
          addLog("error", "[Health] Riot Client API returned null — connection lost");
          setPlayer(null);
          setStatus("waiting");
        }
      } catch (err) {
        const errMsg = typeof err === "string" ? err : err?.message || String(err);
        addLog("error", `[Health] Health check failed: ${errMsg}`);
        setPlayer(null);
        setStatus("waiting");
      }
      try {
        await invoke("check_loadout");
      } catch (err) {
        const errMsg = typeof err === "string" ? err : err?.message || String(err);
        addLog("error", `[Loadout] PD loadout check failed: ${errMsg}`);
      }
      try {
        const raw = localStorage.getItem("menu_video_config");
        if (raw) {
          const cfg = normalizeMenuVideoConfig(JSON.parse(raw));
          if (cfg?.sourceBackupPath && Array.isArray(cfg.replacedFiles)) {
            let restoredAny = false;
            for (const file of cfg.replacedFiles) {
              const currentHash = await invoke("compute_file_hash", { path: file.destPath }).catch(
                () => ""
              );
              if (!currentHash || currentHash === file.hash) continue;
              await invoke("force_copy_file", {
                source: cfg.sourceBackupPath,
                dest: file.destPath,
              });
              restoredAny = true;
            }
            if (restoredAny) {
              addLog(
                "info",
                "[Video] Menu videos were reverted by game, so the custom replacements were restored"
              );
            }
          }
        }
      } catch (e) {
        console.warn("[App] suppressed:", e);
      }
    };
    const timer = setInterval(check, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [status]);

  return {
    status,
    setStatus,
    player,
    setPlayer,
    playerIsStale,
    needsReauth,
    splooshimaAvailable,
    showRefreshModal,
    setShowRefreshModal,
    tokenAge,
    doConnect,
    confirmRefresh,
    handleRefreshClick,
    doOAuthSignin,
    doOAuthSignout,
  };
}
