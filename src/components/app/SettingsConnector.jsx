import SettingsPage from "../SettingsPage";

// Settings has by far the broadest prop surface of any page in the app
// — every persistent toggle, every theme picker, every connection
// affordance touches it. Wiring it all up inline in App.jsx pushed the
// shell past 500 lines, so the handler bag lives here.
//
// Most handlers are the same shape: setState + localStorage.setItem.
// They could in principle move to a useLocalStorageState helper; the
// quickest win for now was just lifting them out of App.jsx so the
// shell stays under budget.
export default function SettingsConnector({
  // connection
  player,
  status,
  doOAuthSignin,
  doOAuthSignout,
  // logs
  showLogs,
  setShowLogs,
  // instalock delays / mode
  selectDelay,
  setSelectDelay,
  lockDelay,
  setLockDelay,
  lockMode,
  setLockMode,
  // splooshima
  splooshimaApiKey,
  setSplooshimaApiKey,
  // theme
  theme,
  setTheme,
  simplifiedTheme,
  setSimplifiedTheme,
  customTheme,
  setCustomTheme,
  disableAnimations,
  setDisableAnimations,
  // startup
  startWithWindows,
  setStartWithWindows,
  startMinimized,
  setStartMinimized,
  minimizeToTray,
  setMinimizeToTray,
  // misc toggles
  discordRpc,
  setDiscordRpc,
  closeWithGame,
  setCloseWithGame,
  // update
  updateInfo,
  setShowUpdateModal,
  // notifications
  notificationsEnabled,
  setNotificationsEnabled,
  notificationPosition,
  setNotificationPosition,
  notificationScreen,
  setNotificationScreen,
  destroyNotifWindow,
  // spike timer
  spikeTimerEnabled,
  setSpikeTimerEnabled,
}) {
  return (
    <SettingsPage
      oauthSession={!!player?.oauth_session}
      valorantConnected={status === "connected"}
      onOAuthSignin={doOAuthSignin}
      onOAuthSignout={doOAuthSignout}
      player={player}
      showLogs={showLogs}
      onShowLogsChange={(v) => {
        setShowLogs(v);
        localStorage.setItem("show_logs", String(v));
      }}
      selectDelay={selectDelay}
      onSelectDelayChange={setSelectDelay}
      lockDelay={lockDelay}
      onLockDelayChange={setLockDelay}
      lockMode={lockMode}
      onLockModeChange={setLockMode}
      splooshimaApiKey={splooshimaApiKey}
      onSplooshimaApiKeyChange={(v) => {
        setSplooshimaApiKey(v);
        localStorage.setItem("splooshima_api_key", v);
      }}
      theme={theme}
      onThemeChange={setTheme}
      startWithWindows={startWithWindows}
      onStartWithWindowsChange={async (v) => {
        setStartWithWindows(v);
        localStorage.setItem("start_with_windows", String(v));
        try {
          const { enable, disable } = await import("@tauri-apps/plugin-autostart");
          if (v) await enable();
          else await disable();
        } catch (e) {
          console.error("[autostart]", e);
        }
      }}
      startMinimized={startMinimized}
      onStartMinimizedChange={(v) => {
        setStartMinimized(v);
        localStorage.setItem("start_minimized", String(v));
      }}
      minimizeToTray={minimizeToTray}
      onMinimizeToTrayChange={(v) => {
        setMinimizeToTray(v);
        localStorage.setItem("minimize_to_tray", String(v));
      }}
      simplifiedTheme={simplifiedTheme}
      onSimplifiedThemeChange={(v) => {
        setSimplifiedTheme(v);
        localStorage.setItem("simplified_theme", String(v));
      }}
      customTheme={customTheme}
      onCustomThemeChange={setCustomTheme}
      discordRpc={discordRpc}
      onDiscordRpcChange={setDiscordRpc}
      closeWithGame={closeWithGame}
      onCloseWithGameChange={(v) => {
        setCloseWithGame(v);
        localStorage.setItem("close_with_game", String(v));
      }}
      disableAnimations={disableAnimations}
      onDisableAnimationsChange={setDisableAnimations}
      updateInfo={updateInfo}
      onShowUpdate={() => setShowUpdateModal(true)}
      notificationsEnabled={notificationsEnabled}
      onNotificationsEnabledChange={(v) => {
        setNotificationsEnabled(v);
        localStorage.setItem("notifications_enabled", String(v));
        if (!v) destroyNotifWindow();
      }}
      notificationPosition={notificationPosition}
      onNotificationPositionChange={(v) => {
        setNotificationPosition(v);
        localStorage.setItem("notification_position", v);
        destroyNotifWindow();
      }}
      notificationScreen={notificationScreen}
      onNotificationScreenChange={(v) => {
        setNotificationScreen(v);
        localStorage.setItem("notification_screen", v);
        destroyNotifWindow();
      }}
      spikeTimerEnabled={spikeTimerEnabled}
      onSpikeTimerEnabledChange={(v) => {
        setSpikeTimerEnabled(v);
        localStorage.setItem("spike_timer_enabled", String(v));
      }}
    />
  );
}
