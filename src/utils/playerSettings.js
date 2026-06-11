// Boundary for the decoded `Ares.PlayerSettings` blob (player-preferences
// service, #39/#45). Like riotShapes.js: every raw Riot field this feature
// touches (settingEnum keys, PascalCase crosshair-profile fields) is read
// and written HERE — components consume these helpers and never see the
// raw shapes. This boundary writes back as well as reads, so it preserves
// unknown fields instead of normalizing them away.

/** Contract with src-tauri/src/riot/pd_session.rs — transient, retry later. */
export const AUTH_REFRESHING = "AUTH_REFRESHING";
/** Contract with src-tauri/src/commands/playerpref.rs — close the game first. */
export const GAME_RUNNING = "GAME_RUNNING";

export const SAVED_CROSSHAIR_ENUM = "EAresStringSettingName::SavedCrosshairProfileData";

// In-game profile-list cap. Community-documented; re-checked against a real
// blob during #45 verification.
export const MAX_CROSSHAIR_PROFILES = 15;

export function isFeatureUnavailable(message) {
  return /HTTP 40[34]\b/.test(String(message ?? ""));
}

// The SGP player-preferences service answers 403 "RBAC: access denied"
// when the access token lacks its role — which is exactly the case for
// the webview-OAuth offline token (scope: account openid). The lockfile
// token from a running Riot Client carries the role. So this 403 is NOT
// a dead end like a generic one: it clears the moment the user opens the
// Riot Client and the app reconnects in lockfile mode.
export function isClientSessionRequired(message) {
  const msg = String(message ?? "");
  return /HTTP 403\b/.test(msg) && /RBAC|access denied/i.test(msg);
}

// Per-launch memo shared by the Settings section and the Crosshair dialog:
// once Riot answers 403/404 the endpoint won't start working until at least
// a reconnect, so both surfaces render a disabled state instead of retrying.
// On OAuth sessions a genuine 403 never surfaces directly (pd_session maps
// it to AUTH_REFRESHING), so repeated sentinels also flip the memo.
let unavailableThisLaunch = false;
let consecutiveAuthRefreshing = 0;
const AUTH_REFRESHING_LIMIT = 3;

export function isPlayerSettingsMarkedUnavailable() {
  return unavailableThisLaunch;
}

export function notePlayerSettingsSuccess() {
  consecutiveAuthRefreshing = 0;
}

/**
 * Map a failed player-settings command into a UI state.
 * @returns {"game-running" | "auth-refreshing" | "client-required" | "unavailable" | "error"}
 */
export function classifyPlayerSettingsError(message) {
  const msg = String(message ?? "");
  if (msg.includes(GAME_RUNNING)) return "game-running";
  if (msg.includes(AUTH_REFRESHING)) {
    consecutiveAuthRefreshing += 1;
    if (consecutiveAuthRefreshing >= AUTH_REFRESHING_LIMIT) {
      unavailableThisLaunch = true;
      return "unavailable";
    }
    return "auth-refreshing";
  }
  consecutiveAuthRefreshing = 0;
  // Retryable: the offline-OAuth token can't reach this service, but a
  // lockfile session can. Don't poison the per-launch memo.
  if (isClientSessionRequired(msg)) return "client-required";
  if (isFeatureUnavailable(msg)) {
    unavailableThisLaunch = true;
    return "unavailable";
  }
  return "error";
}

export function readStringSetting(settings, settingEnum) {
  const list = Array.isArray(settings?.stringSettings) ? settings.stringSettings : [];
  const entry = list.find((s) => s?.settingEnum === settingEnum);
  return typeof entry?.value === "string" ? entry.value : null;
}

/** Returns a new settings object; appends the entry when missing. */
export function writeStringSetting(settings, settingEnum, value) {
  const list = Array.isArray(settings?.stringSettings) ? settings.stringSettings : [];
  const idx = list.findIndex((s) => s?.settingEnum === settingEnum);
  const next =
    idx >= 0
      ? list.map((s, i) => (i === idx ? { ...s, value } : s))
      : [...list, { settingEnum, value }];
  return { ...settings, stringSettings: next };
}

/**
 * Summary of the saved crosshair profiles for display. `missing: true`
 * means the account has never customized a crosshair (no setting stored).
 * Returns null when the stored value exists but can't be parsed — callers
 * must block writes in that case rather than risk wiping profiles.
 */
export function readCrosshairProfiles(settings) {
  const raw = readStringSetting(settings, SAVED_CROSSHAIR_ENUM);
  if (raw == null) return { currentProfile: 0, profileNames: [], missing: true };
  const container = parseProfileContainer(raw);
  if (!container) return null;
  return {
    currentProfile: Number(container.CurrentProfile) || 0,
    profileNames: container.Profiles.map((p) => String(p?.ProfileName ?? "")),
    missing: false,
  };
}

/**
 * Append a Riot-shaped crosshair profile and select it as current.
 * Throws with a user-facing message at the cap or on an unparseable
 * existing list. Returns `{ settings, index }`.
 */
export function appendCrosshairProfile(settings, riotProfile) {
  const raw = readStringSetting(settings, SAVED_CROSSHAIR_ENUM);
  let container = { CurrentProfile: 0, Profiles: [] };
  if (raw != null) {
    container = parseProfileContainer(raw);
    if (!container) {
      throw new Error(
        "Couldn't parse the crosshair profiles already saved on this account — not overwriting them."
      );
    }
  }
  if (container.Profiles.length >= MAX_CROSSHAIR_PROFILES) {
    throw new Error(
      `The in-game profile list is full (${MAX_CROSSHAIR_PROFILES}). Delete a profile in-game first.`
    );
  }
  const index = container.Profiles.length;
  const next = {
    ...container,
    CurrentProfile: index,
    Profiles: [...container.Profiles, riotProfile],
  };
  return {
    settings: writeStringSetting(settings, SAVED_CROSSHAIR_ENUM, JSON.stringify(next)),
    index,
  };
}

function parseProfileContainer(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.Profiles) ? parsed : null;
  } catch {
    return null;
  }
}
