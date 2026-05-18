use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::Value;
use tauri::AppHandle;

use crate::riot::logging::log_error;
use crate::util::cache_path as util_cache_path;

// File-backed cache of per-comp-match RR entries from
// `/mmr/v1/players/{puuid}/competitiveupdates`. The endpoint only returns
// the most recent ~20 matches per call, so without persistence the chart's
// window slides forward and old data is lost. Entries are opaque Value blobs
// keyed by Riot's `MatchID` (PascalCase — competitiveupdates returns
// PascalCase, unlike `/match-history` which is lowercase).
#[derive(Default)]
pub struct RrCacheState {
    by_id: HashMap<String, Value>,
    loaded: bool,
}

fn cache_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    util_cache_path(app, "rr-history.json")
}

fn ensure_loaded(app: &AppHandle, state: &Mutex<RrCacheState>) -> Result<(), String> {
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.loaded {
            return Ok(());
        }
    }
    let path = cache_path(app)?;
    let map = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(s) => match serde_json::from_str::<HashMap<String, Value>>(&s) {
                Ok(m) => m,
                Err(e) => {
                    // Preserve the corrupt file for diagnosis instead of silently dropping it.
                    let ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let corrupt = path.with_extension(format!("json.corrupt-{}", ts));
                    let backup_note = match std::fs::rename(&path, &corrupt) {
                        Ok(_) => format!("backed up to {}", corrupt.display()),
                        Err(re) => format!("backup also failed: {}", re),
                    };
                    log_error(&format!(
                        "[RrCache] parse failed ({}); starting empty; {}",
                        e, backup_note
                    ));
                    HashMap::new()
                }
            },
            Err(e) => {
                log_error(&format!("[RrCache] read failed: {}", e));
                HashMap::new()
            }
        }
    } else {
        HashMap::new()
    };
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.by_id = map;
    s.loaded = true;
    Ok(())
}

// Persist re-acquires the state lock and serializes the *full current* map
// inside the locked scope. Two concurrent put_many callers therefore each
// produce a complete snapshot containing both callers' modifications — the
// tail write may overwrite the head write with the same superset of data,
// but no data is lost. Do not refactor to take a snapshot before locking
// without preserving this invariant.
fn persist(app: &AppHandle, state: &Mutex<RrCacheState>) -> Result<(), String> {
    let path = cache_path(app)?;
    let snapshot = {
        let s = state.lock().map_err(|e| e.to_string())?;
        serde_json::to_string(&s.by_id).map_err(|e| format!("serialize: {}", e))?
    };
    let tmp = path.with_extension("json.tmp");
    // Best-effort cleanup of any leftover .tmp from a prior crashed write.
    // Ignored error: if it doesn't exist, that's fine; if removal fails, the
    // upcoming write will fail with a clearer error.
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, snapshot).map_err(|e| format!("write tmp: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn rr_history_put_many(
    app: AppHandle,
    state: tauri::State<'_, Mutex<RrCacheState>>,
    entries: Vec<Value>,
) -> Result<u32, String> {
    ensure_loaded(&app, &state)?;
    let mut new_count = 0u32;
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        for entry in entries {
            if let Some(mid) = entry["MatchID"].as_str() {
                if mid.is_empty() {
                    continue;
                }
                if !s.by_id.contains_key(mid) {
                    new_count += 1;
                }
                s.by_id.insert(mid.to_string(), entry);
            }
        }
    }
    if new_count > 0 {
        persist(&app, &state)?;
    }
    Ok(new_count)
}

#[tauri::command]
pub async fn rr_history_list(
    app: AppHandle,
    state: tauri::State<'_, Mutex<RrCacheState>>,
    limit: Option<u32>,
) -> Result<Value, String> {
    ensure_loaded(&app, &state)?;
    let s = state.lock().map_err(|e| e.to_string())?;
    // Skip entries with missing/non-numeric MatchStartTime rather than mixing them
    // into the head of the sort (where 0 would land them).
    let mut items: Vec<&Value> = s
        .by_id
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
    Ok(serde_json::json!({
        "matches": sliced,
        "total": total,
        "limit": lim,
    }))
}

#[tauri::command]
pub async fn rr_history_stats(
    app: AppHandle,
    state: tauri::State<'_, Mutex<RrCacheState>>,
) -> Result<Value, String> {
    ensure_loaded(&app, &state)?;
    let s = state.lock().map_err(|e| e.to_string())?;
    let total = s.by_id.len();
    let mut oldest: Option<i64> = None;
    let mut newest: Option<i64> = None;
    for v in s.by_id.values() {
        if let Some(d) = v["MatchStartTime"].as_i64() {
            oldest = Some(oldest.map_or(d, |o| o.min(d)));
            newest = Some(newest.map_or(d, |n| n.max(d)));
        }
    }
    Ok(serde_json::json!({
        "total": total,
        "oldestMs": oldest,
        "newestMs": newest,
    }))
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
