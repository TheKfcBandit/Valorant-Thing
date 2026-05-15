// #27: file-backed loadout presets. Save the current in-game loadout under
// a name, apply any preset back to the live game via the existing
// set_loadout command. Stored at <appDataDir>/loadout-presets.json with the
// same atomic-rename + corrupt-file backup pattern as identity_cache /
// match_cache.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::riot::{self, ConnectionState};
use crate::riot::logging::log_error;

const MAX_PRESETS: usize = 50;
const MAX_NAME_LEN: usize = 60;

#[derive(Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub saved_at_ms: i64,
    pub loadout_json: String,
}

#[derive(Default, Serialize, Deserialize)]
struct PresetsFile {
    presets: Vec<Preset>,
}

#[derive(Default)]
pub struct PresetsState {
    data: PresetsFile,
    loaded: bool,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("app_data_dir: {}", e))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
    }
    Ok(dir.join("loadout-presets.json"))
}

fn ensure_loaded(app: &AppHandle, state: &Mutex<PresetsState>) -> Result<(), String> {
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.loaded { return Ok(()); }
    }
    let path = cache_path(app)?;
    let data: PresetsFile = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(s) => match serde_json::from_str(&s) {
                Ok(d) => d,
                Err(e) => {
                    let ts = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                    let corrupt = path.with_extension(format!("json.corrupt-{}", ts));
                    let _ = std::fs::rename(&path, &corrupt);
                    log_error(&format!("[Presets] parse failed, backed up to {} ({})", corrupt.display(), e));
                    PresetsFile::default()
                }
            },
            Err(e) => {
                log_error(&format!("[Presets] read failed: {}", e));
                PresetsFile::default()
            }
        }
    } else {
        PresetsFile::default()
    };
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.data = data;
    s.loaded = true;
    Ok(())
}

fn persist(app: &AppHandle, state: &Mutex<PresetsState>) -> Result<(), String> {
    let path = cache_path(app)?;
    let snapshot = {
        let s = state.lock().map_err(|e| e.to_string())?;
        serde_json::to_string(&s.data).map_err(|e| format!("serialize: {}", e))?
    };
    let tmp = path.with_extension("json.tmp");
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, snapshot).map_err(|e| format!("write tmp: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

fn make_id() -> String {
    // Tiny non-cryptographic ID; collisions are practically impossible at
    // human-scale preset counts. Format: "p{epoch_ms}-{rand}" so they sort
    // naturally too.
    let ms = now_ms();
    let rand: u32 = (ms as u32).wrapping_mul(2654435761).wrapping_add(0x9E3779B9);
    format!("p{}-{:x}", ms, rand)
}

#[tauri::command]
pub async fn list_loadout_presets(
    app: AppHandle,
    state: tauri::State<'_, Mutex<PresetsState>>,
) -> Result<Vec<Preset>, String> {
    ensure_loaded(&app, &state)?;
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.data.presets.clone())
}

#[tauri::command]
pub async fn save_loadout_preset(
    app: AppHandle,
    state: tauri::State<'_, Mutex<PresetsState>>,
    conn: tauri::State<'_, std::sync::Arc<Mutex<ConnectionState>>>,
    name: String,
) -> Result<Preset, String> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err("Preset name can't be empty".to_string());
    }
    if trimmed.len() > MAX_NAME_LEN {
        return Err(format!("Preset name too long (max {} chars)", MAX_NAME_LEN));
    }
    ensure_loaded(&app, &state)?;
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.data.presets.len() >= MAX_PRESETS {
            return Err(format!("Preset limit reached ({}), delete one first", MAX_PRESETS));
        }
    }
    // Pull the live loadout from Riot.
    let conn_clone = std::sync::Arc::clone(&conn);
    let loadout_json = tauri::async_runtime::spawn_blocking(move || riot::get_loadout(&conn_clone))
        .await
        .map_err(|e| format!("Task failed: {}", e))??;

    let preset = Preset {
        id: make_id(),
        name: trimmed,
        saved_at_ms: now_ms(),
        loadout_json,
    };
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.data.presets.push(preset.clone());
    }
    persist(&app, &state)?;
    Ok(preset)
}

#[tauri::command]
pub async fn apply_loadout_preset(
    app: AppHandle,
    state: tauri::State<'_, Mutex<PresetsState>>,
    conn: tauri::State<'_, std::sync::Arc<Mutex<ConnectionState>>>,
    preset_id: String,
) -> Result<(), String> {
    ensure_loaded(&app, &state)?;
    let loadout_json = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.data.presets.iter().find(|p| p.id == preset_id)
            .ok_or_else(|| "Preset not found".to_string())?
            .loadout_json.clone()
    };
    // set_loadout expects only the writeable subset (Guns/Sprays/Identity/Incognito),
    // which is what the frontend sends. But our save_loadout_preset stored the FULL
    // get_loadout response. Project to the writeable subset before applying.
    let body = project_writeable(&loadout_json)?;
    let conn_clone = std::sync::Arc::clone(&conn);
    tauri::async_runtime::spawn_blocking(move || riot::set_loadout(&conn_clone, &body))
        .await
        .map_err(|e| format!("Task failed: {}", e))??;
    Ok(())
}

#[tauri::command]
pub async fn delete_loadout_preset(
    app: AppHandle,
    state: tauri::State<'_, Mutex<PresetsState>>,
    preset_id: String,
) -> Result<(), String> {
    ensure_loaded(&app, &state)?;
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let before = s.data.presets.len();
        s.data.presets.retain(|p| p.id != preset_id);
        if s.data.presets.len() == before {
            return Err("Preset not found".to_string());
        }
    }
    persist(&app, &state)?;
    Ok(())
}

// The set_loadout endpoint rejects the full get_loadout response (which
// includes server-side fields like Version, Subject, etc.). Project to the
// writeable subset the existing LoadoutPage already uses.
fn project_writeable(full_json: &str) -> Result<String, String> {
    let v: serde_json::Value = serde_json::from_str(full_json).map_err(|e| format!("parse: {}", e))?;
    let body = serde_json::json!({
        "Guns": v.get("Guns").cloned().unwrap_or(serde_json::Value::Null),
        "Sprays": v.get("Sprays").cloned().unwrap_or(serde_json::Value::Null),
        "Identity": v.get("Identity").cloned().unwrap_or(serde_json::Value::Null),
        "Incognito": v.get("Incognito").cloned().unwrap_or(serde_json::Value::Bool(false)),
    });
    Ok(body.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_writeable_strips_non_writable_fields() {
        let full = r#"{"Version":42,"Subject":"abc","Guns":[1,2],"Sprays":[],"Identity":{"x":1},"Incognito":true,"OtherStuff":"ignored"}"#;
        let body = project_writeable(full).unwrap();
        let v: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert!(v.get("Version").is_none());
        assert!(v.get("Subject").is_none());
        assert!(v.get("OtherStuff").is_none());
        assert_eq!(v["Guns"], serde_json::json!([1, 2]));
        assert_eq!(v["Incognito"], serde_json::json!(true));
    }

    #[test]
    fn project_writeable_handles_missing_fields() {
        let full = r#"{"Guns":[]}"#;
        let body = project_writeable(full).unwrap();
        let v: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["Sprays"], serde_json::Value::Null);
        assert_eq!(v["Identity"], serde_json::Value::Null);
        assert_eq!(v["Incognito"], serde_json::json!(false));
    }
}
