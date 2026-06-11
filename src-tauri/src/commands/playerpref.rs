use std::sync::Arc;

use tauri::AppHandle;

use crate::player_settings_backup::{record_pre_write, SettingsBackupCache};
use crate::util::now_ms;
use crate::{riot, SharedState};

/// Sentinel returned when a settings write is blocked because the game is
/// running — VALORANT rewrites the server blob on exit, so any write made
/// while it runs would be silently clobbered. Contract with the frontend
/// `playerSettings.js` boundary, same pattern as `AUTH_REFRESHING`.
pub const GAME_RUNNING: &str = "GAME_RUNNING";

#[tauri::command]
pub async fn get_player_settings(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_player_settings(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_player_settings(
    app: AppHandle,
    state: tauri::State<'_, SharedState>,
    backup: tauri::State<'_, SettingsBackupCache>,
    decoded_json: String,
) -> Result<(), String> {
    write_settings_with_backup(&app, &state, &backup, decoded_json).await
}

#[tauri::command]
pub async fn restore_player_settings_backup(
    app: AppHandle,
    state: tauri::State<'_, SharedState>,
    backup: tauri::State<'_, SettingsBackupCache>,
    which: String,
) -> Result<(), String> {
    if which != "original" && which != "latest" {
        return Err(format!("Unknown backup slot '{}'", which));
    }
    let snapshot = backup.read(&app, |file| {
        let slot = if which == "original" {
            file.original.as_ref()
        } else {
            file.latest.as_ref()
        };
        slot.map(|s| s.decoded_json.clone())
    })?;
    let decoded_json = snapshot.ok_or_else(|| format!("No '{}' backup recorded yet", which))?;
    write_settings_with_backup(&app, &state, &backup, decoded_json).await
}

#[tauri::command]
pub async fn get_player_settings_backup_info(
    app: AppHandle,
    backup: tauri::State<'_, SettingsBackupCache>,
) -> Result<String, String> {
    backup.read(&app, |file| {
        serde_json::json!({
            "originalMs": file.original.as_ref().map(|s| s.saved_at_ms),
            "latestMs": file.latest.as_ref().map(|s| s.saved_at_ms),
        })
        .to_string()
    })
}

// Shared write path: game-running guard → fresh GET (server truth, not the
// frontend's possibly-stale copy) → snapshot → PUT. Restore reads its
// snapshot BEFORE entering, so restoring "latest" isn't clobbered by its
// own pre-write snapshot.
async fn write_settings_with_backup(
    app: &AppHandle,
    state: &tauri::State<'_, SharedState>,
    backup: &tauri::State<'_, SettingsBackupCache>,
    decoded_json: String,
) -> Result<(), String> {
    let game_running = tauri::async_runtime::spawn_blocking(riot::is_valorant_game_running)
        .await
        .map_err(|e| format!("Task failed: {}", e))?;
    if game_running {
        return Err(GAME_RUNNING.to_string());
    }

    let conn = Arc::clone(state);
    let current = tauri::async_runtime::spawn_blocking(move || riot::get_player_settings(&conn))
        .await
        .map_err(|e| format!("Task failed: {}", e))??;
    backup.write(app, |file| {
        record_pre_write(file, &current, now_ms());
        ((), true)
    })?;

    let conn = Arc::clone(state);
    tauri::async_runtime::spawn_blocking(move || riot::put_player_settings(&conn, &decoded_json))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
