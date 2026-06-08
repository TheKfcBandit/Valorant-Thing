// Valorant crosshair share-code parser + encoder (#40).
//
// Format (community-reverse-engineered — not in any public Riot doc; the
// game emits and accepts this exact shape via the in-game "import code"
// flow). Semicolon-delimited tokens. The first token is a version digit
// followed by one or more profile sections, each introduced by a single
// uppercase letter (P/A/S) and then a flat run of key;value pairs.
//
// Example:
//   0;P;c;5;u;FFFFFFFF;h;0;f;0;0t;1;0l;3;0o;2;0a;1;0f;0;1t;1;1l;2;1o;3;1a;0.35;1m;0;1f;0;1b;0
//   │  │ └── primary section keys ────────────────────────────────────────────────────────
//   │  └── primary section marker
//   └── format version
//
// Section markers:
//   P = Primary profile (most weapons)
//   A = Aim Down Sights override (only present when set differently than P)
//   S = Sniper Scope override
//
// Within a section, key prefixes carry meaning:
//   0t / 0l / 0o / 0a ...  = inner-line fields
//   1t / 1l / 1o / 1a ...  = outer-line fields
//   bare letters (c/u/h/o/t/d/z/a/...) = profile-wide
//
// This module stays tolerant: unknown keys round-trip without loss so
// a future game patch that adds a field doesn't lose user data.

const SECTION_MARKERS = new Set(["P", "A", "S"]);
const SECTION_TO_KEY = { P: "primary", A: "ads", S: "sniper" };
const KEY_TO_SECTION = { primary: "P", ads: "A", sniper: "S" };

/**
 * Parse a crosshair share code into a typed object. Returns null for
 * unparseable input (empty, no version, no sections).
 *
 * @param {string} code
 * @returns {{ version: string, primary: Record<string,string>|null,
 *             ads: Record<string,string>|null,
 *             sniper: Record<string,string>|null } | null}
 */
export function parseCrosshairCode(code) {
  const tokens = String(code || "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tokens.length === 0) return null;

  const result = { version: tokens[0], primary: null, ads: null, sniper: null };
  let section = null;
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (SECTION_MARKERS.has(t)) {
      section = {};
      result[SECTION_TO_KEY[t]] = section;
      i += 1;
      continue;
    }
    if (section == null) {
      // Stray pair before any section — treat as part of an implicit
      // primary section so a malformed-but-valuable code still renders.
      section = {};
      result.primary = section;
    }
    const key = t;
    const value = tokens[i + 1];
    if (value == null) {
      i += 1;
      continue;
    }
    section[key] = value;
    i += 2;
  }

  // A code without ANY section is unusable for rendering — reject.
  if (!result.primary && !result.ads && !result.sniper) return null;
  return result;
}

/**
 * Encode a parsed crosshair object back into a share-code string.
 * Round-trips with `parseCrosshairCode` (key order within a section is
 * insertion order, which is stable in JS objects).
 *
 * @param {ReturnType<typeof parseCrosshairCode>} parsed
 * @returns {string}
 */
export function encodeCrosshairCode(parsed) {
  if (!parsed) return "";
  const parts = [parsed.version || "0"];
  for (const sectionKey of ["primary", "ads", "sniper"]) {
    const section = parsed[sectionKey];
    if (!section) continue;
    parts.push(KEY_TO_SECTION[sectionKey]);
    for (const [k, v] of Object.entries(section)) {
      parts.push(k, String(v));
    }
  }
  return parts.join(";");
}

// ----- Field readers ------------------------------------------------------
//
// The renderer wants typed values with sensible defaults. These helpers
// pull from the section object (string-valued), parse, and clamp to the
// game's accepted range. A missing field falls back to the game's
// in-engine default — which we approximate, since the official defaults
// aren't documented either.

function numOr(map, key, fallback) {
  const v = map?.[key];
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(map, key, fallback) {
  const v = map?.[key];
  if (v == null) return fallback;
  return v === "1" || v === "true";
}

// Color palette indices 0-7 map to Valorant's preset crosshair colors;
// 8 means "use the custom hex in `u`". These RGB values are approximate
// reads from the in-game picker — verified visually against real codes,
// not from any Riot reference.
const COLOR_PRESETS = [
  "#FFFFFF", // 0  white
  "#00FF00", // 1  green
  "#7FFF00", // 2  yellow-green
  "#BFFF00", // 3  green-yellow
  "#FFFF00", // 4  yellow
  "#00FFFF", // 5  cyan
  "#FF00FF", // 6  pink
  "#FF0000", // 7  red
];

function expandCustomHex(hex) {
  // Valorant stores RGBA, but the alpha channel here is the *crosshair's*
  // overall alpha which we apply separately via opacity fields. Strip to
  // RGB for canvas; ignore any alpha component if present.
  const clean = String(hex || "")
    .replace(/^#/, "")
    .toUpperCase();
  if (clean.length >= 6 && /^[0-9A-F]+$/.test(clean)) {
    return "#" + clean.slice(0, 6);
  }
  return "#FFFFFF";
}

/**
 * Translate a parsed section into the typed shape the canvas renderer
 * consumes. Section may be `null` (e.g. the code only specifies P and
 * the consumer asked for `ads`); we return null so the renderer can
 * decide what to do.
 *
 * @param {Record<string, string> | null} section
 * @returns {null | {
 *   color: string,
 *   outline: { show: boolean, opacity: number, thickness: number },
 *   dot: { show: boolean, thickness: number, opacity: number },
 *   inner: { show: boolean, thickness: number, length: number, verticalLength: number, offset: number, opacity: number },
 *   outer: { show: boolean, thickness: number, length: number, verticalLength: number, offset: number, opacity: number },
 * }}
 */
export function readProfile(section) {
  if (!section) return null;
  const colorIdx = numOr(section, "c", 0);
  const color =
    colorIdx === 8
      ? expandCustomHex(section.u)
      : COLOR_PRESETS[Math.max(0, Math.min(7, Math.round(colorIdx)))];

  return {
    color,
    outline: {
      show: boolOr(section, "h", false),
      opacity: numOr(section, "o", 0.5),
      thickness: numOr(section, "t", 1),
    },
    dot: {
      show: boolOr(section, "d", false),
      thickness: numOr(section, "z", 2),
      opacity: numOr(section, "a", 1),
    },
    inner: {
      show: boolOr(section, "0b", true),
      thickness: numOr(section, "0t", 2),
      length: numOr(section, "0l", 4),
      verticalLength: numOr(section, "0v", numOr(section, "0l", 4)),
      offset: numOr(section, "0o", 2),
      opacity: numOr(section, "0a", 1),
    },
    outer: {
      show: boolOr(section, "1b", false),
      thickness: numOr(section, "1t", 2),
      length: numOr(section, "1l", 2),
      verticalLength: numOr(section, "1v", numOr(section, "1l", 2)),
      offset: numOr(section, "1o", 10),
      opacity: numOr(section, "1a", 0.35),
    },
  };
}
