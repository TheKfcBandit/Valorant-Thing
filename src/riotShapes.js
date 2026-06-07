// Normalizers that convert raw Riot API responses (mixed case conventions
// per endpoint) into stable internal shapes (camelCase, defensively
// parsed). Philosophy rule 3: external responses are untrusted at the
// boundary; past the boundary, code reads typed internal shapes and
// fails loudly if they're wrong.
//
// Add a normalizer here whenever a new component starts reading raw
// Riot fields. Don't sprinkle PascalCase access through component code.
//
// ---------------------------------------------------------------------
// Field-name conventions per endpoint
// ---------------------------------------------------------------------
// Different Riot endpoints return different case conventions. Verified
// from in-repo usage; "(inferred)" = read from the public schema at
// https://valapidocs.techchrism.me/, not yet captured in dev.
//
//   /match-history/v1/history/{puuid}            camelCase
//     History[].matchId, gameStartTime, queueId
//   /match-details/v1/matches/{matchId}          mixed
//     top-level: matchInfo, players, teams, roundResults (camel)
//     player fields & round outcome fields PascalCase within (inferred)
//   /mmr/v1/players/{puuid}                      PascalCase
//     LatestCompetitiveUpdate.TierAfterUpdate, RankedRatingAfterUpdate
//   /mmr/v1/players/{puuid}/competitiveupdates   PascalCase
//     Matches[].MatchID, TierAfterUpdate, RankedRatingEarned, MatchStartTime
//   /pregame/v1/matches/{matchId}                PascalCase
//     ID, MapID, MatchmakingData.QueueID, AllyTeam.Players[].Subject, TeamID
//   /core-game/v1/matches/{matchId}              PascalCase
//     MatchID, MapID, Players[].Subject, Teams[].TeamID
//   /parties/v1/parties/{partyId}                PascalCase (inferred,
//     wrapped by riot/party on the backend)
//   /store/v2/storefront/{puuid}                 PascalCase
//     FeaturedBundle, SkinsPanelLayout, BonusStore
//   /restrictions/v3/penalties                   PascalCase
//     Penalties[].Type, Expiry, QueueID, RankedRatingPenalty, ID

// ---------------------------------------------------------------------
// /mmr/v1/players/{puuid}/competitiveupdates  (PascalCase)
// ---------------------------------------------------------------------

/**
 * One entry from the `Matches` array of competitiveupdates.
 * @typedef {Object} RrEntry
 * @property {string} matchId
 * @property {number} matchStartTimeMs
 * @property {number} tierAfter         - integer tier, 0 = placement
 * @property {number} tierBefore
 * @property {number} rrAfter           - RR after this match (0-100 within a tier)
 * @property {number} rrBefore
 * @property {number} rrEarned          - delta this match (signed)
 * @property {string} movement          - "PROMOTED" | "DEMOTED" | "STABLE" | ""
 * @property {string} mapId
 */

/** @param {any} raw  @returns {RrEntry} */
export function normalizeRrEntry(raw) {
  return {
    matchId: String(raw?.MatchID || ""),
    matchStartTimeMs: Number(raw?.MatchStartTime) || 0,
    tierAfter: Number(raw?.TierAfterUpdate) || 0,
    tierBefore: Number(raw?.TierBeforeUpdate) || 0,
    rrAfter: Number(raw?.RankedRatingAfterUpdate) || 0,
    rrBefore: Number(raw?.RankedRatingBeforeUpdate) || 0,
    rrEarned: Number(raw?.RankedRatingEarned) || 0,
    movement: String(raw?.CompetitiveMovement || ""),
    mapId: String(raw?.MapID || ""),
  };
}

/**
 * Top-level competitiveupdates response.
 * @param {any} raw
 * @returns {{ matches: RrEntry[] }}
 */
export function normalizeRrResponse(raw) {
  const arr = Array.isArray(raw?.Matches) ? raw.Matches : [];
  return { matches: arr.map(normalizeRrEntry) };
}

// ---------------------------------------------------------------------
// /restrictions/v3/penalties  (PascalCase)
// ---------------------------------------------------------------------
//
// Fields the v3 endpoint emits per Riot's public schema, normalized for
// the Account Status card on Home (#38). Treated defensively — Riot has
// rotated the per-penalty payload more than once and minor patches have
// added/removed fields without notice. Anything missing surfaces as a
// safe default (empty string, 0, null) so the UI never crashes on an
// unfamiliar shape.

/**
 * One entry from the `Penalties` array.
 * @typedef {Object} Penalty
 * @property {string} id           - opaque Riot ID, may be empty
 * @property {string} type         - normalized uppercase token, e.g.
 *                                   "RESTRICTION", "QUEUE_RESTRICTION",
 *                                   "DODGE", "LEAVER", "CHAT_BANNED",
 *                                   "VOICE_BANNED"
 * @property {string} queueId      - lower-case queue id (e.g.
 *                                   "competitive"), empty = applies to
 *                                   all queues
 * @property {number} rrPenalty    - RR cost of this penalty when known,
 *                                   0 = none reported
 * @property {?number} expiryMs    - epoch ms; null = never expires
 *                                   reported / unparseable
 */

/** @param {any} raw  @returns {Penalty} */
export function normalizePenalty(raw) {
  return {
    id: String(raw?.ID || raw?.id || ""),
    type: String(raw?.Type || raw?.PenaltyType || "").toUpperCase(),
    queueId: String(raw?.QueueID || raw?.queueId || "").toLowerCase(),
    rrPenalty: Number(raw?.RankedRatingPenalty || raw?.rrPenalty || 0),
    expiryMs: raw?.Expiry ? new Date(raw.Expiry).getTime() || null : null,
  };
}

/**
 * Top-level penalties response.
 * @param {any} raw
 * @returns {{ penalties: Penalty[] }}
 */
export function normalizePenaltiesResponse(raw) {
  const arr = Array.isArray(raw?.Penalties) ? raw.Penalties : [];
  return { penalties: arr.map(normalizePenalty) };
}

// ---------------------------------------------------------------------
// Future endpoints normalize here as they're consumed by new code.
// Don't add normalizers for fields nothing is reading yet — premature.
// ---------------------------------------------------------------------
