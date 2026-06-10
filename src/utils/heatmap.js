// Dependency-free canvas density heatmap (#37 follow-up — the first cut
// rendered raw dots, which isn't a heatmap). Classic two-pass approach:
// stamp a soft radial alpha blob per point so overlaps accumulate, then
// recolor the accumulated alpha through a gradient LUT.

export const HEAT_STOPS = [
  { t: 0.0, color: [37, 99, 235] }, // blue — sparse
  { t: 0.3, color: [34, 211, 238] }, // cyan
  { t: 0.55, color: [74, 222, 128] }, // green
  { t: 0.75, color: [250, 204, 21] }, // yellow
  { t: 1.0, color: [239, 68, 68] }, // red — dense
];

// 256-entry RGB lookup table from the gradient stops. Pure — the only part
// of the pipeline that doesn't need a canvas, so it carries the tests.
export function buildHeatLUT(stops = HEAT_STOPS) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].t && t <= stops[s + 1].t) {
        lo = stops[s];
        hi = stops[s + 1];
        break;
      }
    }
    const span = hi.t - lo.t || 1;
    const k = Math.min(1, Math.max(0, (t - lo.t) / span));
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = Math.round(lo.color[c] + (hi.color[c] - lo.color[c]) * k);
    }
  }
  return lut;
}

// Per-stamp opacity: with few points each one should be clearly visible;
// with hundreds the field saturates fast, so scale down to keep contrast.
export function stampAlpha(pointCount) {
  if (pointCount <= 0) return 0;
  return Math.min(0.55, Math.max(0.14, 1.6 / Math.sqrt(pointCount)));
}

// Render `points` ([{x, y}] in canvas pixel space) onto `canvas`.
export function drawHeatmap(canvas, points, { radius = 36 } = {}) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (!points.length) return;

  const alpha = stampAlpha(points.length);
  for (const p of points) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  }

  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const lut = buildHeatLUT();
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    d[i] = lut[a * 3];
    d[i + 1] = lut[a * 3 + 1];
    d[i + 2] = lut[a * 3 + 2];
    // Lift low-density alpha so single deaths stay visible over the
    // minimap art, cap so hotspots don't fully occlude it.
    d[i + 3] = Math.min(215, Math.round(a * 0.9) + 45);
  }
  ctx.putImageData(img, 0, 0);
}
