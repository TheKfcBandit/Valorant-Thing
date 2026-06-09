use std::sync::Arc;

use crate::{discord, riot, DiscordShared, SharedState, XmppShared};

#[tauri::command]
pub async fn xmpp_connect(
    xmpp: tauri::State<'_, XmppShared>,
    riot: tauri::State<'_, SharedState>,
) -> Result<String, String> {
    let xmpp = Arc::clone(&xmpp);
    let riot = Arc::clone(&riot);
    tauri::async_runtime::spawn_blocking(move || riot::xmpp::xmpp_connect(&xmpp, &riot))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn xmpp_disconnect(state: tauri::State<'_, XmppShared>) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::xmpp::xmpp_disconnect(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn xmpp_poll(state: tauri::State<'_, XmppShared>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::xmpp::xmpp_poll(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn xmpp_get_status(state: tauri::State<'_, XmppShared>) -> String {
    riot::xmpp::xmpp_get_status(&state)
}

#[tauri::command]
pub fn xmpp_get_logs(state: tauri::State<'_, XmppShared>) -> String {
    riot::xmpp::xmpp_get_logs(&state)
}

#[tauri::command]
pub async fn xmpp_send_fake_presence(
    state: tauri::State<'_, XmppShared>,
    riot: tauri::State<'_, SharedState>,
    presence_json: String,
) -> Result<(), String> {
    let state = Arc::clone(&state);
    let riot = Arc::clone(&riot);
    tauri::async_runtime::spawn_blocking(move || {
        riot::xmpp::xmpp_send_fake_presence(&state, &riot, &presence_json)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn start_discord_rpc(state: tauri::State<'_, DiscordShared>) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || discord::start_rpc(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn stop_discord_rpc(state: tauri::State<'_, DiscordShared>) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || discord::stop_rpc(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn update_discord_rpc(
    state: tauri::State<'_, DiscordShared>,
    details: String,
    rpc_state: String,
    large_image: String,
    large_text: String,
    small_image: String,
    small_text: String,
) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || {
        discord::update_rpc(
            &state,
            &details,
            &rpc_state,
            &large_image,
            &large_text,
            &small_image,
            &small_text,
        )
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
