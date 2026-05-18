// #27: file-backed loadout presets. Save the current in-game loadout
// under a name, apply any preset back to the live game via the existing
// set_loadout command. Storage/persistence inherited from
// value_cache::Cache.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::riot::{self, ConnectionState};
use crate::util::now_ms;
use crate::value_cache::Cache;

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
pub struct PresetsFile {
    pub presets: Vec<Preset>,
}

pub type PresetsCache = Cache<PresetsFile>;

pub fn new_cache() -> PresetsCache {
    Cache::new("loadout-presets.json", "[Presets]")
}

fn make_id() -> String {
    // Tiny non-cryptographic ID; collisions are practically impossible at
    // human-scale preset counts. Format: "p{epoch_ms}-{rand}" so they sort
    // naturally too.
    let ms = now_ms();
    let rand: u32 = (ms as u32)
        .wrapping_mul(2654435761)
        .wrapping_add(0x9E3779B9);
    format!("p{}-{:x}", ms, rand)
}

#[tauri::command]
pub async fn list_loadout_presets(
    app: AppHandle,
    cache: tauri::State<'_, PresetsCache>,
) -> Result<Vec<Preset>, String> {
    cache.read(&app, |file| file.presets.clone())
}

#[tauri::command]
pub async fn save_loadout_preset(
    app: AppHandle,
    cache: tauri::State<'_, PresetsCache>,
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
    // Pre-check the limit before doing the (potentially slow) live fetch.
    let at_limit = cache.read(&app, |file| file.presets.len() >= MAX_PRESETS)?;
    if at_limit {
        return Err(format!(
            "Preset limit reached ({}), delete one first",
            MAX_PRESETS
        ));
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
    let to_return = preset.clone();
    cache.write(&app, |file| {
        file.presets.push(preset);
        ((), true)
    })?;
    Ok(to_return)
}

#[tauri::command]
pub async fn apply_loadout_preset(
    app: AppHandle,
    cache: tauri::State<'_, PresetsCache>,
    conn: tauri::State<'_, std::sync::Arc<Mutex<ConnectionState>>>,
    preset_id: String,
) -> Result<(), String> {
    let loadout_json = cache.read(&app, |file| {
        file.presets
            .iter()
            .find(|p| p.id == preset_id)
            .map(|p| p.loadout_json.clone())
    })?;
    let loadout_json = loadout_json.ok_or_else(|| "Preset not found".to_string())?;
    // set_loadout expects only the writeable subset (Guns/Sprays/Identity/
    // Incognito), which is what the frontend sends. But save_loadout_preset
    // stored the FULL get_loadout response. Project to the writeable subset
    // before applying.
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
    cache: tauri::State<'_, PresetsCache>,
    preset_id: String,
) -> Result<(), String> {
    cache.write(&app, |file| {
        let before = file.presets.len();
        file.presets.retain(|p| p.id != preset_id);
        let removed = file.presets.len() != before;
        (
            if removed {
                Ok(())
            } else {
                Err("Preset not found".to_string())
            },
            removed,
        )
    })?
}

// The set_loadout endpoint rejects the full get_loadout response (which
// includes server-side fields like Version, Subject, etc.). Project to the
// writeable subset the existing LoadoutPage already uses.
fn project_writeable(full_json: &str) -> Result<String, String> {
    let v: serde_json::Value =
        serde_json::from_str(full_json).map_err(|e| format!("parse: {}", e))?;
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
