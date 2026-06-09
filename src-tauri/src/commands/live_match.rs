use std::sync::Arc;

use crate::{riot, SharedState};

#[tauri::command]
pub async fn check_current_game(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::check_current_game(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_match_loadouts(
    state: tauri::State<'_, SharedState>,
    match_id: String,
    phase: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || {
        riot::get_match_loadouts(&state, &match_id, &phase)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn select_agent(
    state: tauri::State<'_, SharedState>,
    match_id: String,
    agent_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::select_agent(&state, &match_id, &agent_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn lock_agent(
    state: tauri::State<'_, SharedState>,
    match_id: String,
    agent_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::lock_agent(&state, &match_id, &agent_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn pregame_quit(
    state: tauri::State<'_, SharedState>,
    match_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::pregame_quit(&state, &match_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn coregame_quit(
    state: tauri::State<'_, SharedState>,
    match_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::coregame_quit(&state, &match_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_owned_agents(state: tauri::State<'_, SharedState>) -> Result<Vec<String>, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_owned_agents(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
