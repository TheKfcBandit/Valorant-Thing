import { useRef, useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { motion } from "framer-motion";
import { open } from "@tauri-apps/plugin-shell";
import { exportVtFile, readVtFile } from "../cloud";

import { noAnim, T0 } from "../utils/animation";
import { rgbToHex } from "../utils/color";
import { Label } from "./ui/Label";
import { THEMES } from "../themes";
import {
  ChevronDown,
  Copy,
  DownloadTray,
  HeartFilled,
  HelpCircle,
  Layers,
  OpenExternal,
  Pencil,
  Plus,
  Share,
  UploadTray,
  X,
} from "../icons";

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
        enabled ? "bg-val-red" : "bg-base-500"
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function DelaySlider({ label, desc, value, onChange }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => {
    setLocal(String(value));
  }, [value]);
  const clamp = (v) => Math.max(0, Math.min(10000, v));
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-display font-medium text-text-primary">{label}</p>
        <p className="text-xs font-body text-text-muted mt-0.5">{desc}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={10000}
          step={100}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-24 h-1.5 rounded-full appearance-none cursor-pointer bg-base-500 accent-val-red"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={local}
            onChange={(e) => {
              setLocal(e.target.value);
              if (e.target.value !== "") onChange(clamp(parseInt(e.target.value, 10) || 0));
            }}
            onBlur={() => {
              if (local === "") setLocal(String(value));
            }}
            className="w-14 px-1.5 py-0.5 rounded bg-base-600 border border-border text-text-primary text-xs text-right font-body tabular-nums outline-none focus:border-val-red/60 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-xs font-body text-text-muted">ms</span>
        </div>
      </div>
    </div>
  );
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);
const KEY_MAP = { Control: "Ctrl", Meta: "Super", " ": "Space" };

function DodgeKeybindSetting() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("dodge_keybind_enabled") !== "false"
  );
  const [keybind, setKeybind] = useState(() => localStorage.getItem("dodge_keybind") || "Ctrl+D");
  const [recording, setRecording] = useState(false);

  const handleToggle = useCallback((v) => {
    setEnabled(v);
    localStorage.setItem("dodge_keybind_enabled", String(v));
  }, []);

  const handleRecord = useCallback(() => {
    setRecording(true);
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (MODIFIER_KEYS.has(e.key)) return;
      const parts = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      parts.push(KEY_MAP[e.key] || e.key.toUpperCase());
      const combo = parts.join("+");
      setKeybind(combo);
      localStorage.setItem("dodge_keybind", combo);
      setRecording(false);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("keydown", handler, true);
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-body text-text-muted">Dodge keybind</p>
        <Toggle enabled={enabled} onChange={handleToggle} />
      </div>
      {enabled && (
        <>
          <button
            onClick={handleRecord}
            className={`w-full px-3 py-2 rounded-lg text-xs font-body text-left transition-colors border ${
              recording
                ? "bg-val-red/10 border-val-red/40 text-val-red animate-pulse"
                : "bg-base-600 border-border text-text-secondary hover:text-text-primary hover:bg-base-500"
            }`}
          >
            {recording ? "Press a key combo..." : keybind}
          </button>
          <p className="text-[10px] font-body text-text-muted">
            Works globally while in agent select
          </p>
        </>
      )}
    </div>
  );
}

function presetToCustom(t) {
  const base = t.vars["--base-900"].split(" ").map(Number);
  const accent = t.vars["--val-red"].split(" ").map(Number);
  const end = base.map((v, i) => Math.round(v + (accent[i] - v) * 0.18));
  return {
    accent: t.accent,
    angle: 135,
    stops: [
      { color: rgbToHex(...base), pos: 0 },
      { color: rgbToHex(...end), pos: 100 },
    ],
    vars: { ...t.vars },
  };
}

function ColorSwatch({ color, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const popover = useRef(null);

  const close = useCallback((e) => {
    if (popover.current && !popover.current.contains(e.target)) setOpen(false);
  }, []);

  useEffect(() => {
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, close]);

  return (
    <div className={`relative ${className}`} ref={popover}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg border border-white/10 shadow-sm hover:border-white/25 transition-colors cursor-pointer shrink-0"
        style={{ background: color }}
      />
      {open && (
        <div
          className="absolute z-20 top-full left-0 mt-2 p-3 rounded-xl bg-base-600 border border-border shadow-2xl space-y-2"
          style={{ width: 224 }}
        >
          <HexColorPicker color={color} onChange={onChange} />
          <div className="flex items-center gap-2">
            <span className="text-xs font-body text-text-muted">#</span>
            <HexColorInput
              color={color}
              onChange={onChange}
              prefixed={false}
              className="flex-1 px-2 py-1 rounded-md bg-base-700 border border-border text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors uppercase tracking-wider"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function buildPreviewGradient(ct) {
  const sorted = [...ct.stops].sort((a, b) => a.pos - b.pos);
  return `linear-gradient(${ct.angle}deg, ${sorted.map((s) => `${s.color} ${s.pos}%`).join(", ")})`;
}

const CONFIG_KEYS = [
  "show_logs",
  "app_theme",
  "simplified_theme",
  "custom_theme",
  "discord_rpc",
  "start_with_windows",
  "start_minimized",
  "minimize_to_tray",
  "close_with_game",
  "disable_animations",
  "splooshima_api_key",
  "mapdodge-config",
  "auto_unqueue",
  "auto_requeue",
  "instalock_select_delay",
  "instalock_lock_delay",
  "instalock-config",
  "fake-status-config",
  "fakestatus_enabled",
  "overlay_enabled",
  "overlay_linger",
  "notifications_enabled",
  "notification_position",
  "notification_screen",
  "dodge_keybind",
  "dodge_keybind_enabled",
  "instalock-profiles",
  "instalock-active-profile",
  "dev_tab_enabled",
];

export default function SettingsPage({
  oauthSession,
  valorantConnected,
  onOAuthSignin,
  onOAuthSignout,
  player,
  showLogs,
  onShowLogsChange,
  selectDelay,
  onSelectDelayChange,
  lockDelay,
  onLockDelayChange,
  lockMode,
  onLockModeChange,
  splooshimaApiKey,
  onSplooshimaApiKeyChange,
  theme,
  onThemeChange,
  startWithWindows,
  onStartWithWindowsChange,
  startMinimized,
  onStartMinimizedChange,
  minimizeToTray,
  onMinimizeToTrayChange,
  simplifiedTheme,
  onSimplifiedThemeChange,
  customTheme,
  onCustomThemeChange,
  discordRpc,
  onDiscordRpcChange,
  closeWithGame,
  onCloseWithGameChange,
  disableAnimations,
  onDisableAnimationsChange,
  updateInfo,
  onShowUpdate,
  notificationsEnabled,
  onNotificationsEnabledChange,
  notificationPosition,
  onNotificationPositionChange,
  notificationScreen,
  onNotificationScreenChange,
  spikeTimerEnabled,
  onSpikeTimerEnabledChange,
}) {
  const themeVtRef = useRef(null);
  const configVtRef = useRef(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("...");
  const [monitors, setMonitors] = useState([]);
  const [shareModal, setShareModal] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [importCodeModal, setImportCodeModal] = useState(null);
  const [importCodeValue, setImportCodeValue] = useState("");
  const [importCodeError, setImportCodeError] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState(null);

  const handleOAuthSignin = async () => {
    setOauthError(null);
    setOauthBusy(true);
    try {
      await onOAuthSignin();
    } catch (e) {
      setOauthError(typeof e === "string" ? e : e?.message || "Sign-in failed");
    } finally {
      setOauthBusy(false);
    }
  };

  const handleOAuthSignout = async () => {
    setOauthError(null);
    setOauthBusy(true);
    try {
      await onOAuthSignout();
    } finally {
      setOauthBusy(false);
    }
  };

  useEffect(() => {
    invoke("get_app_version")
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!notificationsEnabled || !notificationScreen?.startsWith("monitor:")) return;
    invoke("list_monitors")
      .then((raw) => {
        const list = JSON.parse(raw);
        setMonitors(
          list.map((m, i) => ({
            index: i,
            width: m.width,
            height: m.height,
            hz: m.hz,
            primary: m.primary,
            label: `Display ${i + 1}  ${m.width}x${m.height}${m.hz ? `@${m.hz}hz` : ""}${m.primary ? "  [PRIMARY]" : ""}`,
          }))
        );
      })
      .catch((e) => console.error("[monitors]", e));
  }, [notificationsEnabled, notificationScreen]);

  const shareThemeCode = async () => {
    setShareLoading(true);
    setShareModal(null);
    try {
      const code = await invoke("cloud_save", { saveType: "theme", data: customTheme });
      navigator.clipboard.writeText(code);
      setShareModal({ code, copied: true });
    } catch (e) {
      setShareModal({ error: e.message });
    } finally {
      setShareLoading(false);
    }
  };

  const exportThemeFile = () => exportVtFile("theme", customTheme, "custom-theme.vt");

  const importThemeVt = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const vt = await readVtFile(file);
      if (vt.type !== "theme") return;
      const d = vt.data;
      if (d.accent && d.stops?.length >= 2 && typeof d.angle === "number") {
        onCustomThemeChange(d);
        onThemeChange("custom");
      }
    } catch (e) {
      console.warn("[Settings] suppressed:", e);
    }
    e.target.value = "";
  };

  const shareConfigCode = async () => {
    const config = {};
    for (const key of CONFIG_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) config[key] = val;
    }
    setShareLoading(true);
    setShareModal(null);
    try {
      const code = await invoke("cloud_save", { saveType: "config", data: config });
      navigator.clipboard.writeText(code);
      setShareModal({ code, copied: true });
    } catch (e) {
      setShareModal({ error: e.message });
    } finally {
      setShareLoading(false);
    }
  };

  const shareWishlistCode = async () => {
    let arr = [];
    try {
      const raw = localStorage.getItem("wishlist_skins");
      const parsed = raw ? JSON.parse(raw) : [];
      arr = Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
    } catch (e) {
      console.warn("[Settings] suppressed:", e);
    }
    setShareLoading(true);
    setShareModal(null);
    try {
      const code = await invoke("cloud_save", { saveType: "wishlist", data: arr });
      navigator.clipboard.writeText(code);
      setShareModal({ code, copied: true });
    } catch (e) {
      setShareModal({ error: e.message });
    } finally {
      setShareLoading(false);
    }
  };

  const exportConfigFile = () => {
    const config = {};
    for (const key of CONFIG_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) config[key] = val;
    }
    exportVtFile("config", config, "config.vt");
  };

  const importConfigVt = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const vt = await readVtFile(file);
      if (vt.type !== "config") return;
      for (const key of CONFIG_KEYS) {
        if (key in vt.data) localStorage.setItem(key, vt.data[key]);
      }
      window.location.reload();
    } catch (e) {
      console.warn("[Settings] suppressed:", e);
    }
    e.target.value = "";
  };

  const handleImportCode = async () => {
    const val = importCodeValue.trim().toUpperCase();
    if (!val) return;
    setImportCodeError("");
    try {
      const result = await invoke("cloud_load", { code: val });
      if (result.type === "theme") {
        const d = result.data;
        if (d.accent && d.stops?.length >= 2 && typeof d.angle === "number") {
          onCustomThemeChange(d);
          onThemeChange("custom");
        }
        setImportCodeModal(null);
        setImportCodeValue("");
      } else if (result.type === "config") {
        for (const key of CONFIG_KEYS) {
          if (key in result.data) localStorage.setItem(key, result.data[key]);
        }
        window.location.reload();
      } else if (result.type === "wishlist") {
        const arr = Array.isArray(result.data) ? result.data.map((s) => String(s)) : [];
        localStorage.setItem("wishlist_skins", JSON.stringify(arr));
        try {
          await invoke("set_wishlist", { items: arr });
        } catch (e) {
          console.warn("[Settings] suppressed:", e);
        }
        setImportCodeModal(null);
        setImportCodeValue("");
      } else {
        setImportCodeError(`Unexpected type: ${result.type}`);
      }
    } catch (e) {
      setImportCodeError(e.message);
    }
  };

  const clearVarsAndUpdate = (patch) => {
    const { vars, ...rest } = customTheme;
    onCustomThemeChange({ ...rest, ...patch });
  };

  const updateStop = (i, patch) => {
    const stops = customTheme.stops.map((s, j) => (j === i ? { ...s, ...patch } : s));
    clearVarsAndUpdate({ stops });
  };

  const removeStop = (i) => {
    if (customTheme.stops.length <= 2) return;
    clearVarsAndUpdate({ stops: customTheme.stops.filter((_, j) => j !== i) });
  };

  const addStop = () => {
    const sorted = [...customTheme.stops].sort((a, b) => a.pos - b.pos);
    let pos = 50;
    if (sorted.length >= 2) {
      let maxGap = 0,
        gapMid = 50;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].pos - sorted[i].pos;
        if (gap > maxGap) {
          maxGap = gap;
          gapMid = Math.round((sorted[i].pos + sorted[i + 1].pos) / 2);
        }
      }
      pos = gapMid;
    }
    clearVarsAndUpdate({ stops: [...customTheme.stops, { color: "#444444", pos }] });
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: noAnim() ? 0 : 0.04 } } }}
      className="flex-1 flex flex-col min-h-0 p-5 gap-3 overflow-y-auto"
    >
      {updateInfo && (
        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          transition={noAnim() ? T0 : { duration: 0.2 }}
          className="p-4 rounded-xl bg-accent-blue/5 border border-accent-blue/20 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center shrink-0">
              <DownloadTray size={16} strokeWidth="1.5" className="text-accent-blue" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-display font-semibold text-text-primary">
                Update Available
              </p>
              <p className="text-[10px] font-body text-text-muted truncate">
                v{updateInfo.current} → v{updateInfo.latest}
              </p>
            </div>
          </div>
          <button
            onClick={onShowUpdate}
            className="px-3 py-1.5 rounded-lg bg-accent-blue text-white text-[11px] font-display font-semibold hover:brightness-110 transition-all shrink-0"
          >
            View Update
          </button>
        </motion.div>
      )}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Riot Account (offline mode)</Label>
        </div>
        <div className="p-4 space-y-3">
          {valorantConnected && !oauthSession ? (
            <p className="text-xs font-body text-text-muted">
              Active session from Valorant — sign-in not needed.
            </p>
          ) : valorantConnected && oauthSession ? (
            <>
              <p className="text-xs font-body text-text-muted">
                Signed in as{" "}
                <span className="text-text-primary font-display">
                  {player?.game_name}#{player?.game_tag}
                </span>
                . Live data without Valorant running. Session stays active across app restarts and
                refreshes itself silently — sign out to clear.
              </p>
              <button
                onClick={handleOAuthSignout}
                disabled={oauthBusy}
                className="px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-border bg-base-600 hover:bg-base-500 disabled:opacity-50"
              >
                {oauthBusy ? "Signing out..." : "Sign out"}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-body text-text-muted">
                Lets Store, Wrapped, Coach, and Spend tracker show live data when Valorant isn't
                running. Uses Riot's official login page in a popup — your password never touches
                this app.
              </p>
              <button
                onClick={handleOAuthSignin}
                disabled={oauthBusy}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-val-red/40 bg-val-red/20 text-val-red hover:bg-val-red/30 disabled:opacity-50"
              >
                {oauthBusy ? "Opening sign-in..." : "Sign in with Riot"}
              </button>
            </>
          )}
          {oauthError && <p className="text-[11px] font-body text-val-red">{oauthError}</p>}
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Splooshima API</Label>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs font-body text-text-muted">
            Fallback for player names, levels, and viewing rank information. The app attempts to
            resolve it itself, and Splooshima is used if that fails.
          </p>
          <input
            type="password"
            value={splooshimaApiKey}
            onChange={(e) => onSplooshimaApiKeyChange(e.target.value)}
            placeholder="Your Splooshima API key"
            className="w-full px-3 py-2 bg-base-600 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted/50 outline-none focus:border-val-red/60 transition-colors"
          />
          <button
            onClick={() => open("https://splooshima.com")}
            className="inline-flex items-center gap-1 text-xs font-body text-val-red hover:text-val-red/80 transition-colors"
          >
            Get API key
            <OpenExternal />
          </button>
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Timing</Label>
        </div>
        <div className="p-4 space-y-4">
          <DelaySlider
            label="Select Delay"
            desc="Delay before selecting agent"
            value={selectDelay}
            onChange={onSelectDelayChange}
          />
          <DelaySlider
            label="Lock Delay"
            desc="Delay between select and lock (instant mode only)"
            value={lockDelay}
            onChange={onLockDelayChange}
          />
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Lock Mode</p>
            <p className="text-xs font-body text-text-muted mt-0.5 mb-2">
              When to lock in after selecting
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "instant", label: "Instant", desc: "Lock right after select" },
                { id: "last-second", label: "Last Second", desc: "Lock at ~2s remaining" },
                { id: "select-only", label: "Select Only", desc: "Never auto-lock" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onLockModeChange(opt.id)}
                  className={`px-2 py-2 rounded-lg border text-left transition-colors ${lockMode === opt.id ? "border-val-red bg-val-red/10" : "border-border bg-base-600 hover:bg-base-500"}`}
                >
                  <p
                    className={`text-xs font-display font-semibold ${lockMode === opt.id ? "text-val-red" : "text-text-primary"}`}
                  >
                    {opt.label}
                  </p>
                  <p className="text-[10px] font-body text-text-muted mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Notifications</Label>
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Enabled</p>
            <p className="text-xs font-body text-text-muted mt-0.5">
              Show in-game notification toasts
            </p>
          </div>
          <Toggle enabled={notificationsEnabled} onChange={onNotificationsEnabledChange} />
        </div>
        {notificationsEnabled && (
          <div className="p-4 space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-body text-text-muted">Display on</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  {
                    value: "game",
                    label: "Game Screen",
                    tip: "Notifications appear on whichever monitor Valorant is running on",
                  },
                  {
                    value: "app",
                    label: "App Screen",
                    tip: "Notifications appear on whichever monitor this app is on",
                  },
                  { value: "custom", label: "Custom", tip: "Pick a specific monitor" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() =>
                      onNotificationScreenChange(
                        opt.value === "custom"
                          ? `monitor:${notificationScreen.startsWith("monitor:") ? notificationScreen.split(":")[1] : "0"}`
                          : opt.value
                      )
                    }
                    className={`group relative flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-body transition-colors ${
                      (
                        opt.value === "custom"
                          ? notificationScreen.startsWith("monitor:")
                          : notificationScreen === opt.value
                      )
                        ? "bg-val-red/20 border border-val-red/40 text-val-red font-semibold"
                        : "bg-base-600 border border-border text-text-secondary hover:text-text-primary hover:bg-base-500"
                    }`}
                  >
                    {opt.label}
                    <HelpCircle className="shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-base-800 border border-border text-[10px] text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                      {opt.tip}
                    </div>
                  </button>
                ))}
              </div>
              {notificationScreen.startsWith("monitor:") && monitors.length > 0 && (
                <div className="relative pt-1">
                  <select
                    value={notificationScreen}
                    onChange={(e) => onNotificationScreenChange(e.target.value)}
                    className="w-full appearance-none bg-base-600 border border-border rounded-lg px-3 py-2 text-xs font-body text-text-primary focus:outline-none focus:border-val-red/50 cursor-pointer"
                  >
                    {monitors.map((m) => (
                      <option key={m.index} value={`monitor:${m.index}`}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    className="absolute right-3 top-1/2 translate-y-px pointer-events-none text-text-muted"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-body text-text-muted">Position on screen</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: "top-left", label: "Top Left" },
                  { value: "top-right", label: "Top Right" },
                  { value: "bottom-left", label: "Bottom Left" },
                  { value: "bottom-right", label: "Bottom Right" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onNotificationPositionChange(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-body transition-colors ${
                      notificationPosition === opt.value
                        ? "bg-val-red/20 border border-val-red/40 text-val-red font-semibold"
                        : "bg-base-600 border border-border text-text-secondary hover:text-text-primary hover:bg-base-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm font-display font-medium text-text-primary">Spike Timer</p>
                <p className="text-xs font-body text-text-muted mt-0.5">
                  Show a 45s countdown when the spike is planted
                </p>
              </div>
              <Toggle enabled={spikeTimerEnabled} onChange={onSpikeTimerEnabledChange} />
            </div>
            <DodgeKeybindSetting />
          </div>
        )}
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Startup</Label>
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Start with Windows</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Launch on system startup</p>
          </div>
          <Toggle enabled={startWithWindows} onChange={onStartWithWindowsChange} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Start Minimized</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Start hidden in system tray</p>
          </div>
          <Toggle enabled={startMinimized} onChange={onStartMinimizedChange} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Minimize to Tray</p>
            <p className="text-xs font-body text-text-muted mt-0.5">
              Hide to system tray instead of taskbar
            </p>
          </div>
          <Toggle enabled={minimizeToTray} onChange={onMinimizeToTrayChange} />
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Misc</Label>
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">
              Discord Rich Presence
            </p>
            <p className="text-xs font-body text-text-muted mt-0.5">
              Show current status on your Discord profile
            </p>
          </div>
          <Toggle enabled={discordRpc} onChange={onDiscordRpcChange} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Close with Game</p>
            <p className="text-xs font-body text-text-muted mt-0.5">
              Auto-close when Valorant and Riot Client are both closed
            </p>
          </div>
          <Toggle enabled={closeWithGame} onChange={onCloseWithGameChange} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Disable Animations</p>
            <p className="text-xs font-body text-text-muted mt-0.5">
              Turn off all UI transitions and animations
            </p>
          </div>
          <Toggle enabled={disableAnimations} onChange={onDisableAnimationsChange} />
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Debug</Label>
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Show Logs</p>
            <p className="text-xs font-body text-text-muted mt-0.5">
              Show API polling logs in a separate tab
            </p>
          </div>
          <Toggle enabled={showLogs} onChange={onShowLogsChange} />
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Theme</Label>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => onThemeChange(t.id)}
                className={`group relative p-2 rounded-lg border transition-all duration-150 ${
                  theme === t.id
                    ? "border-val-red bg-base-600"
                    : "border-transparent hover:bg-base-600/50"
                }`}
              >
                <div
                  className="w-full h-8 rounded-md mb-1.5"
                  style={{ background: `linear-gradient(135deg, ${t.bg} 0%, ${t.accent} 100%)` }}
                />
                <p
                  className={`text-[11px] font-body leading-tight truncate ${
                    theme === t.id
                      ? "text-text-primary font-medium"
                      : "text-text-muted group-hover:text-text-secondary"
                  }`}
                >
                  {t.name}
                </p>
              </button>
            ))}
            <button
              onClick={() => onThemeChange("custom")}
              className={`group relative p-2 rounded-lg border transition-all duration-150 ${
                theme === "custom"
                  ? "border-val-red bg-base-600"
                  : "border-transparent hover:bg-base-600/50"
              }`}
            >
              <div
                className="w-full h-8 rounded-md mb-1.5 flex items-center justify-center"
                style={{ background: buildPreviewGradient(customTheme) }}
              >
                <Pencil size={14} stroke="white" className="opacity-60" />
              </div>
              <p
                className={`text-[11px] font-body leading-tight truncate ${
                  theme === "custom"
                    ? "text-text-primary font-medium"
                    : "text-text-muted group-hover:text-text-secondary"
                }`}
              >
                Custom
              </p>
            </button>
          </div>

          {theme === "custom" && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div
                className="h-14 rounded-xl border border-border shadow-inner"
                style={{ background: buildPreviewGradient(customTheme) }}
              />

              <div className="space-y-2">
                <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">
                  Color Stops
                </p>
                {customTheme.stops.map((stop, i) => (
                  <div key={i} className="flex items-center gap-2.5 group">
                    <ColorSwatch color={stop.color} onChange={(c) => updateStop(i, { color: c })} />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={stop.pos}
                      onChange={(e) => updateStop(i, { pos: parseInt(e.target.value, 10) })}
                      className="flex-1"
                    />
                    <span className="text-xs font-body text-text-muted w-9 text-right tabular-nums">
                      {stop.pos}%
                    </span>
                    {customTheme.stops.length > 2 && (
                      <button
                        onClick={() => removeStop(i)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addStop}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-body text-val-red hover:bg-val-red/10 transition-colors"
                >
                  <Plus />
                  Add Color Stop
                </button>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider shrink-0 w-12">
                  Angle
                </p>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={customTheme.angle}
                  onChange={(e) => clearVarsAndUpdate({ angle: parseInt(e.target.value, 10) })}
                  className="flex-1"
                />
                <span className="text-xs font-body text-text-muted w-9 text-right tabular-nums">
                  {customTheme.angle}°
                </span>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider shrink-0 w-12">
                  Accent
                </p>
                <ColorSwatch
                  color={customTheme.accent}
                  onChange={(c) => clearVarsAndUpdate({ accent: c })}
                />
                <p className="text-[11px] font-body text-text-muted">
                  UI highlights, toggles, icons
                </p>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-border">
                <div className="relative">
                  <button
                    onClick={() => setPresetOpen(!presetOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
                  >
                    <Layers />
                    Load Preset
                    <ChevronDown
                      strokeWidth="2.5"
                      className={`transition-transform ${presetOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {presetOpen && (
                    <div className="absolute bottom-full left-0 mb-1 w-44 py-1 rounded-lg bg-base-600 border border-border shadow-xl z-10">
                      {THEMES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            onCustomThemeChange(presetToCustom(t));
                            setPresetOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-body text-text-secondary hover:text-text-primary hover:bg-base-500/60 transition-colors"
                        >
                          <div
                            className="w-4 h-4 rounded shrink-0 border border-white/10"
                            style={{ background: `linear-gradient(135deg, ${t.bg}, ${t.accent})` }}
                          />
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={shareThemeCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
                >
                  <Share />
                  Share Code
                </button>
                <button
                  onClick={() => {
                    setImportCodeModal("theme");
                    setImportCodeValue("");
                    setImportCodeError("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
                >
                  <UploadTray />
                  Import Code
                </button>
                <button
                  onClick={exportThemeFile}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
                >
                  <DownloadTray />
                  Export .vt
                </button>
                <button
                  onClick={() => themeVtRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
                >
                  <UploadTray />
                  Import .vt
                </button>
                <input
                  ref={themeVtRef}
                  type="file"
                  accept=".vt,.theme,.json"
                  onChange={importThemeVt}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Simplified</p>
            <p className="text-xs font-body text-text-muted mt-0.5">
              Flat colors instead of gradient background
            </p>
          </div>
          <Toggle enabled={simplifiedTheme} onChange={onSimplifiedThemeChange} />
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Config</Label>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs font-body text-text-muted">
            Share, export, or import your entire configuration including agents, maps, theme, and
            all settings.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={shareConfigCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
            >
              <Share />
              Share Code
            </button>
            <button
              onClick={() => {
                setImportCodeModal("config");
                setImportCodeValue("");
                setImportCodeError("");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
            >
              <UploadTray />
              Import Code
            </button>
            <button
              onClick={exportConfigFile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
            >
              <DownloadTray />
              Export .vt
            </button>
            <button
              onClick={() => configVtRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
            >
              <UploadTray />
              Import .vt
            </button>
            <input
              ref={configVtRef}
              type="file"
              accept=".vt,.valthing"
              onChange={importConfigVt}
              className="hidden"
            />
          </div>
          <div className="pt-2 mt-1 border-t border-border/40">
            <p className="text-xs font-body text-text-muted mb-2">
              Share your store wishlist (skins you'd like notified about).
            </p>
            <button
              onClick={shareWishlistCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
            >
              <HeartFilled className="" />
              Share Wishlist
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">About</Label>
        </div>
        <div className="p-4 space-y-1">
          <p className="text-xs font-body text-text-secondary">Valorant Thing v{appVersion}</p>
          <p className="text-xs font-body text-text-muted">
            Created by AjaxFNC · Built with Rust & Tauri · Uses official Valorant APIs
          </p>
        </div>
      </motion.div>

      {(shareModal || shareLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setShareModal(null);
            setShareLoading(false);
          }}
        >
          <div
            className="bg-base-700 border border-border rounded-xl p-5 max-w-xs w-full space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Share size={16} className="text-accent-blue shrink-0" />
              <p className="text-sm font-display font-semibold text-text-primary">Share Code</p>
            </div>
            {shareLoading && (
              <p className="text-xs font-body text-text-muted">Generating code...</p>
            )}
            {shareModal?.code && (
              <>
                <div className="flex items-center gap-2 bg-base-800 border border-border rounded-lg px-3 py-2">
                  <code className="text-sm font-mono text-accent-blue flex-1">
                    {shareModal.code}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareModal.code);
                      setShareModal((r) => ({ ...r, copied: true }));
                    }}
                    className="text-text-muted hover:text-text-primary transition-colors shrink-0"
                  >
                    <Copy />
                  </button>
                </div>
                {shareModal.copied && (
                  <p className="text-[10px] font-body text-status-green">Copied to clipboard!</p>
                )}
                <p className="text-[10px] font-body text-text-muted">Code expires in 14 days</p>
              </>
            )}
            {shareModal?.error && (
              <p className="text-xs font-body text-val-red">{shareModal.error}</p>
            )}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => {
                  setShareModal(null);
                  setShareLoading(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {importCodeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setImportCodeModal(null)}
        >
          <div
            className="bg-base-700 border border-border rounded-xl p-5 max-w-xs w-full space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <UploadTray size={16} className="text-accent-blue shrink-0" />
              <p className="text-sm font-display font-semibold text-text-primary">Import Code</p>
            </div>
            <input
              value={importCodeValue}
              onChange={(e) => {
                setImportCodeValue(e.target.value);
                setImportCodeError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleImportCode();
                if (e.key === "Escape") setImportCodeModal(null);
              }}
              placeholder={importCodeModal === "config" ? "VT-CFG-XXXXX" : "VT-THEME-XXXXX"}
              className="w-full px-3 py-2 bg-base-800 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light transition-colors"
              autoFocus
            />
            {importCodeError && (
              <p className="text-[10px] font-body text-val-red">{importCodeError}</p>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setImportCodeModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportCode}
                disabled={!importCodeValue.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-body bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
