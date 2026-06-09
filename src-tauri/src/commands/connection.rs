use std::sync::Arc;

use crate::{identity_cache, riot, SharedState};

#[tauri::command]
pub async fn connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
    identity: tauri::State<'_, identity_cache::IdentityCache>,
    include_debug: Option<bool>,
) -> Result<riot::PlayerInfo, String> {
    let state_clone = Arc::clone(&state);
    let debug = include_debug.unwrap_or(false);
    let info =
        tauri::async_runtime::spawn_blocking(move || riot::connect_and_store(&state_clone, debug))
            .await
            .map_err(|e| format!("Task failed: {}", e))??;
    // Phase A of #18: persist a snapshot of the identity so HomePage etc.
    // can render last-seen data when Valorant is closed. Best-effort —
    // a failed write must NOT break the connect. The identity file is
    // tiny (~200 bytes); writing it on the async runtime is acceptable.
    if let Err(e) = identity_cache::save(&app, &identity, &info) {
        riot::logging::log_error(&format!("[IdentityCache] save failed: {}", e));
    }
    Ok(info)
}

#[tauri::command]
pub fn disconnect(state: tauri::State<'_, SharedState>) {
    riot::disconnect(&state)
}

#[tauri::command]
pub fn get_status(state: tauri::State<'_, SharedState>) -> String {
    riot::get_status(&state)
}

#[tauri::command]
pub fn get_player(state: tauri::State<'_, SharedState>) -> Option<riot::PlayerInfo> {
    riot::get_cached_player(&state)
}

// Phase B fix-pass (#11): canonical source for the OAuth lifecycle. The
// frontend polls this alongside `get_status` so the re-auth banner is
// driven by state rather than a one-shot event that can race the listener
// mount on cold start.
#[tauri::command]
pub fn get_oauth_state(state: tauri::State<'_, SharedState>) -> riot::OAuthState {
    state
        .lock()
        .map(|s| s.oauth_state)
        .unwrap_or(riot::OAuthState::Inactive)
}

#[tauri::command]
pub async fn health_check(
    state: tauri::State<'_, SharedState>,
) -> Result<Option<riot::PlayerInfo>, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || Ok(riot::health_check(&state)))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn get_token_age(state: tauri::State<'_, SharedState>) -> u64 {
    riot::get_token_age_secs(&state)
}
