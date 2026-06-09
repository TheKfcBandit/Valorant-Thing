import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FakeStatusTab, WifiSlash } from "../icons";
import { Toggle } from "./ui/Toggle";
import { PresenceForm } from "./fake-status/PresenceForm";
import { XmppLogPanel } from "./fake-status/XmppLogPanel";

const CONFIG_KEY = "fake-status-config";
function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY));
  } catch {
    return null;
  }
}

export default function FakeStatusPage({ connected, showLogsSetting, onUnsavedChange, actionRef }) {
  const [xmppStatus, setXmppStatus] = useState(null);
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectingMsg, setConnectingMsg] = useState("");
  const [error, setError] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("all");
  const logEndRef = useRef(null);
  const logContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const pollRef = useRef(null);
  const sendRef = useRef(null);
  const presenceRef = useRef(null);
  const cancelRef = useRef(false);
  const autoStarted = useRef(false);

  const defaultPresence = {
    sessionLoopState: "MENUS",
    queueId: "unrated",
    partyOwnerMatchScoreAllyTeam: 0,
    partyOwnerMatchScoreEnemyTeam: 0,
    maxPartySize: 5,
    partySize: 1,
    accountLevel: 1,
    competitiveTier: 0,
    leaderboardPosition: 0,
    premierDivision: 0,
    premierScore: 0,
    rosterName: "",
    statusMode: "online",
    playerCardId: "",
    playerTitleId: "",
  };

  const initPresence = () => {
    const cfg = loadConfig();
    if (cfg) {
      const { premierTag, showTag, showAura, showPlating, plating, rosterType, ...clean } = cfg;
      return { ...defaultPresence, ...clean };
    }
    return defaultPresence;
  };

  const [presence, setPresence] = useState(initPresence);
  const [savedPresence, setSavedPresence] = useState(initPresence);
  const savedPresenceRef = useRef(null);

  const hasUnsaved = active && JSON.stringify(presence) !== JSON.stringify(savedPresence);

  const update = (key, val) => setPresence((p) => ({ ...p, [key]: val }));
  presenceRef.current = presence;
  savedPresenceRef.current = savedPresence;

  useEffect(() => {
    if (actionRef) {
      actionRef.current = {
        save: () => {
          setSavedPresence(presenceRef.current);
          if (xmppStatus?.connected) sendPresence(presenceRef.current).catch(() => {});
        },
        discard: () => setPresence(savedPresenceRef.current),
      };
    }
  });

  useEffect(() => {
    if (onUnsavedChange) onUnsavedChange(hasUnsaved);
  }, [hasUnsaved]);

  useEffect(() => {
    saveConfig(presence);
  }, [presence]);

  const fetchStatus = async () => {
    try {
      const raw = await invoke("xmpp_get_status");
      setXmppStatus(JSON.parse(raw));
    } catch (e) {
      console.warn("[FakeStatus] suppressed:", e);
    }
  };

  const fetchLogs = async () => {
    try {
      const raw = await invoke("xmpp_get_logs");
      setLogs(JSON.parse(raw));
    } catch (e) {
      console.warn("[FakeStatus] suppressed:", e);
    }
  };

  const poll = async () => {
    try {
      await invoke("xmpp_poll");
      await fetchLogs();
      await fetchStatus();
    } catch (e) {
      console.warn("[FakeStatus] suppressed:", e);
    }
  };

  const hasResumed = useRef(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!hasResumed.current && xmppStatus?.connected) {
      hasResumed.current = true;
      setActive(true);
      localStorage.setItem("fakestatus_enabled", "true");
    }
  }, [xmppStatus]);

  useEffect(() => {
    if (
      !autoStarted.current &&
      connected &&
      !active &&
      !connecting &&
      localStorage.getItem("fakestatus_enabled") === "true"
    ) {
      autoStarted.current = true;
      handleToggle(true);
    }
  }, [connected]);

  useEffect(() => {
    if (xmppStatus?.connected) {
      pollRef.current = setInterval(poll, 2000);
      return () => clearInterval(pollRef.current);
    }
  }, [xmppStatus?.connected]);

  useEffect(() => {
    if (showLogs && isAtBottomRef.current)
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length, showLogs]);

  const handleLogScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const sendPresence = async (override) => {
    const src = override || savedPresenceRef.current;
    const mode = src.statusMode || "online";
    const show = mode === "invisible" ? "unavailable" : mode === "away" ? "away" : "chat";
    const data = { ...src, show };
    if (mode === "hidden") data.rosterType = "ESPORTS";
    await invoke("xmpp_send_fake_presence", { presenceJson: JSON.stringify(data) });
  };

  const handleToggle = async (enable) => {
    setError(null);
    if (enable) {
      cancelRef.current = false;
      setConnecting(true);
      setConnectingMsg("Connecting to XMPP...");
      try {
        if (!xmppStatus?.connected) {
          await invoke("xmpp_connect");
          if (cancelRef.current) {
            try {
              await invoke("xmpp_disconnect");
            } catch (e) {
              console.warn("[FakeStatus] suppressed:", e);
            }
            setConnecting(false);
            return;
          }
          setConnectingMsg("Fetching status...");
          await fetchStatus();
          await fetchLogs();
        }
        if (cancelRef.current) {
          setConnecting(false);
          return;
        }
        setConnectingMsg("Sending presence...");
        await sendPresence(presenceRef.current);
        setSavedPresence({ ...presenceRef.current });
        setActive(true);
        localStorage.setItem("fakestatus_enabled", "true");
      } catch (e) {
        const errMsg = typeof e === "string" ? e : e?.message || "Failed to enable";
        if (
          errMsg.toLowerCase().includes("jwt") ||
          errMsg.toLowerCase().includes("token") ||
          errMsg.includes("auth failed") ||
          errMsg.includes("not-authorized")
        ) {
          try {
            setConnectingMsg("Refreshing access token...");
            await invoke("xmpp_disconnect").catch(() => {});
            await invoke("connect");
            if (cancelRef.current) {
              setConnecting(false);
              return;
            }
            setConnectingMsg("Reconnecting to XMPP...");
            await invoke("xmpp_connect");
            if (cancelRef.current) {
              try {
                await invoke("xmpp_disconnect");
              } catch (e) {
                console.warn("[FakeStatus] suppressed:", e);
              }
              setConnecting(false);
              return;
            }
            setConnectingMsg("Fetching status...");
            await fetchStatus();
            await fetchLogs();
            setConnectingMsg("Sending presence...");
            await sendPresence(presenceRef.current);
            setSavedPresence({ ...presenceRef.current });
            setActive(true);
            localStorage.setItem("fakestatus_enabled", "true");
          } catch (retryErr) {
            setError(
              "Token refresh failed: " +
                (typeof retryErr === "string" ? retryErr : retryErr?.message || "Unknown error")
            );
            await fetchLogs();
          }
        } else {
          setError(errMsg);
          await fetchLogs();
        }
      }
      setConnecting(false);
    } else {
      setActive(false);
      localStorage.removeItem("fakestatus_enabled");
      clearInterval(sendRef.current);
      try {
        await invoke("xmpp_disconnect");
        await fetchStatus();
      } catch (e) {
        console.warn("[FakeStatus] suppressed:", e);
      }
    }
  };

  const handleCancelConnect = async () => {
    cancelRef.current = true;
    try {
      await invoke("xmpp_disconnect");
    } catch (e) {
      console.warn("[FakeStatus] suppressed:", e);
    }
    setConnecting(false);
    await fetchStatus();
  };

  const startInterval = () => {
    clearInterval(sendRef.current);
    sendRef.current = setInterval(() => sendPresence().catch(() => {}), 3000);
  };

  useEffect(() => {
    if (active && xmppStatus?.connected) {
      startInterval();
      return () => clearInterval(sendRef.current);
    }
    return () => clearInterval(sendRef.current);
  }, [active, xmppStatus?.connected]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <WifiSlash />
          <p className="text-sm font-display text-text-muted">Waiting for Valorant</p>
          <p className="text-[11px] font-body text-text-muted/60">
            Open Valorant and it will connect automatically
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {connecting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 mx-auto border-2 border-val-red/30 border-t-val-red rounded-full animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-display font-semibold text-white">
                Establishing Connection
              </p>
              <p className="text-xs font-body text-white/60">{connectingMsg}</p>
            </div>
            <button
              onClick={handleCancelConnect}
              className="px-6 py-2 rounded-lg bg-white/10 border border-white/20 text-xs font-display font-semibold text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 relative">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FakeStatusTab size={16} className="text-text-muted" />
            <h2 className="text-sm font-display font-semibold text-text-primary">Fake Status</h2>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsaved && !showLogs && (
              <>
                <button
                  onClick={() => setPresence(savedPresence)}
                  className="px-2.5 py-1 rounded-lg border border-border text-[10px] font-display font-medium text-text-muted hover:text-text-primary transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    setSavedPresence(presence);
                    if (xmppStatus?.connected) sendPresence(presence).catch(() => {});
                  }}
                  className="px-2.5 py-1 rounded-lg border border-val-red/40 text-[10px] font-display font-semibold text-val-red hover:bg-val-red/10 transition-colors"
                >
                  Save & Apply
                </button>
              </>
            )}
            {showLogsSetting && (
              <button
                onClick={() => {
                  setShowLogs((v) => !v);
                  if (!showLogs) fetchLogs();
                }}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-display font-semibold transition-colors ${showLogs ? "bg-accent-blue/15 border-accent-blue/30 text-accent-blue" : "bg-base-600 border-border text-text-muted hover:text-text-secondary"}`}
              >
                Logs
              </button>
            )}
            <span
              className={`text-xs font-display tracking-wide ${active ? "text-val-red" : "text-text-muted"}`}
            >
              {active ? "Active" : "Inactive"}
            </span>
            <Toggle enabled={active} onChange={handleToggle} disabled={!connected} />
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-status-red/10 border border-status-red/20 text-xs font-body text-status-red shrink-0">
            {error}
          </div>
        )}

        {!showLogs && <PresenceForm presence={presence} update={update} />}

        {showLogs && (
          <XmppLogPanel
            logs={logs}
            logFilter={logFilter}
            onFilterChange={setLogFilter}
            logContainerRef={logContainerRef}
            logEndRef={logEndRef}
            onScroll={handleLogScroll}
          />
        )}
      </div>
    </>
  );
}
