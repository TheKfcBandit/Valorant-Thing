use std::sync::Arc;

use crate::{riot, SharedState};

#[tauri::command]
pub async fn get_party(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_party(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_friends(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_friends(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_penalties(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_penalties(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_party_accessibility(
    state: tauri::State<'_, SharedState>,
    open: bool,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::set_party_accessibility(&state, open))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn disable_party_code(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::disable_party_code(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn kick_from_party(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::kick_from_party(&state, &target_puuid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn invite_to_party(
    state: tauri::State<'_, SharedState>,
    name: String,
    tag: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::invite_to_party(&state, &name, &tag))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn request_to_join_party(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::request_to_join_party(&state, &target_puuid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn generate_party_code(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::generate_party_code(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn join_party_by_code(
    state: tauri::State<'_, SharedState>,
    code: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::join_party_by_code(&state, &code))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn change_queue(
    state: tauri::State<'_, SharedState>,
    queue_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::change_queue(&state, &queue_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn enter_queue(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::enter_queue(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn leave_queue(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::leave_queue(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_custom_configs(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_custom_configs(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

// Tauri commands expose an explicit parameter for each frontend-facing field;
// bundling into a struct would require a parallel JS-side shape and add no
// real simplification. The signature is intentional.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn set_custom_settings(
    state: tauri::State<'_, SharedState>,
    map: String,
    mode: String,
    pod: String,
    allow_cheats: bool,
    play_out_all_rounds: bool,
    skip_match_history: bool,
    tournament_mode: bool,
    overtime_win_by_two: bool,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || {
        riot::set_custom_settings(
            &state,
            &map,
            &mode,
            &pod,
            allow_cheats,
            play_out_all_rounds,
            skip_match_history,
            tournament_mode,
            overtime_win_by_two,
        )
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn start_custom_game_match(
    state: tauri::State<'_, SharedState>,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::start_custom_game_match(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
