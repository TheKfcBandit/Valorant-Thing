// Hex <-> RGB triplet helpers shared by the theme system (App.jsx derives
// CSS vars from gradient stops; SettingsPage builds hex pickers from CSS
// var triplets). Both directions clamp to byte range; hexToRgb expects
// six-digit "#rrggbb" input.
export function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}
