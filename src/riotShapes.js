// Normalizers that convert raw Riot API responses (mixed case conventions
// per endpoint) into stable internal shapes (camelCase, defensively
// parsed). Philosophy rule 3: external responses are untrusted at the
// boundary; past the boundary, code reads typed internal shapes and
// fails loudly if they're wrong.
//
// Add a normalizer here whenever a new component starts reading raw
// Riot fields. The shape's field-name source is documented in val.md
// under "Field-name conventions" so future contributors know which
// endpoints are PascalCase vs camelCase.

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
// Future endpoints normalize here as they're consumed by new code.
// Don't add normalizers for fields nothing is reading yet — premature.
// ---------------------------------------------------------------------
