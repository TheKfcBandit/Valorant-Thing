import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../utils/animation";
import { Label } from "./ui/Label";
import { DownloadTray } from "../icons";
import { CONFIG_KEYS } from "./settings/configKeys";
import { AccountSection } from "./settings/AccountSection";
import { TimingSection } from "./settings/TimingSection";
import { NotificationSettings } from "./settings/NotificationSettings";
import { ThemeSection } from "./settings/ThemeSection";
import { ConfigSection } from "./settings/ConfigSection";
import { PlayerSettingsSection } from "./settings/PlayerSettingsSection";
import { SettingRow } from "./settings/SettingRow";
import { ShareCodeModal, ImportCodeModal } from "./settings/SettingsModals";

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
  const [appVersion, setAppVersion] = useState("...");
  const [shareModal, setShareModal] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [importCodeModal, setImportCodeModal] = useState(null);
  const [importCodeValue, setImportCodeValue] = useState("");
  const [importCodeError, setImportCodeError] = useState("");

  useEffect(() => {
    invoke("get_app_version")
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const shareCode = async (saveType, data) => {
    setShareLoading(true);
    setShareModal(null);
    try {
      const code = await invoke("cloud_save", { saveType, data });
      navigator.clipboard.writeText(code);
      setShareModal({ code, copied: true });
    } catch (e) {
      setShareModal({ error: e.message });
    } finally {
      setShareLoading(false);
    }
  };

  const shareThemeCode = () => shareCode("theme", customTheme);

  const shareConfigCode = () => {
    const config = {};
    for (const key of CONFIG_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) config[key] = val;
    }
    return shareCode("config", config);
  };

  const shareWishlistCode = () => {
    let arr = [];
    try {
      const raw = localStorage.getItem("wishlist_skins");
      const parsed = raw ? JSON.parse(raw) : [];
      arr = Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
    } catch (e) {
      console.warn("[Settings] suppressed:", e);
    }
    return shareCode("wishlist", arr);
  };

  const openImportCode = (kind) => {
    setImportCodeModal(kind);
    setImportCodeValue("");
    setImportCodeError("");
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

      <AccountSection
        oauthSession={oauthSession}
        valorantConnected={valorantConnected}
        player={player}
        onOAuthSignin={onOAuthSignin}
        onOAuthSignout={onOAuthSignout}
        splooshimaApiKey={splooshimaApiKey}
        onSplooshimaApiKeyChange={onSplooshimaApiKeyChange}
      />

      <TimingSection
        selectDelay={selectDelay}
        onSelectDelayChange={onSelectDelayChange}
        lockDelay={lockDelay}
        onLockDelayChange={onLockDelayChange}
        lockMode={lockMode}
        onLockModeChange={onLockModeChange}
      />

      <NotificationSettings
        notificationsEnabled={notificationsEnabled}
        onNotificationsEnabledChange={onNotificationsEnabledChange}
        notificationPosition={notificationPosition}
        onNotificationPositionChange={onNotificationPositionChange}
        notificationScreen={notificationScreen}
        onNotificationScreenChange={onNotificationScreenChange}
        spikeTimerEnabled={spikeTimerEnabled}
        onSpikeTimerEnabledChange={onSpikeTimerEnabledChange}
      />

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Startup</Label>
        </div>
        <SettingRow
          title="Start with Windows"
          desc="Launch on system startup"
          enabled={startWithWindows}
          onChange={onStartWithWindowsChange}
        />
        <SettingRow
          title="Start Minimized"
          desc="Start hidden in system tray"
          enabled={startMinimized}
          onChange={onStartMinimizedChange}
        />
        <SettingRow
          title="Minimize to Tray"
          desc="Hide to system tray instead of taskbar"
          enabled={minimizeToTray}
          onChange={onMinimizeToTrayChange}
        />
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Misc</Label>
        </div>
        <SettingRow
          title="Discord Rich Presence"
          desc="Show current status on your Discord profile"
          enabled={discordRpc}
          onChange={onDiscordRpcChange}
        />
        <SettingRow
          title="Close with Game"
          desc="Auto-close when Valorant and Riot Client are both closed"
          enabled={closeWithGame}
          onChange={onCloseWithGameChange}
        />
        <SettingRow
          title="Disable Animations"
          desc="Turn off all UI transitions and animations"
          enabled={disableAnimations}
          onChange={onDisableAnimationsChange}
        />
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="rounded-xl bg-base-700 border border-border divide-y divide-border"
      >
        <div className="px-4 pt-3 pb-1">
          <Label as="h2">Debug</Label>
        </div>
        <SettingRow
          title="Show Logs"
          desc="Show API polling logs in a separate tab"
          enabled={showLogs}
          onChange={onShowLogsChange}
        />
      </motion.div>

      <ThemeSection
        theme={theme}
        onThemeChange={onThemeChange}
        customTheme={customTheme}
        onCustomThemeChange={onCustomThemeChange}
        simplifiedTheme={simplifiedTheme}
        onSimplifiedThemeChange={onSimplifiedThemeChange}
        onShareTheme={shareThemeCode}
        onOpenImportCode={openImportCode}
      />

      <ConfigSection
        onShareConfig={shareConfigCode}
        onShareWishlist={shareWishlistCode}
        onOpenImportCode={openImportCode}
      />

      <PlayerSettingsSection valorantConnected={valorantConnected} />

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

      <ShareCodeModal
        shareModal={shareModal}
        shareLoading={shareLoading}
        onClose={() => {
          setShareModal(null);
          setShareLoading(false);
        }}
        onCopied={() => setShareModal((r) => ({ ...r, copied: true }))}
      />

      <ImportCodeModal
        importCodeModal={importCodeModal}
        importCodeValue={importCodeValue}
        importCodeError={importCodeError}
        onValueChange={(v) => {
          setImportCodeValue(v);
          setImportCodeError("");
        }}
        onImport={handleImportCode}
        onClose={() => setImportCodeModal(null)}
      />
    </motion.div>
  );
}
