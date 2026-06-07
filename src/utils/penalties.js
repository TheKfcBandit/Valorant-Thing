// Display helpers for `/restrictions/v3/penalties` payloads (#38).
// Centralized so the Account Status card on Home and any future
// restrictions surface share one source of truth for type labels.
//
// Riot has rotated the per-penalty `Type` enum across patches without
// announcement — DODGE has shown up as `DODGE`, `QUEUE_DODGE`, and
// `DODGE_DELAY` in community-captured payloads. Treat anything we
// don't recognize as a generic Restriction (rather than crashing or
// surfacing a raw `LEAVER_COMP_PENALTY` token to the user).

const PENALTY_LABELS = {
  RESTRICTION: "Restriction",
  QUEUE_RESTRICTION: "Queue restriction",
  DODGE: "Queue dodge",
  DODGE_DELAY: "Queue dodge",
  QUEUE_DODGE: "Queue dodge",
  LEAVER: "Leaver penalty",
  LEAVER_COMP_PENALTY: "Leaver penalty",
  AFK: "AFK penalty",
  TEXT_BANNED: "Chat ban",
  CHAT_BANNED: "Chat ban",
  VOICE_BANNED: "Voice ban",
  COMP_LOCKOUT: "Competitive lockout",
  RANKED_LOCKOUT: "Competitive lockout",
};

export function getPenaltyLabel(type) {
  const key = String(type || "")
    .toUpperCase()
    .trim();
  if (!key) return "Restriction";
  if (PENALTY_LABELS[key]) return PENALTY_LABELS[key];
  // Unknown — turn the raw token into something readable rather than
  // showing the user `LEAVER_COMP_PENALTY_V2`. Title-case underscored
  // tokens; preserves any future enum Riot adds.
  return key
    .split("_")
    .map((s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s))
    .join(" ");
}

export function formatTimeRemaining(expiryMs, nowMs = Date.now()) {
  if (expiryMs == null) return "";
  const remaining = expiryMs - nowMs;
  if (remaining <= 0) return "expiring";
  const mins = Math.floor(remaining / 60000);
  if (mins >= 60 * 24) return `${Math.floor(mins / (60 * 24))}d`;
  if (mins >= 60) return `${Math.floor(mins / 60)}h`;
  return `${mins}m`;
}
