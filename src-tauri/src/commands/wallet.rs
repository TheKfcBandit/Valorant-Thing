use std::sync::Arc;

use crate::{riot, SharedState};

#[tauri::command]
pub async fn get_wallet(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_wallet(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
