use std::sync::Arc;

use crate::{match_details_cache, riot, SharedState};

#[tauri::command]
pub async fn get_home_stats(
    state: tauri::State<'_, SharedState>,
    queue_filter: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_home_stats(&state, &queue_filter))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_player_mmr(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_player_mmr(&state, &target_puuid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_rr_history(
    state: tauri::State<'_, SharedState>,
    start: u64,
    end: u64,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_rr_history(&state, start, end))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_match_details(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
    cache: tauri::State<'_, match_details_cache::MatchDetailsCache>,
    match_id: String,
) -> Result<String, String> {
    // Cache-first: a match-details payload is immutable post-game, so a hit
    // is always safe to serve — even when Valorant is closed and the user
    // has no OAuth session. The cache lets the modal render any previously-
    // opened match offline. See #26 / match_details_cache.rs.
    if let Ok(Some(cached)) = match_details_cache::get(&app, &cache, &match_id) {
        return serde_json::to_string(&cached).map_err(|e| format!("cache serialize: {}", e));
    }

    let state_clone = Arc::clone(&state);
    let match_id_clone = match_id.clone();
    let raw = tauri::async_runtime::spawn_blocking(move || {
        riot::get_match_details(&state_clone, &match_id_clone)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // Best-effort cache write; a failure here MUST NOT break the live fetch.
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
        if let Err(e) = match_details_cache::put(&app, &cache, &match_id, parsed) {
            riot::logging::log_error(&format!("[MatchDetailsCache] put failed: {}", e));
        }
    }

    Ok(raw)
}

#[tauri::command]
pub async fn get_match_page(
    state: tauri::State<'_, SharedState>,
    page: u64,
    page_size: u64,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_match_page(&state, page, page_size))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn resolve_player_names(
    state: tauri::State<'_, SharedState>,
    puuids: Vec<String>,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::resolve_player_names(&state, puuids))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_player_level_from_history(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || {
        riot::get_player_level_from_history(&state, &target_puuid)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn splooshima_lookup(puuids: Vec<String>, api_key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let body = serde_json::json!(puuids).to_string();
        riot::splooshima_api_post("/v1/lookup", &body, &api_key)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
