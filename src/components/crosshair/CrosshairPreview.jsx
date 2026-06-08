import { useEffect, useMemo, useRef } from "react";
import { readProfile } from "../../utils/crosshair";

// Static canvas preview of a parsed crosshair profile (#40). v1: no
// movement / firing-error animation. Renders the inner-lines cross,
// optional outer-lines cross, optional center dot, with outlines if
// the profile asks for them.
//
// Scale: the in-game crosshair line lengths/thicknesses are in pixels at
// 1080p. We render to a fixed canvas size and apply a `scale` factor so
// the preview is comfortably readable in the UI. Scale defaults to 4 —
// a 4-px-long line shows up as 16 visible pixels.

export function CrosshairPreview({ profile, size = 160, scale = 4, background = "#1f2937" }) {
  const canvasRef = useRef(null);
  // Memo the typed shape so an unrelated parent rerender (e.g. a keystroke
  // in the preset-name input) doesn't trip the canvas-draw effect below
  // for every Preview instance on the page.
  const typed = useMemo(() => readProfile(profile), [profile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);

    if (!typed) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Invalid code", size / 2, size / 2);
      return;
    }

    const cx = size / 2;
    const cy = size / 2;

    // Draw center dot first (sits BEHIND lines if both present, matching
    // in-game rendering order).
    if (typed.dot.show && typed.dot.thickness > 0) {
      const dotSize = typed.dot.thickness * scale;
      ctx.globalAlpha = clamp01(typed.dot.opacity);
      ctx.fillStyle = typed.color;
      ctx.fillRect(cx - dotSize / 2, cy - dotSize / 2, dotSize, dotSize);
      if (typed.outline.show) {
        strokeRect(
          ctx,
          cx - dotSize / 2,
          cy - dotSize / 2,
          dotSize,
          dotSize,
          typed.outline.thickness,
          clamp01(typed.outline.opacity)
        );
      }
    }

    // Inner & outer line crosses share one helper.
    if (typed.inner.show) {
      drawCross(ctx, cx, cy, typed.inner, typed.color, typed.outline, scale);
    }
    if (typed.outer.show) {
      drawCross(ctx, cx, cy, typed.outer, typed.color, typed.outline, scale);
    }

    ctx.globalAlpha = 1;
  }, [typed, size, scale, background]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="rounded-md border border-border bg-base-900"
    />
  );
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

// Draw the 4 arms of a Valorant-style crosshair cross.
//   - lines extend from `offset` away from center to `offset + length` (horizontal)
//   - vertical arms use `verticalLength` (defaults to length when absent)
//   - thickness is the line width in unscaled pixels
function drawCross(ctx, cx, cy, lines, color, outline, scale) {
  const offset = lines.offset * scale;
  const hLen = lines.length * scale;
  const vLen = lines.verticalLength * scale;
  const thick = Math.max(1, lines.thickness * scale);
  const alpha = clamp01(lines.opacity);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  // left arm
  ctx.fillRect(cx - offset - hLen, cy - thick / 2, hLen, thick);
  // right arm
  ctx.fillRect(cx + offset, cy - thick / 2, hLen, thick);
  // top arm
  ctx.fillRect(cx - thick / 2, cy - offset - vLen, thick, vLen);
  // bottom arm
  ctx.fillRect(cx - thick / 2, cy + offset, thick, vLen);

  if (outline.show) {
    const oThick = Math.max(1, outline.thickness);
    const oAlpha = clamp01(outline.opacity);
    strokeRect(ctx, cx - offset - hLen, cy - thick / 2, hLen, thick, oThick, oAlpha);
    strokeRect(ctx, cx + offset, cy - thick / 2, hLen, thick, oThick, oAlpha);
    strokeRect(ctx, cx - thick / 2, cy - offset - vLen, thick, vLen, oThick, oAlpha);
    strokeRect(ctx, cx - thick / 2, cy + offset, thick, vLen, oThick, oAlpha);
  }
}

function strokeRect(ctx, x, y, w, h, thickness, alpha) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = thickness;
  ctx.strokeRect(x, y, w, h);
}
