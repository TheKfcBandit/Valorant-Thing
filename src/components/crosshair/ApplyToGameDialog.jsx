import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAsyncEffect } from "../../hooks/useAsyncEffect";
import { AlertTriangle, Crosshair } from "../../icons";
import { crosshairCodeToRiotProfile } from "../../utils/crosshairProfile";
import {
  appendCrosshairProfile,
  classifyPlayerSettingsError,
  isPlayerSettingsMarkedUnavailable,
  MAX_CROSSHAIR_PROFILES,
  notePlayerSettingsSuccess,
  readCrosshairProfiles,
} from "../../utils/playerSettings";

// #45: push a share code into the account's saved crosshair profiles.
// Appends a NEW profile and selects it — never overwrites existing ones.
// The backend snapshots the server blob before the write and blocks it
// while VALORANT runs (the game rewrites settings on exit).

export function ApplyToGameDialog({ code, name, onClose }) {
  // phase: "loading" | "ready" | "applying" | "done" | "blocked"
  const [state, setState] = useState({ phase: "loading" });

  useAsyncEffect(async (isCancelled) => {
    if (isPlayerSettingsMarkedUnavailable()) {
      setState({
        phase: "blocked",
        text: "Player settings aren't available for this session.",
      });
      return;
    }
    let gameRunning = false;
    try {
      gameRunning = await invoke("is_valorant_running");
    } catch (e) {
      console.warn("[ApplyToGame] game check suppressed:", e);
    }
    try {
      const raw = await invoke("get_player_settings");
      if (isCancelled()) return;
      notePlayerSettingsSuccess();
      const settings = JSON.parse(raw);
      const summary = readCrosshairProfiles(settings);
      if (!summary) {
        setState({
          phase: "blocked",
          text: "Couldn't parse the crosshair profiles saved on this account — not risking an overwrite.",
        });
        return;
      }
      if (summary.profileNames.length >= MAX_CROSSHAIR_PROFILES) {
        setState({
          phase: "blocked",
          text: `The in-game profile list is full (${MAX_CROSSHAIR_PROFILES}). Delete a profile in-game first.`,
        });
        return;
      }
      setState({ phase: "ready", settings, count: summary.profileNames.length, gameRunning });
    } catch (e) {
      if (isCancelled()) return;
      setState({ phase: "blocked", text: describeError(e) });
    }
  }, []);

  const handleApply = async () => {
    const { settings: current, count, gameRunning } = state;
    setState({ phase: "applying" });
    try {
      const profile = crosshairCodeToRiotProfile(code, name);
      if (!profile) throw new Error("That crosshair code couldn't be converted.");
      const { settings } = appendCrosshairProfile(current, profile);
      await invoke("set_player_settings", { decodedJson: JSON.stringify(settings) });
      notePlayerSettingsSuccess();
      setState({ phase: "done" });
    } catch (e) {
      setState({ phase: "ready", settings: current, count, gameRunning, error: describeError(e) });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-base-700 border border-border rounded-xl p-5 max-w-sm w-full space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Crosshair size={16} className="text-val-red shrink-0" />
          <p className="text-sm font-display font-semibold text-text-primary">Apply to game</p>
        </div>

        {state.phase === "loading" && (
          <p className="text-xs font-body text-text-muted">Reading your saved settings…</p>
        )}

        {state.phase === "blocked" && (
          <p className="text-xs font-body text-val-red">{state.text}</p>
        )}

        {(state.phase === "ready" || state.phase === "applying") && (
          <>
            <p className="text-xs font-body text-text-muted">
              &ldquo;{name}&rdquo; will be added as profile {state.count + 1} of{" "}
              {MAX_CROSSHAIR_PROFILES} and selected as your current crosshair. Your existing
              profiles stay untouched, and the previous server settings are backed up first (restore
              from Settings).
            </p>
            <p className="text-[11px] font-body text-text-muted">
              Writes go through the same endpoint the game client uses — this may breach Riot&apos;s
              Terms of Service. The change appears next time VALORANT launches.
            </p>
            {state.gameRunning && (
              <p className="flex items-start gap-1.5 text-xs font-body text-amber-400">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                VALORANT is running — close it first. The game overwrites server settings when it
                exits, so the write is blocked while it runs.
              </p>
            )}
            {state.error && <p className="text-xs font-body text-val-red">{state.error}</p>}
          </>
        )}

        {state.phase === "done" && (
          <p className="text-xs font-body text-status-green">
            Applied. Launch VALORANT and the new profile will be selected. Your previous settings
            were backed up — restore them from Settings if anything looks wrong.
          </p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            {state.phase === "done" ? "Close" : "Cancel"}
          </button>
          {(state.phase === "ready" || state.phase === "applying") && (
            <button
              onClick={handleApply}
              disabled={state.phase === "applying" || state.gameRunning}
              className="px-3 py-1.5 rounded-lg text-xs font-body bg-val-red/20 text-val-red hover:bg-val-red/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {state.phase === "applying" ? "Applying…" : "Write to account"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function describeError(e) {
  const msg = String(e?.message ?? e);
  const kind = classifyPlayerSettingsError(msg);
  if (kind === "game-running") {
    return "Close VALORANT first — the game overwrites server settings when it exits.";
  }
  if (kind === "auth-refreshing") return "Session is refreshing — try again in a moment.";
  if (kind === "unavailable") return "Player settings aren't available for this session.";
  return msg;
}
