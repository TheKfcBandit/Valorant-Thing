import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { MotionConfig, AnimatePresence } from "framer-motion";

import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import FakeStatusPage from "./components/FakeStatusPage";

import ResizeGutters from "./components/app/ResizeGutters";
import NodeJsModal from "./components/app/NodeJsModal";
import UpdateModal from "./components/app/UpdateModal";
import RefreshTokenModal from "./components/app/RefreshTokenModal";
import UnsavedChangesModal from "./components/app/UnsavedChangesModal";
import PageRouter from "./components/app/PageRouter";
import { buildPages } from "./components/app/buildPages";

import { getMaps } from "./valApiSkins";
import { buildGradientCSS } from "./themes";

import { useConnectionLifecycle } from "./hooks/useConnectionLifecycle";
import { useNotificationOverlay } from "./hooks/useNotificationOverlay";
import { useMatchPoller } from "./hooks/useMatchPoller";
import { useDodgeKeybind } from "./hooks/useDodgeKeybind";
import { useDiscordRPC } from "./hooks/useDiscordRPC";
import { useWishlistSync } from "./hooks/useWishlistSync";
import { useSpikeTimer } from "./hooks/useSpikeTimer";
import { usePlayerPrefetch } from "./hooks/usePlayerPrefetch";
import { useTheme } from "./hooks/useTheme";
import { useSharedRefs } from "./hooks/useSharedRefs";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [showLogs, setShowLogs] = useState(() => localStorage.getItem("show_logs") === "true");
  const [devTab, setDevTab] = useState(() => localStorage.getItem("dev_tab_enabled") === "true");
  const [startWithWindows, setStartWithWindows] = useState(
    () => localStorage.getItem("start_with_windows") === "true"
  );
  const [startMinimized, setStartMinimized] = useState(
    () => localStorage.getItem("start_minimized") === "true"
  );
  const [minimizeToTray, setMinimizeToTray] = useState(
    () => localStorage.getItem("minimize_to_tray") === "true"
  );
  const [closeWithGame, setCloseWithGame] = useState(
    () => localStorage.getItem("close_with_game") === "true"
  );
  const [discordRpc, setDiscordRpc] = useState(
    () => localStorage.getItem("discord_rpc") !== "false"
  );
  const [nodeInstalled, setNodeInstalled] = useState(true);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showOlderReleases, setShowOlderReleases] = useState(false);
  const [fakeStatusUnsaved, setFakeStatusUnsaved] = useState(false);
  const [unsavedModal, setUnsavedModal] = useState(null);
  const fakeStatusActionRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [instalockActive, setInstalockActive] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("instalock-config"))?.active || false;
    } catch {
      return false;
    }
  });
  localStorage.removeItem("henrik_api_key");
  const [splooshimaApiKey, setSplooshimaApiKey] = useState(
    () => localStorage.getItem("splooshima_api_key") || ""
  );
  const [mapDodgeActive, setMapDodgeActive] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("mapdodge-config"))?.active || false;
    } catch {
      return false;
    }
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem("notifications_enabled") !== "false"
  );
  const [notificationPosition, setNotificationPosition] = useState(
    () => localStorage.getItem("notification_position") || "top-right"
  );
  const [notificationScreen, setNotificationScreen] = useState(
    () => localStorage.getItem("notification_screen") || "game"
  );
  const [spikeTimerEnabled, setSpikeTimerEnabled] = useState(
    () => localStorage.getItem("spike_timer_enabled") !== "false"
  );
  const [pregameMatchId, setPregameMatchId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoUnqueue, setAutoUnqueue] = useState(
    () => localStorage.getItem("auto_unqueue") === "true"
  );
  const [autoRequeue, setAutoRequeue] = useState(
    () => localStorage.getItem("auto_requeue") === "true"
  );
  const [selectDelay, setSelectDelay] = useState(() => {
    const saved = localStorage.getItem("instalock_select_delay");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lockDelay, setLockDelay] = useState(() => {
    const saved = localStorage.getItem("instalock_lock_delay");
    return saved ? parseInt(saved, 10) : 500;
  });
  const [lockMode, setLockMode] = useState(() => {
    const saved = localStorage.getItem("instalock_lock_mode");
    return saved && ["instant", "last-second", "select-only"].includes(saved) ? saved : "instant";
  });

  const initialMapDodge = (() => {
    try {
      const cfg = JSON.parse(localStorage.getItem("mapdodge-config"));
      return { blacklist: new Set(cfg?.blacklist || []), maps: [] };
    } catch {
      return { blacklist: new Set(), maps: [] };
    }
  })();

  // Refs declared early so any useEffect below can read them without
  // hitting TDZ if the effect were ever switched to useLayoutEffect or
  // hoisted into a custom hook.
  const refs = useSharedRefs({
    initialMapDodge,
    mapDodgeActive,
    autoUnqueue,
    autoRequeue,
    selectDelay,
    lockDelay,
    lockMode,
    splooshimaApiKey,
    splooshimaAvailable: true, // initial — real value mirrored below
  });

  const addLog = useCallback((type, message, data) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.message === message) return prev;
      return [...prev.slice(-200), { time, type, message, data }];
    });
  }, []);

  const {
    status,
    player,
    playerIsStale,
    needsReauth,
    splooshimaAvailable,
    showRefreshModal,
    setShowRefreshModal,
    tokenAge,
    confirmRefresh,
    handleRefreshClick,
    doOAuthSignin,
    doOAuthSignout,
  } = useConnectionLifecycle({ addLog, setRefreshKey });

  const { pushNotification, destroyNotifWindow } = useNotificationOverlay({ addLog });

  const {
    theme,
    setTheme,
    simplifiedTheme,
    setSimplifiedTheme,
    customTheme,
    setCustomTheme,
    disableAnimations,
    setDisableAnimations,
  } = useTheme();

  // Load the map catalog into mapLookupRef so the poller can render
  // names and splash images for the match-found toast. Also hydrate the
  // instalock per-map selections so the locked-in agent for the current
  // map is known before the first poll.
  useEffect(() => {
    const EXCLUDED = ["The Range", "Basic Training"];
    getMaps()
      .then((rawMaps) => {
        const lookup = {};
        for (const m of rawMaps) {
          if (m.mapUrl) lookup[m.mapUrl.toLowerCase()] = m;
        }
        refs.mapLookup.current = lookup;
        const cfg = (() => {
          try {
            return JSON.parse(localStorage.getItem("instalock-config"));
          } catch {
            return null;
          }
        })();
        if (!cfg) return;
        const maps = rawMaps.filter((m) => !EXCLUDED.includes(m.displayName));
        const perMap = {};
        if (cfg.perMap) {
          for (const [mapId, saved] of Object.entries(cfg.perMap)) {
            if (saved) perMap[mapId] = saved;
          }
        }
        refs.instalockConfig.current = {
          maps,
          selectedAgent: cfg.defaultAgent || null,
          perMapSelections: perMap,
        };
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (startMinimized) {
      getCurrentWindow().hide();
      import("@tauri-apps/plugin-notification")
        .then(({ sendNotification }) => {
          sendNotification({ title: "Valorant Thing", body: "Started in system tray." });
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    invoke("check_node_installed")
      .then((ok) => setNodeInstalled(ok))
      .catch(() => setNodeInstalled(false));
  }, []);

  useEffect(() => {
    invoke("check_for_update")
      .then((raw) => {
        try {
          const data = JSON.parse(raw);
          if (data.update && data.download_url) {
            setUpdateInfo(data);
            const skipped = localStorage.getItem("skipped_update_version");
            if (skipped !== data.latest) setShowUpdateModal(true);
          }
        } catch (e) {
          console.warn("[App] suppressed:", e);
        }
      })
      .catch(() => {});
  }, []);

  // "Close with game" auto-quit. Polls is_valorant_running every 10s
  // and exits the app once Valorant disappears, but only after we've
  // been connected at least once (so the app doesn't immediately quit
  // when launched from cold).
  const closeWithGameRef = useRef(closeWithGame);
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    closeWithGameRef.current = closeWithGame;
    localStorage.setItem("close_with_game", String(closeWithGame));
  }, [closeWithGame]);
  useEffect(() => {
    if (status === "connected") wasConnectedRef.current = true;
  }, [status]);

  useEffect(() => {
    if (!closeWithGame) return;
    if (status !== "connected" && status !== "waiting") return;
    if (status === "waiting" && !wasConnectedRef.current) return;
    const id = setInterval(async () => {
      if (!closeWithGameRef.current) return;
      try {
        const running = await invoke("is_valorant_running");
        if (!running) await invoke("exit_app");
      } catch (e) {
        console.warn("[App] suppressed:", e);
      }
    }, 10000);
    return () => clearInterval(id);
  }, [closeWithGame, status]);

  // Ctrl+Shift+I toggles devtools; window.__VT_DEV() toggles the hidden
  // dev tab — useful for debugging without touching localStorage.
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "I") {
        e.preventDefault();
        invoke("toggle_devtools");
      }
    };
    window.addEventListener("keydown", handler);
    window.__VT_DEV = (on) => {
      const val = on === undefined ? localStorage.getItem("dev_tab_enabled") !== "true" : !!on;
      localStorage.setItem("dev_tab_enabled", String(val));
      setDevTab(val);
    };
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Sync the live splooshima availability (provided by useConnectionLifecycle)
  // into the refs bag that the prefetcher reads. The hoisted useSharedRefs
  // call above seeded `true`; this keeps it honest.
  useEffect(() => {
    refs.splooshimaAvailable.current = splooshimaAvailable;
  }, [splooshimaAvailable, refs.splooshimaAvailable]);

  useEffect(() => {
    const unlisten = listen("backend-log", (event) => {
      const { log_type, message } = event.payload;
      if (message && message.startsWith("[XMPP]")) return;
      addLog(log_type || "info", message);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addLog]);

  useDiscordRPC({ status, discordRpc, instalockActive, mapDodgeActive, addLog, refs });
  useMatchPoller({
    status,
    instalockActive,
    mapDodgeActive,
    notificationsEnabled,
    player,
    addLog,
    pushNotification,
    setPregameMatchId,
    refs,
  });
  useDodgeKeybind({
    pregameMatchId,
    addLog,
    pushNotification,
    setPregameMatchId,
    lockedMatchRef: refs.lockedMatch,
  });
  useWishlistSync({ status, pushNotification });
  useSpikeTimer({ spikeTimerEnabled, pushNotification });
  usePlayerPrefetch({ status, addLog, refs });

  const handleDodge = async () => {
    if (!pregameMatchId) return;
    try {
      await invoke("pregame_quit", { matchId: pregameMatchId });
      addLog("info", `Dodged match ${pregameMatchId}`);
      pushNotification({ id: `dodge-${pregameMatchId}`, type: "dodged", reason: "manual" });
      setPregameMatchId(null);
      refs.lockedMatch.current = null;
    } catch (err) {
      const msg = typeof err === "string" ? err : err?.message || "Dodge failed";
      addLog("error", `Dodge failed: ${msg}`);
    }
  };

  const onTabChange = (tab) => {
    if (fakeStatusUnsaved && activeTab === "fakestatus" && tab !== "fakestatus") {
      setUnsavedModal(tab);
      return;
    }
    setActiveTab(tab);
  };

  const pages = buildPages({
    activeTab,
    status,
    player,
    playerIsStale,
    refreshKey,
    confirmRefresh,
    splooshimaApiKey,
    splooshimaAvailable,
    addLog,
    setInstalockActive,
    setMapDodgeActive,
    autoUnqueue,
    setAutoUnqueue,
    autoRequeue,
    setAutoRequeue,
    showLogs,
    devTab,
    logs,
    setLogs,
    pushNotification,
    refs,
    settings: {
      player,
      status,
      doOAuthSignin,
      doOAuthSignout,
      showLogs,
      setShowLogs,
      selectDelay,
      setSelectDelay,
      lockDelay,
      setLockDelay,
      lockMode,
      setLockMode,
      splooshimaApiKey,
      setSplooshimaApiKey,
      theme,
      setTheme,
      simplifiedTheme,
      setSimplifiedTheme,
      customTheme,
      setCustomTheme,
      disableAnimations,
      setDisableAnimations,
      startWithWindows,
      setStartWithWindows,
      startMinimized,
      setStartMinimized,
      minimizeToTray,
      setMinimizeToTray,
      discordRpc,
      setDiscordRpc,
      closeWithGame,
      setCloseWithGame,
      updateInfo,
      setShowUpdateModal,
      notificationsEnabled,
      setNotificationsEnabled,
      notificationPosition,
      setNotificationPosition,
      notificationScreen,
      setNotificationScreen,
      destroyNotifWindow,
      spikeTimerEnabled,
      setSpikeTimerEnabled,
    },
  });

  return (
    <MotionConfig reducedMotion={disableAnimations ? "always" : "never"}>
      <div
        className={`w-full h-full rounded-xl overflow-hidden border border-border flex flex-col shadow-2xl ${simplifiedTheme ? "bg-base-800" : ""}`}
        style={
          !simplifiedTheme
            ? {
                background:
                  theme === "custom"
                    ? buildGradientCSS(customTheme)
                    : "linear-gradient(135deg, transparent 0%, rgb(var(--val-red) / 0.18) 100%), rgb(var(--base-900))",
              }
            : undefined
        }
      >
        <ResizeGutters />
        <TitleBar simplifiedTheme={simplifiedTheme} minimizeToTray={minimizeToTray} />
        {!nodeInstalled && <NodeJsModal />}
        <AnimatePresence>
          {updateInfo && showUpdateModal && (
            <UpdateModal
              updateInfo={updateInfo}
              updating={updating}
              setUpdating={setUpdating}
              showOlderReleases={showOlderReleases}
              setShowOlderReleases={setShowOlderReleases}
              onClose={() => setShowUpdateModal(false)}
              onSkip={() => {
                localStorage.setItem("skipped_update_version", updateInfo.latest);
                setShowUpdateModal(false);
              }}
            />
          )}
        </AnimatePresence>
        <div className="flex flex-1 min-h-0">
          <Sidebar
            status={status}
            player={player}
            onReconnect={handleRefreshClick}
            activeTab={activeTab}
            onTabChange={onTabChange}
            showLogs={showLogs}
            devTab={devTab}
            pregameMatchId={pregameMatchId}
            onDodge={handleDodge}
            simplifiedTheme={simplifiedTheme}
          />
          <main className="flex-1 flex min-h-0 relative">
            {needsReauth && (
              <div className="absolute top-0 left-0 right-0 z-40 px-4 py-2 bg-yellow-500/15 border-b border-yellow-500/40 flex items-center justify-between gap-3">
                <p className="text-xs font-body text-yellow-300">
                  Your Riot session expired and couldn&apos;t be refreshed silently. Sign in again
                  to restore live data.
                </p>
                <button
                  onClick={doOAuthSignin}
                  className="px-3 py-1 rounded-md text-[11px] font-display font-semibold border border-yellow-500/50 bg-yellow-500/20 text-yellow-200 hover:bg-yellow-500/30 shrink-0"
                >
                  Sign in with Riot
                </button>
              </div>
            )}
            <PageRouter
              pages={pages}
              activeTab={activeTab}
              alwaysMounted={{
                tab: "fakestatus",
                element: (
                  <FakeStatusPage
                    connected={status === "connected"}
                    showLogsSetting={showLogs}
                    onUnsavedChange={setFakeStatusUnsaved}
                    actionRef={fakeStatusActionRef}
                  />
                ),
              }}
            />
          </main>
        </div>
        <AnimatePresence>
          {showRefreshModal && (
            <RefreshTokenModal
              tokenAge={tokenAge}
              onCancel={() => setShowRefreshModal(false)}
              onConfirm={confirmRefresh}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {unsavedModal && (
            <UnsavedChangesModal
              onDiscard={() => {
                fakeStatusActionRef.current?.discard();
                const tab = unsavedModal;
                setUnsavedModal(null);
                setActiveTab(tab);
              }}
              onSave={() => {
                fakeStatusActionRef.current?.save();
                const tab = unsavedModal;
                setUnsavedModal(null);
                setActiveTab(tab);
              }}
              onClose={() => setUnsavedModal(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
