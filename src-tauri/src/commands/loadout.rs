use std::sync::Arc;

use crate::{riot, SharedState};

#[tauri::command]
pub async fn get_loadout(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_loadout(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_loadout(
    state: tauri::State<'_, SharedState>,
    loadout_json: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::set_loadout(&state, &loadout_json))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_owned_items(
    state: tauri::State<'_, SharedState>,
    item_type_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_owned_items(&state, &item_type_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn check_loadout(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::check_loadout(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
