// Per-comp-match RR entries from `/mmr/v1/players/{puuid}/competitiveupdates`.
// The endpoint only returns ~20 most recent per call, so without this
// cache the chart's window slides forward and old data is lost.
//
// Field names are PascalCase (`MatchID`, `MatchStartTime`) — competitive-
// updates returns PascalCase, unlike `/match-history` which is lowercase.
// Storage/persistence/corrupt-rescue are inherited from value_cache::Cache.

use std::collections::HashMap;

use serde_json::Value;
use tauri::AppHandle;

use crate::value_cache::Cache;

// Newtype rather than `pub type` so this cache has a distinct TypeId from
// match_cache::MatchCache, which also wraps Cache<HashMap<String, Value>>.
// See match_cache.rs for the full rationale — short version: Tauri's
// `.manage()` panics on duplicate TypeId at startup.
pub struct RrCache(Cache<HashMap<String, Value>>);

impl std::ops::Deref for RrCache {
    type Target = Cache<HashMap<String, Value>>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub fn new_cache() -> RrCache {
    RrCache(Cache::new("rr-history.json", "[RrCache]"))
}

#[tauri::command]
pub async fn rr_history_put_many(
    app: AppHandle,
    cache: tauri::State<'_, RrCache>,
    entries: Vec<Value>,
) -> Result<u32, String> {
    cache.write(&app, |map| {
        let mut new_count = 0u32;
        for entry in entries {
            if let Some(mid) = entry["MatchID"].as_str() {
                if mid.is_empty() {
                    continue;
                }
                if !map.contains_key(mid) {
                    new_count += 1;
                }
                map.insert(mid.to_string(), entry);
            }
        }
        (new_count, new_count > 0)
    })
}

#[tauri::command]
pub async fn rr_history_list(
    app: AppHandle,
    cache: tauri::State<'_, RrCache>,
    limit: Option<u32>,
) -> Result<Value, String> {
    cache.read(&app, |map| {
        // Skip entries with missing/non-numeric MatchStartTime rather than
        // mixing them into the head of the sort (where 0 would land them).
        let mut items: Vec<&Value> = map
            .values()
            .filter(|v| v.get("MatchStartTime").and_then(|d| d.as_i64()).is_some())
            .collect();
        items.sort_by(|a, b| {
            let da = a["MatchStartTime"].as_i64().unwrap_or(0);
            let db = b["MatchStartTime"].as_i64().unwrap_or(0);
            db.cmp(&da)
        });
        let lim = limit.unwrap_or(u32::MAX) as usize;
        let total = items.len();
        let sliced: Vec<Value> = items.into_iter().take(lim).cloned().collect();
        serde_json::json!({
            "matches": sliced,
            "total": total,
            "limit": lim,
        })
    })
}

#[tauri::command]
pub async fn rr_history_stats(
    app: AppHandle,
    cache: tauri::State<'_, RrCache>,
) -> Result<Value, String> {
    cache.read(&app, |map| {
        let total = map.len();
        let mut oldest: Option<i64> = None;
        let mut newest: Option<i64> = None;
        for v in map.values() {
            if let Some(d) = v["MatchStartTime"].as_i64() {
                oldest = Some(oldest.map_or(d, |o| o.min(d)));
                newest = Some(newest.map_or(d, |n| n.max(d)));
            }
        }
        serde_json::json!({
            "total": total,
            "oldestMs": oldest,
            "newestMs": newest,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorting_by_match_start_time_descending() {
        let mut by_id: HashMap<String, Value> = HashMap::new();
        by_id.insert(
            "a".into(),
            serde_json::json!({"MatchID":"a","MatchStartTime":100i64}),
        );
        by_id.insert(
            "b".into(),
            serde_json::json!({"MatchID":"b","MatchStartTime":300i64}),
        );
        by_id.insert(
            "c".into(),
            serde_json::json!({"MatchID":"c","MatchStartTime":200i64}),
        );
        let mut items: Vec<&Value> = by_id.values().collect();
        items.sort_by(|a, b| {
            let da = a["MatchStartTime"].as_i64().unwrap_or(0);
            let db = b["MatchStartTime"].as_i64().unwrap_or(0);
            db.cmp(&da)
        });
        assert_eq!(items[0]["MatchID"], "b");
        assert_eq!(items[1]["MatchID"], "c");
        assert_eq!(items[2]["MatchID"], "a");
    }
}
