// Generic display formatters. Keep this file pure (no DOM, no React,
// no async) so it stays unit-testable.

// ms → "M:SS" (clamps negatives to 0).
export function formatTimer(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Riot access tokens last 10 minutes from fetch. Given an age in
// seconds, render "<m>m <s>s" remaining (or just "<s>s" once under
// the minute). Saturates at 0 — never returns a negative value.
export function formatTimeLeft(ageSecs) {
  const left = Math.max(0, 600 - ageSecs);
  const m = Math.floor(left / 60);
  const s = left % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
