// Per-match raw `/match-details/v1/matches/{match_id}` responses, keyed by
// match_id. Lets the match-details modal render any previously-fetched match
// while Valorant is closed and no OAuth session is active — the endpoint
// itself is immutable post-match, so a hit is always safe to serve.
//
// Storage/persistence/corrupt-rescue are inherited from value_cache::Cache.

use std::collections::HashMap;

use serde_json::Value;
use tauri::AppHandle;

use crate::value_cache::Cache;

// Newtype rather than `pub type` so this cache has a distinct TypeId from
// rr_cache::RrCache, which also wraps Cache<HashMap<String, Value>>. Tauri's
// `.manage()` panics on duplicate TypeId at startup.
pub struct MatchDetailsCache(Cache<HashMap<String, Value>>);

impl std::ops::Deref for MatchDetailsCache {
    type Target = Cache<HashMap<String, Value>>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub fn new_cache() -> MatchDetailsCache {
    MatchDetailsCache(Cache::new(
        "match-details-cache.json",
        "[MatchDetailsCache]",
    ))
}

pub fn get(
    app: &AppHandle,
    cache: &MatchDetailsCache,
    match_id: &str,
) -> Result<Option<Value>, String> {
    cache.read(app, |map| map.get(match_id).cloned())
}

pub fn put(
    app: &AppHandle,
    cache: &MatchDetailsCache,
    match_id: &str,
    payload: Value,
) -> Result<(), String> {
    // Schema sniff: every real /match-details response carries both
    // `matchInfo` and `players`. Anything else (Riot error envelopes,
    // partial bodies, 200-shaped failure responses) parses as valid JSON
    // but would poison the cache for the entire process lifetime since
    // we have no TTL or invalidation hook. Refuse to persist; the caller
    // still returns the raw body to the frontend, just nothing's cached.
    if payload.get("matchInfo").is_none() || payload.get("players").is_none() {
        return Err("payload missing matchInfo/players — refusing to cache".to_string());
    }

    cache.write(app, |map| {
        // Mirror rr_cache::rr_history_put_many: only persist when something
        // actually changed. Repeat opens of the same modal then don't
        // re-serialize the whole HashMap to disk on every miss-through.
        let unchanged = map.get(match_id) == Some(&payload);
        map.insert(match_id.to_string(), payload);
        ((), !unchanged)
    })
}
