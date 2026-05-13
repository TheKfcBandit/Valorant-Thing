use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::riot::logging::log_error;

pub struct MatchCacheState {
    by_id: HashMap<String, Value>,
    loaded: bool,
}

impl Default for MatchCacheState {
    fn default() -> Self {
        Self { by_id: HashMap::new(), loaded: false }
    }
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
    }
    Ok(dir.join("match-cache.json"))
}

fn ensure_loaded(app: &AppHandle, state: &Mutex<MatchCacheState>) -> Result<(), String> {
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.loaded { return Ok(()); }
    }
    let path = cache_path(app)?;
    let map = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(s) => serde_json::from_str::<HashMap<String, Value>>(&s).unwrap_or_else(|e| {
                log_error(&format!("[MatchCache] parse failed, starting empty: {}", e));
                HashMap::new()
            }),
            Err(e) => {
                log_error(&format!("[MatchCache] read failed: {}", e));
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

fn persist(app: &AppHandle, state: &Mutex<MatchCacheState>) -> Result<(), String> {
    let path = cache_path(app)?;
    let snapshot = {
        let s = state.lock().map_err(|e| e.to_string())?;
        serde_json::to_string(&s.by_id).map_err(|e| format!("serialize: {}", e))?
    };
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, snapshot).map_err(|e| format!("write tmp: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn match_history_put(
    app: AppHandle,
    state: tauri::State<'_, Mutex<MatchCacheState>>,
    entry: Value,
) -> Result<bool, String> {
    let match_id = entry["matchId"].as_str().ok_or("missing matchId")?.to_string();
    if match_id.is_empty() { return Err("empty matchId".to_string()); }
    ensure_loaded(&app, &state)?;
    let inserted = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let was_new = !s.by_id.contains_key(&match_id);
        s.by_id.insert(match_id, entry);
        was_new
    };
    persist(&app, &state)?;
    Ok(inserted)
}

#[tauri::command]
pub async fn match_history_put_many(
    app: AppHandle,
    state: tauri::State<'_, Mutex<MatchCacheState>>,
    entries: Vec<Value>,
) -> Result<u32, String> {
    ensure_loaded(&app, &state)?;
    let mut new_count = 0u32;
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        for entry in entries {
            if let Some(mid) = entry["matchId"].as_str() {
                if mid.is_empty() { continue; }
                if !s.by_id.contains_key(mid) { new_count += 1; }
                s.by_id.insert(mid.to_string(), entry);
            }
        }
    }
    if new_count > 0 { persist(&app, &state)?; }
    Ok(new_count)
}

#[tauri::command]
pub async fn match_history_list(
    app: AppHandle,
    state: tauri::State<'_, Mutex<MatchCacheState>>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Value, String> {
    ensure_loaded(&app, &state)?;
    let s = state.lock().map_err(|e| e.to_string())?;
    let mut items: Vec<&Value> = s.by_id.values().collect();
    items.sort_by(|a, b| {
        let da = a["dateMs"].as_i64().unwrap_or(0);
        let db = b["dateMs"].as_i64().unwrap_or(0);
        db.cmp(&da)
    });
    let off = offset.unwrap_or(0) as usize;
    let lim = limit.unwrap_or(u32::MAX) as usize;
    let total = items.len();
    let sliced: Vec<Value> = items.into_iter().skip(off).take(lim).cloned().collect();
    Ok(serde_json::json!({
        "matches": sliced,
        "total": total,
        "offset": off,
        "limit": lim,
    }))
}

#[tauri::command]
pub async fn match_history_stats(
    app: AppHandle,
    state: tauri::State<'_, Mutex<MatchCacheState>>,
) -> Result<Value, String> {
    ensure_loaded(&app, &state)?;
    let s = state.lock().map_err(|e| e.to_string())?;
    let total = s.by_id.len();
    let mut oldest: Option<i64> = None;
    let mut newest: Option<i64> = None;
    for v in s.by_id.values() {
        if let Some(d) = v["dateMs"].as_i64() {
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
