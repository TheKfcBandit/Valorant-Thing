use std::sync::Arc;

use crate::{premier_cache, riot, SharedState};

// #23 Premier roster + standing view. Three pass-through commands that hit
// the same PD shard as the rest of the game endpoints. The cache write only
// happens once via cache_premier_bundle after the frontend has assembled the
// full player + division + conference triple — writing a partial bundle
// would atomically clobber a previously-valid snapshot with empty fields and
// poison the offline cache (Phase A pattern from #18).
#[tauri::command]
pub async fn get_premier_player(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_premier_player(&state, &target_puuid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_premier_division(
    state: tauri::State<'_, SharedState>,
    division_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_premier_division(&state, &division_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_premier_conference(
    state: tauri::State<'_, SharedState>,
    conference_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || {
        riot::get_premier_conference(&state, &conference_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// Best-effort persist: a disk failure here logs but does not surface to the
// frontend, matching how identity_cache::save is handled from `connect`.
#[tauri::command]
pub async fn cache_premier_bundle(
    app: tauri::AppHandle,
    cache: tauri::State<'_, premier_cache::PremierCache>,
    player: String,
    division: String,
    conference: String,
) -> Result<(), String> {
    if let Err(e) = premier_cache::save(&app, &cache, player, division, conference) {
        riot::logging::log_error(&format!("[PremierCache] save failed: {}", e));
    }
    Ok(())
}
