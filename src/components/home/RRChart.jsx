import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { Label } from "../ui/Label";

// #24: hand-rolled SVG line chart for RR over the most recent ~20 ranked
// matches. Riot returns matches most-recent-first; we reverse for
// left-to-right time. Y axis uses tier*100 + rr to give a continuous signal
// across tier promotion/demotion boundaries.
//
// `matches` is an array of normalized RrEntry from riotShapes.js — all
// fields are camelCase, defensively coerced to numbers.
export function RRChart({ matches }) {
  // Reverse so left = oldest, right = most recent.
  const points = [...matches].reverse().map((m) => ({
    y: m.tierAfter * 100 + m.rrAfter,
    rr: m.rrAfter,
    earned: m.rrEarned,
  }));
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(1, maxY - minY);
  // Padding around the polyline so the top/bottom dots don't clip.
  const pad = 12;
  const w = 600; // logical width; SVG scales to container
  const h = 140;
  const innerH = h - pad * 2;
  const xStep = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * xStep;
    const yNorm = (p.y - minY) / span; // 0..1
    const y = pad + (1 - yNorm) * innerH;
    // NB: spread `p` first so the scaled `x`/`y` override the raw `p.y`.
    // Spreading after `{ x, y }` would clobber the scaled `y` with the
    // raw tier*100+rr value and push the polyline off the viewBox.
    return { ...p, x, y };
  });
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const last = coords[coords.length - 1];
  const totalDelta = points.reduce((acc, p) => acc + p.earned, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl border border-border bg-base-700/60 p-3"
    >
      <div className="flex items-baseline justify-between mb-2">
        <Label>RR Trend</Label>
        <p
          className={`text-[10px] font-mono tabular-nums ${totalDelta >= 0 ? "text-green-400" : "text-red-400"}`}
        >
          {totalDelta >= 0 ? "+" : ""}
          {totalDelta} RR over {points.length} matches
        </p>
      </div>
      <div className="relative w-full h-[140px]">
        {/* eslint-disable-next-line no-restricted-syntax -- dynamic data viz, not an icon */}
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
        >
          <path
            d={pathD}
            fill="none"
            stroke="rgb(var(--val-red))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={i === coords.length - 1 ? 4 : 2.5}
              fill="rgb(var(--val-red))"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* Labels as HTML overlays so preserveAspectRatio="none" doesn't
            horizontally smear the text along with the line. */}
        <span className="absolute right-1.5 top-1 text-[9px] font-mono tabular-nums text-text-muted">
          {maxY}
        </span>
        <span className="absolute right-1.5 bottom-1 text-[9px] font-mono tabular-nums text-text-muted">
          {minY}
        </span>
        <span
          className="absolute right-2 text-[10px] font-mono tabular-nums text-text-primary"
          style={{ top: `${(last.y / h) * 100}%`, transform: "translateY(-130%)" }}
        >
          {last.rr}
        </span>
      </div>
    </motion.div>
  );
}
