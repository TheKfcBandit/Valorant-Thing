import { hexToRgb } from "./utils/color";

// Build a CSS linear-gradient string from a custom-theme config.
// Stops are sorted by `pos` so callers can store them in any order.
export function buildGradientCSS(ct) {
  const stops = [...ct.stops].sort((a, b) => a.pos - b.pos);
  return `linear-gradient(${ct.angle}deg, ${stops.map((s) => `${s.color} ${s.pos}%`).join(", ")})`;
}

// Build the theme payload sent to the notification-overlay window.
// For named presets the overlay only needs the name (its own stylesheet
// reads `data-theme`); for "custom" we also send the derived CSS vars
// so the overlay can apply them without re-running the math.
export function buildNotifThemePayload() {
  const name = localStorage.getItem("app_theme") || "crimson-moon";
  if (name !== "custom") return { name };
  try {
    const ct = JSON.parse(localStorage.getItem("custom_theme"));
    const vars = ct?.vars || deriveCustomVars(ct);
    return { name, vars };
  } catch {
    return { name };
  }
}

// Theme presets surfaced in the SettingsPage theme picker. Each entry
// is a complete bundle of CSS custom-property values keyed by the
// names declared in CUSTOM_VARS.
export const THEMES = [
  {
    id: "crimson-moon",
    name: "Crimson Moon",
    bg: "#1C1212",
    accent: "#ED4245",
    vars: {
      "--base-900": "16 10 10",
      "--base-800": "28 18 18",
      "--base-700": "34 24 24",
      "--base-600": "44 32 32",
      "--base-500": "56 42 42",
      "--base-400": "68 54 54",
      "--border": "80 62 62",
      "--border-light": "96 76 76",
      "--val-red": "237 66 69",
      "--val-red-dark": "200 50 55",
      "--accent-blue": "237 66 69",
      "--accent-blue-dark": "200 50 55",
    },
  },
  {
    id: "radianite",
    name: "Radianite",
    bg: "#061828",
    accent: "#00E6B4",
    vars: {
      "--base-900": "4 12 16",
      "--base-800": "8 20 28",
      "--base-700": "12 28 36",
      "--base-600": "18 38 48",
      "--base-500": "26 50 62",
      "--base-400": "36 64 78",
      "--border": "44 76 90",
      "--border-light": "56 92 108",
      "--val-red": "0 230 180",
      "--val-red-dark": "0 190 148",
      "--accent-blue": "0 230 180",
      "--accent-blue-dark": "0 190 148",
    },
  },
  {
    id: "midnight-blurple",
    name: "Midnight Blurple",
    bg: "#161624",
    accent: "#5865F2",
    vars: {
      "--base-900": "12 12 22",
      "--base-800": "22 22 36",
      "--base-700": "28 28 44",
      "--base-600": "36 36 56",
      "--base-500": "46 46 68",
      "--base-400": "58 58 82",
      "--border": "66 66 94",
      "--border-light": "80 80 112",
      "--val-red": "88 101 242",
      "--val-red-dark": "68 81 210",
      "--accent-blue": "88 101 242",
      "--accent-blue-dark": "68 81 210",
    },
  },
  {
    id: "chroma-glow",
    name: "Chroma Glow",
    bg: "#1C161C",
    accent: "#FF73FA",
    vars: {
      "--base-900": "16 12 16",
      "--base-800": "28 22 28",
      "--base-700": "36 28 36",
      "--base-600": "46 36 46",
      "--base-500": "58 46 58",
      "--base-400": "72 58 72",
      "--border": "84 68 84",
      "--border-light": "100 82 100",
      "--val-red": "255 115 250",
      "--val-red-dark": "220 90 215",
      "--accent-blue": "255 115 250",
      "--accent-blue-dark": "220 90 215",
    },
  },
  {
    id: "forest",
    name: "Forest",
    bg: "#121C16",
    accent: "#43B581",
    vars: {
      "--base-900": "10 16 12",
      "--base-800": "18 28 22",
      "--base-700": "24 36 28",
      "--base-600": "32 46 36",
      "--base-500": "42 58 46",
      "--base-400": "54 70 58",
      "--border": "64 82 68",
      "--border-light": "78 98 82",
      "--val-red": "67 181 129",
      "--val-red-dark": "52 150 105",
      "--accent-blue": "67 181 129",
      "--accent-blue-dark": "52 150 105",
    },
  },
  {
    id: "mars",
    name: "Mars",
    bg: "#200C06",
    accent: "#F26522",
    vars: {
      "--base-900": "18 10 6",
      "--base-800": "32 18 12",
      "--base-700": "40 24 18",
      "--base-600": "52 34 26",
      "--base-500": "64 44 34",
      "--base-400": "78 56 44",
      "--border": "92 68 54",
      "--border-light": "108 82 66",
      "--val-red": "242 101 34",
      "--val-red-dark": "210 82 24",
      "--accent-blue": "242 101 34",
      "--accent-blue-dark": "210 82 24",
    },
  },
  {
    id: "dusk",
    name: "Dusk",
    bg: "#282C32",
    accent: "#99AAB5",
    vars: {
      "--base-900": "28 30 34",
      "--base-800": "40 44 50",
      "--base-700": "48 52 60",
      "--base-600": "58 64 72",
      "--base-500": "70 76 86",
      "--base-400": "84 90 102",
      "--border": "96 104 116",
      "--border-light": "112 120 134",
      "--val-red": "153 170 181",
      "--val-red-dark": "128 142 152",
      "--accent-blue": "153 170 181",
      "--accent-blue-dark": "128 142 152",
    },
  },
];

// The CSS custom properties every theme MUST define. Used by App.jsx
// when applying a theme, and by SettingsPage's custom-theme picker.
export const CUSTOM_VARS = [
  "--base-900",
  "--base-800",
  "--base-700",
  "--base-600",
  "--base-500",
  "--base-400",
  "--border",
  "--border-light",
  "--val-red",
  "--val-red-dark",
  "--accent-blue",
  "--accent-blue-dark",
];

// Default starting point when a user opens the custom-theme builder
// for the first time.
export const DEFAULT_CUSTOM = {
  accent: "#e94560",
  angle: 135,
  stops: [
    { color: "#0a0a14", pos: 0 },
    { color: "#1a1a2e", pos: 50 },
    { color: "#e94560", pos: 100 },
  ],
};

// Compute CUSTOM_VARS values from a user's custom-theme config
// (gradient stops + accent). The darkest stop drives the base ramp;
// each base is mixed `t` towards the accent so the surface picks up
// the chosen hue without going garish.
export function deriveCustomVars(ct) {
  const darkest = [...ct.stops].sort((a, b) => {
    const [ar, ag, ab] = hexToRgb(a.color);
    const [br2, bg2, bb2] = hexToRgb(b.color);
    return ar + ag + ab - (br2 + bg2 + bb2);
  })[0];
  const [br, bg, bb] = hexToRgb(darkest.color);
  const [ar, ag, ab] = hexToRgb(ct.accent);
  const t = 0.08;
  const mix = (r, g, b) =>
    `${Math.round(r + (ar - r) * t)} ${Math.round(g + (ag - g) * t)} ${Math.round(b + (ab - b) * t)}`;
  const sc = (f) => [
    Math.min(255, Math.round(br * f)),
    Math.min(255, Math.round(bg * f)),
    Math.min(255, Math.round(bb * f)),
  ];
  const s = (f) => {
    const c = sc(f);
    return mix(...c);
  };
  return {
    "--base-900": s(0.5),
    "--base-800": mix(br, bg, bb),
    "--base-700": s(1.3),
    "--base-600": s(1.7),
    "--base-500": s(2.2),
    "--base-400": s(2.8),
    "--border": s(3.3),
    "--border-light": s(4.0),
    "--val-red": `${ar} ${ag} ${ab}`,
    "--val-red-dark": `${Math.round(ar * 0.82)} ${Math.round(ag * 0.82)} ${Math.round(ab * 0.82)}`,
    "--accent-blue": `${ar} ${ag} ${ab}`,
    "--accent-blue-dark": `${Math.round(ar * 0.82)} ${Math.round(ag * 0.82)} ${Math.round(ab * 0.82)}`,
  };
}
