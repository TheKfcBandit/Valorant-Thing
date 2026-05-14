// Phase A of #18 — persists last-seen PlayerInfo so the home page +
// other identity-keyed UI keep working when Valorant is closed.
//
// Same file-backed atomic-rename + corrupt-file backup pattern as
// match_cache.rs. Storage: <appDataDir>/identity.json.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::riot::logging::log_error;
use crate::riot::PlayerInfo;

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct IdentitySnapshot {
    pub puuid: String,
    pub game_name: String,
    pub game_tag: String,
    pub region: String,
    pub shard: String,
    pub client_version: String,
    pub player_card_url: Option<String>,
    /// Wall-clock millis when this snapshot was last refreshed by a live connect.
    pub saved_at_ms: i64,
}

#[derive(Default)]
pub struct IdentityCacheState {
    pub snapshot: Option<IdentitySnapshot>,
    pub loaded: bool,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
    }
    Ok(dir.join("identity.json"))
}

fn ensure_loaded(app: &AppHandle, state: &Mutex<IdentityCacheState>) -> Result<(), String> {
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.loaded { return Ok(()); }
    }
    let path = cache_path(app)?;
    let snap: Option<IdentitySnapshot> = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(s) => match serde_json::from_str::<IdentitySnapshot>(&s) {
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
                        "[IdentityCache] parse failed ({}); starting empty; {}",
                        e, backup_note
                    ));
                    None
                }
            },
            Err(e) => {
                log_error(&format!("[IdentityCache] read failed: {}", e));
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

fn persist(app: &AppHandle, state: &Mutex<IdentityCacheState>) -> Result<(), String> {
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

/// Save a fresh PlayerInfo snapshot. Called from connect_and_store after a
/// successful live connect.
pub fn save(app: &AppHandle, state: &Mutex<IdentityCacheState>, info: &PlayerInfo) -> Result<(), String> {
    ensure_loaded(app, state)?;
    let snap = IdentitySnapshot {
        puuid: info.puuid.clone(),
        game_name: info.game_name.clone(),
        game_tag: info.game_tag.clone(),
        region: info.region.clone(),
        shard: info.shard.clone(),
        client_version: info.client_version.clone(),
        player_card_url: info.player_card_url.clone(),
        saved_at_ms: now_ms(),
    };
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.snapshot = Some(snap);
    }
    persist(app, state)
}

#[tauri::command]
pub async fn get_cached_identity(
    app: AppHandle,
    state: tauri::State<'_, Mutex<IdentityCacheState>>,
) -> Result<Option<IdentitySnapshot>, String> {
    ensure_loaded(&app, &state)?;
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.snapshot.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_roundtrips_through_serde() {
        let snap = IdentitySnapshot {
            puuid: "abc".into(),
            game_name: "Player".into(),
            game_tag: "1234".into(),
            region: "na".into(),
            shard: "na".into(),
            client_version: "1.0".into(),
            player_card_url: Some("https://example/card.png".into()),
            saved_at_ms: 1_700_000_000_000,
        };
        let s = serde_json::to_string(&snap).unwrap();
        let back: IdentitySnapshot = serde_json::from_str(&s).unwrap();
        assert_eq!(back.puuid, "abc");
        assert_eq!(back.saved_at_ms, 1_700_000_000_000);
    }
}
