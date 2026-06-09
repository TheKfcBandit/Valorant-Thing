import { rgbToHex } from "./color";

// Seed the custom-theme editor from a built-in preset: two stops from the
// preset's base color toward its accent (18% blend matches the look of the
// shipped gradients).
export function presetToCustom(t) {
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

export function buildPreviewGradient(ct) {
  const sorted = [...ct.stops].sort((a, b) => a.pos - b.pos);
  return `linear-gradient(${ct.angle}deg, ${sorted.map((s) => `${s.color} ${s.pos}%`).join(", ")})`;
}
