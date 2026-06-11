import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { exportVtFile, readVtFile } from "../../cloud";
import { useAsyncEffect } from "../../hooks/useAsyncEffect";
import { Label } from "../ui/Label";
import { AlertTriangle, DownloadTray, RefreshCcw, UploadTray } from "../../icons";
import {
  classifyPlayerSettingsError,
  isPlayerSettingsMarkedUnavailable,
  notePlayerSettingsSuccess,
} from "../../utils/playerSettings";

// #39: export / import / restore the server-side in-game settings blob.
// Writes are guarded twice: the backend hard-blocks while VALORANT runs
// (it would clobber the write on exit) and snapshots the server state
// before every PUT — the restore buttons surface those snapshots.

const VT_TYPE = "player_settings";
const BTN =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors disabled:opacity-40 disabled:pointer-events-none";

const fmtDate = (ms) => new Date(ms).toLocaleString();

export function PlayerSettingsSection({ valorantConnected }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [unavailable, setUnavailable] = useState(isPlayerSettingsMarkedUnavailable());
  const [backupInfo, setBackupInfo] = useState({ originalMs: null, latestMs: null });
  const [confirm, setConfirm] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useAsyncEffect(
    async (isCancelled) => {
      try {
        const raw = await invoke("get_player_settings_backup_info");
        if (!isCancelled()) setBackupInfo(JSON.parse(raw));
      } catch (e) {
        console.warn("[PlayerSettings] backup info suppressed:", e);
      }
    },
    [refreshKey]
  );

  const fail = (e) => {
    const msg = String(e?.message ?? e);
    const kind = classifyPlayerSettingsError(msg);
    if (kind === "game-running") {
      setFeedback({
        tone: "warn",
        text: "Close VALORANT first — the game overwrites server settings when it exits.",
      });
    } else if (kind === "auth-refreshing") {
      setFeedback({ tone: "warn", text: "Session is refreshing — try again in a moment." });
    } else if (kind === "unavailable") {
      setUnavailable(true);
      setFeedback({ tone: "error", text: "Player settings aren't available for this session." });
    } else {
      setFeedback({ tone: "error", text: msg });
    }
  };

  const runWrite = async (command, args, successText) => {
    setBusy(true);
    setFeedback(null);
    try {
      await invoke(command, args);
      notePlayerSettingsSuccess();
      setFeedback({ tone: "ok", text: successText });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const raw = await invoke("get_player_settings");
      notePlayerSettingsSuccess();
      exportVtFile(VT_TYPE, JSON.parse(raw), "player-settings.vt");
      setFeedback({ tone: "ok", text: "Settings exported." });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = async (cfg) => {
    let gameRunning = false;
    try {
      gameRunning = await invoke("is_valorant_running");
    } catch (e) {
      console.warn("[PlayerSettings] game check suppressed:", e);
    }
    setConfirm({ ...cfg, gameRunning });
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFeedback(null);
    try {
      const vt = await readVtFile(file);
      if (vt.type !== VT_TYPE || typeof vt.data !== "object" || Array.isArray(vt.data)) {
        setFeedback({ tone: "error", text: "That file isn't a player-settings export." });
        return;
      }
      openConfirm({
        title: "Import in-game settings",
        detail:
          "Replaces every account-bound in-game setting (sensitivity, keybinds, crosshairs, …) with the file's contents. The current server settings are backed up first.",
        run: () =>
          runWrite(
            "set_player_settings",
            { decodedJson: JSON.stringify(vt.data) },
            "Settings imported. They take effect next time VALORANT launches."
          ),
      });
    } catch (err) {
      setFeedback({ tone: "error", text: String(err?.message ?? err) });
    }
  };

  const handleRestore = (which, dateMs) =>
    openConfirm({
      title: which === "original" ? "Restore original backup" : "Restore last backup",
      detail: `Writes the snapshot taken ${fmtDate(dateMs)} back to your account.`,
      run: () =>
        runWrite(
          "restore_player_settings_backup",
          { which },
          "Backup restored. It takes effect next time VALORANT launches."
        ),
    });

  const disabled = !valorantConnected || unavailable || busy;
  const toneClass = { ok: "text-status-green", warn: "text-amber-400", error: "text-val-red" };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl bg-base-700 border border-border divide-y divide-border"
    >
      <div className="px-4 pt-3 pb-1">
        <Label as="h2">In-Game Settings</Label>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs font-body text-text-muted">
          Back up and restore the settings saved on your Riot account — sensitivity, keybinds,
          crosshair profiles and more. Reads and writes go through the same endpoint the game client
          uses; writing settings this way may breach Riot&apos;s Terms of Service, so every action
          here is manual and at your own risk. A backup is taken before every write.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleExport} disabled={disabled} className={BTN}>
            <DownloadTray />
            Export .vt
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={disabled} className={BTN}>
            <UploadTray />
            Import .vt
          </button>
          {backupInfo.latestMs != null && (
            <button
              onClick={() => handleRestore("latest", backupInfo.latestMs)}
              disabled={disabled}
              className={BTN}
              title={`Snapshot from ${fmtDate(backupInfo.latestMs)}`}
            >
              <RefreshCcw />
              Restore last backup
            </button>
          )}
          {backupInfo.originalMs != null && backupInfo.originalMs !== backupInfo.latestMs && (
            <button
              onClick={() => handleRestore("original", backupInfo.originalMs)}
              disabled={disabled}
              className={BTN}
              title={`Snapshot from ${fmtDate(backupInfo.originalMs)}`}
            >
              <RefreshCcw />
              Restore original
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".vt"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
        {!valorantConnected && (
          <p className="text-[11px] font-body text-text-muted">Connect to Riot to use this.</p>
        )}
        {unavailable && (
          <p className="text-[11px] font-body text-text-muted">
            Riot rejected access to player settings for this session — the feature is disabled until
            the next reconnect.
          </p>
        )}
        {feedback && (
          <p className={`text-[11px] font-body ${toneClass[feedback.tone]}`}>{feedback.text}</p>
        )}
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirm(null)}
        >
          <div
            className="bg-base-700 border border-border rounded-xl p-5 max-w-sm w-full space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <p className="text-sm font-display font-semibold text-text-primary">
                {confirm.title}
              </p>
            </div>
            <p className="text-xs font-body text-text-muted">{confirm.detail}</p>
            {confirm.gameRunning && (
              <p className="text-xs font-body text-amber-400">
                VALORANT is running — close it first. The game overwrites server settings when it
                exits, and the write is blocked while it runs.
              </p>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirm.run}
                disabled={busy || confirm.gameRunning}
                className="px-3 py-1.5 rounded-lg text-xs font-body bg-val-red/20 text-val-red hover:bg-val-red/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                {busy ? "Writing…" : "Write to account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
