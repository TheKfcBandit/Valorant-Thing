// Per-match summary cache, keyed by lowercase `matchId` from
// `/match-history/v1/history/{puuid}`. Sort key: `dateMs` (i64).
//
// Persistence + corrupt-rescue + atomic-rename all live in
// value_cache::Cache; this module is just the field-name + tauri-command
// shims around it.

use std::collections::HashMap;

use serde_json::Value;
use tauri::AppHandle;

use crate::value_cache::Cache;

pub type MatchCache = Cache<HashMap<String, Value>>;

pub fn new_cache() -> MatchCache {
    Cache::new("match-cache.json", "[MatchCache]")
}

#[tauri::command]
pub async fn match_history_put(
    app: AppHandle,
    cache: tauri::State<'_, MatchCache>,
    entry: Value,
) -> Result<bool, String> {
    let match_id = entry["matchId"]
        .as_str()
        .ok_or("missing matchId")?
        .to_string();
    if match_id.is_empty() {
        return Err("empty matchId".to_string());
    }
    cache.write(&app, |map| {
        let was_new = !map.contains_key(&match_id);
        map.insert(match_id, entry);
        (was_new, true)
    })
}

#[tauri::command]
pub async fn match_history_put_many(
    app: AppHandle,
    cache: tauri::State<'_, MatchCache>,
    entries: Vec<Value>,
) -> Result<u32, String> {
    cache.write(&app, |map| {
        let mut new_count = 0u32;
        for entry in entries {
            if let Some(mid) = entry["matchId"].as_str() {
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
pub async fn match_history_list(
    app: AppHandle,
    cache: tauri::State<'_, MatchCache>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Value, String> {
    cache.read(&app, |map| {
        // Skip entries with missing/non-numeric dateMs rather than mixing
        // them into the head of the sort (where 0 would land them).
        let mut items: Vec<&Value> = map
            .values()
            .filter(|v| v.get("dateMs").and_then(|d| d.as_i64()).is_some())
            .collect();
        items.sort_by(|a, b| {
            let da = a["dateMs"].as_i64().unwrap_or(0);
            let db = b["dateMs"].as_i64().unwrap_or(0);
            db.cmp(&da)
        });
        let off = offset.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(u32::MAX) as usize;
        let total = items.len();
        let sliced: Vec<Value> = items.into_iter().skip(off).take(lim).cloned().collect();
        serde_json::json!({
            "matches": sliced,
            "total": total,
            "offset": off,
            "limit": lim,
        })
    })
}

#[tauri::command]
pub async fn match_history_stats(
    app: AppHandle,
    cache: tauri::State<'_, MatchCache>,
) -> Result<Value, String> {
    cache.read(&app, |map| {
        let total = map.len();
        let mut oldest: Option<i64> = None;
        let mut newest: Option<i64> = None;
        for v in map.values() {
            if let Some(d) = v["dateMs"].as_i64() {
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
    fn sorting_by_date_ms_descending() {
        let mut by_id: HashMap<String, Value> = HashMap::new();
        by_id.insert("a".into(), serde_json::json!({"matchId":"a","dateMs":100}));
        by_id.insert("b".into(), serde_json::json!({"matchId":"b","dateMs":300}));
        by_id.insert("c".into(), serde_json::json!({"matchId":"c","dateMs":200}));
        let mut items: Vec<&Value> = by_id.values().collect();
        items.sort_by(|a, b| {
            let da = a["dateMs"].as_i64().unwrap_or(0);
            let db = b["dateMs"].as_i64().unwrap_or(0);
            db.cmp(&da)
        });
        assert_eq!(items[0]["matchId"], "b");
        assert_eq!(items[1]["matchId"], "c");
        assert_eq!(items[2]["matchId"], "a");
    }
}
