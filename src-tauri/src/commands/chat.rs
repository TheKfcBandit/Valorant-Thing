use std::sync::Arc;

use crate::{riot, SharedState};

#[tauri::command]
pub async fn get_chat_conversations(
    state: tauri::State<'_, SharedState>,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_chat_conversations(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_chat_messages(
    state: tauri::State<'_, SharedState>,
    cid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_chat_messages(&state, &cid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn send_chat_message(
    state: tauri::State<'_, SharedState>,
    cid: String,
    message: String,
    msg_type: Option<String>,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    let t = msg_type.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        riot::send_chat_message(&state, &cid, &message, &t)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_chat_participants(
    state: tauri::State<'_, SharedState>,
    cid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_chat_participants(&state, &cid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
