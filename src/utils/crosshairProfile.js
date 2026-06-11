// Share-code → Riot crosshair-profile JSON (#45). Pure transform: builds
// the profile object that slots into the SavedCrosshairProfileData list
// inside the Ares.PlayerSettings blob (see utils/playerSettings.js).
//
// Field names follow Unreal serialization as round-tripped by community
// tools that write this exact blob (weedeej/ValorantCC: ProfileList /
// CrosshairProfile / ProfileSettings / LineSettings classes).
//
// Strategy: start from a COMPLETE profile at the game's defaults, then
// overlay only the keys present in the code — the game omits
// default-valued keys when exporting a share code, so an absent key
// means "game default", and unknown keys are deliberately ignored.
// Defaults differ from readProfile() in crosshair.js on purpose: that
// table approximates for canvas rendering; this one must match what the
// game itself fills in (e.g. outlines default ON in-game).

import { boolOr, numOr, parseCrosshairCode } from "./crosshair";

// Exact preset palette (indices 0-7; 8 = custom hex in `u`). Index 3
// "green yellow" is #DFFF00 per the in-game picker — the renderer's
// approximate palette in crosshair.js uses #BFFF00 and stays as-is.
export const CROSSHAIR_COLOR_RGB = [
  "FFFFFF", // 0 white
  "00FF00", // 1 green
  "7FFF00", // 2 yellow green
  "DFFF00", // 3 green yellow
  "FFFF00", // 4 yellow
  "00FFFF", // 5 cyan
  "FF00FF", // 6 pink
  "FF0000", // 7 red
];

const WHITE = { R: 255, G: 255, B: 255, A: 255 };
const BLACK = { R: 0, G: 0, B: 0, A: 255 };

const INNER_DEFAULTS = {
  lineThickness: 2,
  lineLength: 6,
  lineOffset: 3,
  opacity: 0.8,
  showLines: true,
  showMovementError: false,
  showShootingError: true,
};

const OUTER_DEFAULTS = {
  lineThickness: 2,
  lineLength: 2,
  lineOffset: 10,
  opacity: 0.35,
  showLines: true,
  showMovementError: true,
  showShootingError: true,
};

/**
 * Build a Riot-shaped crosshair profile from a share code. Returns null
 * when the code has no primary section (same validity bar as the editor).
 *
 * @param {string} code
 * @param {string} profileName
 */
export function crosshairCodeToRiotProfile(code, profileName) {
  const parsed = parseCrosshairCode(code);
  if (!parsed?.primary) return null;
  return {
    ProfileName: String(profileName ?? ""),
    // `s;1` before the first section is the advanced-options flag; a code
    // that carries A/S overrides implies it even when the flag is absent.
    bUseAdvancedOptions:
      boolOr(parsed.globals, "s", false) || parsed.ads != null || parsed.sniper != null,
    bUsePrimaryCrosshairForADS: parsed.ads == null,
    Primary: buildProfileSettings(parsed.primary),
    aDS: buildProfileSettings(parsed.ads ?? parsed.primary),
    Sniper: buildSniperSettings(parsed.sniper),
  };
}

function buildProfileSettings(section) {
  return {
    Color: sectionColor(section),
    bHasOutline: boolOr(section, "h", true),
    OutlineThickness: numOr(section, "t", 1),
    OutlineColor: BLACK,
    OutlineOpacity: numOr(section, "o", 0.5),
    bDisplayCenterDot: boolOr(section, "d", false),
    CenterDotSize: numOr(section, "z", 2),
    CenterDotOpacity: numOr(section, "a", 1),
    bFadeCrosshairWithFiringError: boolOr(section, "f", true),
    bFixMinErrorAcrossWeapons: boolOr(section, "m", false),
    InnerLines: buildLineSettings(section, "0", INNER_DEFAULTS),
    OuterLines: buildLineSettings(section, "1", OUTER_DEFAULTS),
  };
}

function buildLineSettings(section, prefix, defaults) {
  const length = numOr(section, `${prefix}l`, defaults.lineLength);
  return {
    LineThickness: numOr(section, `${prefix}t`, defaults.lineThickness),
    LineLength: length,
    VLineLength: numOr(section, `${prefix}v`, length),
    bAllowVertScaling: boolOr(section, `${prefix}g`, false),
    LineOffset: numOr(section, `${prefix}o`, defaults.lineOffset),
    Opacity: numOr(section, `${prefix}a`, defaults.opacity),
    bShowLines: boolOr(section, `${prefix}b`, defaults.showLines),
    bShowMovementError: boolOr(section, `${prefix}m`, defaults.showMovementError),
    bShowShootingError: boolOr(section, `${prefix}f`, defaults.showShootingError),
    bShowMinError: true,
    FiringErrorScale: numOr(section, `${prefix}s`, 1),
    MovementErrorScale: numOr(section, `${prefix}e`, 1),
  };
}

// The sniper scope is a center dot only — the section's color keys feed
// CenterDotColor, and its d/s/o keys carry dot show/size/opacity (unlike
// P/A where those letters mean dot-show / outline-opacity).
function buildSniperSettings(section) {
  return {
    CenterDotColor: section ? sectionColor(section) : WHITE,
    bDisplayCenterDot: boolOr(section, "d", true),
    CenterDotSize: numOr(section, "s", 1),
    CenterDotOpacity: numOr(section, "o", 0.75),
  };
}

// `b;1` forces the custom hex in `u` regardless of the preset index;
// `c;8` means custom too. Otherwise the preset palette applies.
function sectionColor(section) {
  const idx = numOr(section, "c", 0);
  const useCustom = boolOr(section, "b", false) || idx === 8;
  if (useCustom && section?.u != null) return hexToColor(section.u);
  return hexToColor(CROSSHAIR_COLOR_RGB[Math.max(0, Math.min(7, Math.round(idx)))]);
}

function hexToColor(hex) {
  const clean = String(hex || "")
    .replace(/^#/, "")
    .toUpperCase();
  if (!/^[0-9A-F]{6}([0-9A-F]{2})?$/.test(clean)) return { ...WHITE };
  const part = (i) => parseInt(clean.slice(i, i + 2), 16);
  return {
    R: part(0),
    G: part(2),
    B: part(4),
    A: clean.length === 8 ? part(6) : 255,
  };
}
