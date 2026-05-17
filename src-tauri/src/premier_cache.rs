// Phase A of #18, extended for #23 — persists the last good Premier roster /
// division / conference responses so the Premier tab can render when Valorant
// is closed. Same file-backed atomic-rename + corrupt-file backup pattern as
// identity_cache.rs / match_cache.rs. Storage: <appDataDir>/premier.json.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::riot::logging::log_error;
use crate::util::{cache_path as util_cache_path, now_ms};

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct PremierSnapshot {
    /// Raw JSON string returned by `get_premier_player` (already normalized
    /// into the `{ enrolled, team, raw }` envelope by the Rust side).
    pub player: String,
    /// Raw response body for `/premier/v1/divisions/{id}`. Empty when the
    /// user isn't on a team (no division to look up).
    pub division: String,
    /// Raw response body for `/premier/v1/conferences/{id}`.
    pub conference: String,
    /// Wall-clock millis when this snapshot was last refreshed by a live fetch.
    pub saved_at_ms: i64,
}

#[derive(Default)]
pub struct PremierCacheState {
    pub snapshot: Option<PremierSnapshot>,
    pub loaded: bool,
}

fn cache_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    util_cache_path(app, "premier.json")
}

fn ensure_loaded(app: &AppHandle, state: &Mutex<PremierCacheState>) -> Result<(), String> {
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.loaded { return Ok(()); }
    }
    let path = cache_path(app)?;
    let snap: Option<PremierSnapshot> = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(s) => match serde_json::from_str::<PremierSnapshot>(&s) {
                Ok(snap) => Some(snap),
                Err(e) => {
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
                        "[PremierCache] parse failed ({}); starting empty; {}",
                        e, backup_note
                    ));
                    None
                }
            },
            Err(e) => {
                log_error(&format!("[PremierCache] read failed: {}", e));
                None
            }
        }
    } else {
        None
    };
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.snapshot = snap;
    s.loaded = true;
    Ok(())
}

fn persist(app: &AppHandle, state: &Mutex<PremierCacheState>) -> Result<(), String> {
    let path = cache_path(app)?;
    let snapshot = {
        let s = state.lock().map_err(|e| e.to_string())?;
        match &s.snapshot {
            Some(snap) => serde_json::to_string(snap).map_err(|e| format!("serialize: {}", e))?,
            None => return Ok(()),
        }
    };
    let tmp = path.with_extension("json.tmp");
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, snapshot).map_err(|e| format!("write tmp: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

/// Save a fresh Premier snapshot. Returns `Err` on disk failure; callers
/// should treat the write as best-effort and log-and-swallow rather than
/// propagating to the frontend (see `cache_premier_bundle` in lib.rs).
pub fn save(
    app: &AppHandle,
    state: &Mutex<PremierCacheState>,
    player: String,
    division: String,
    conference: String,
) -> Result<(), String> {
    ensure_loaded(app, state)?;
    let snap = PremierSnapshot {
        player,
        division,
        conference,
        saved_at_ms: now_ms(),
    };
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.snapshot = Some(snap);
    }
    persist(app, state)
}

#[tauri::command]
pub async fn get_cached_premier(
    app: AppHandle,
    state: tauri::State<'_, Mutex<PremierCacheState>>,
) -> Result<Option<PremierSnapshot>, String> {
    ensure_loaded(&app, &state)?;
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.snapshot.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_roundtrips_through_serde() {
        let snap = PremierSnapshot {
            player: r#"{"enrolled":true}"#.into(),
            division: r#"{"standings":[]}"#.into(),
            conference: r#"{"matches":[]}"#.into(),
            saved_at_ms: 1_700_000_000_000,
        };
        let s = serde_json::to_string(&snap).unwrap();
        let back: PremierSnapshot = serde_json::from_str(&s).unwrap();
        assert_eq!(back.player, r#"{"enrolled":true}"#);
        assert_eq!(back.saved_at_ms, 1_700_000_000_000);
    }
}
