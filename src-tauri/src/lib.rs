use std::sync::{Arc, Mutex};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

mod bomb_tracker;
mod cloud;
mod coach;
mod discord;
mod identity_cache;
mod loadout_presets;
mod match_db;
mod match_details_cache;
mod oauth;
mod premier_cache;
mod riot;
mod rr_cache;
mod spend_tracker;
mod store;
mod token_store;
mod util;
mod value_cache;

type SharedState = Arc<Mutex<riot::ConnectionState>>;
type DiscordShared = Arc<Mutex<discord::DiscordState>>;
type XmppShared = Arc<Mutex<riot::xmpp::XmppState>>;

#[tauri::command]
async fn connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
    identity: tauri::State<'_, identity_cache::IdentityCache>,
) -> Result<riot::PlayerInfo, String> {
    let state_clone = Arc::clone(&state);
    let info = tauri::async_runtime::spawn_blocking(move || riot::connect_and_store(&state_clone))
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
fn disconnect(state: tauri::State<'_, SharedState>) {
    riot::disconnect(&state)
}

#[tauri::command]
fn get_status(state: tauri::State<'_, SharedState>) -> String {
    riot::get_status(&state)
}

#[tauri::command]
fn get_player(state: tauri::State<'_, SharedState>) -> Option<riot::PlayerInfo> {
    riot::get_cached_player(&state)
}

// Phase B fix-pass (#11): canonical source for the OAuth lifecycle. The
// frontend polls this alongside `get_status` so the re-auth banner is
// driven by state rather than a one-shot event that can race the listener
// mount on cold start.
#[tauri::command]
fn get_oauth_state(state: tauri::State<'_, SharedState>) -> riot::OAuthState {
    state
        .lock()
        .map(|s| s.oauth_state)
        .unwrap_or(riot::OAuthState::Inactive)
}

#[tauri::command]
fn is_valorant_running() -> bool {
    riot::is_valorant_running()
}

#[tauri::command]
fn is_valorant_foreground() -> bool {
    riot::is_valorant_foreground()
}

#[tauri::command]
fn get_valorant_monitor() -> Result<String, String> {
    let (x, y, w, h) = riot::get_valorant_monitor()?;
    Ok(serde_json::json!({ "x": x, "y": y, "width": w, "height": h }).to_string())
}

#[tauri::command]
fn list_monitors() -> Result<String, String> {
    riot::list_monitors()
}

#[tauri::command]
fn find_valorant_path() -> Result<String, String> {
    riot::find_valorant_path()
}

#[tauri::command]
fn compute_file_hash(path: String) -> Result<String, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let data = std::fs::read(&path).map_err(|e| format!("read {}: {}", path, e))?;
    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);
    Ok(format!("{:x}", hasher.finish()))
}

#[tauri::command]
fn force_copy_file(source: String, dest: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
    }
    std::fs::copy(&source, &dest).map_err(|e| format!("copy {} -> {}: {}", source, dest, e))?;
    Ok(())
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).map_err(|e| format!("remove {}: {}", path, e))?;
    }
    Ok(())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut entries = vec![];
    for entry in std::fs::read_dir(dir)
        .map_err(|e| format!("readdir {}: {}", path, e))?
        .flatten()
    {
        if let Some(name) = entry.file_name().to_str() {
            entries.push(name.to_string());
        }
    }
    Ok(entries)
}

#[tauri::command]
fn show_window_no_focus(app: tauri::AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        extern "system" {
            fn GetForegroundWindow() -> isize;
            fn SetForegroundWindow(hwnd: isize) -> i32;
            fn ShowWindow(hwnd: isize, cmd: i32) -> i32;
            fn SetWindowPos(
                hwnd: isize,
                insert_after: isize,
                x: i32,
                y: i32,
                cx: i32,
                cy: i32,
                flags: u32,
            ) -> i32;
        }
        const SW_SHOWNOACTIVATE: i32 = 4;
        const HWND_TOPMOST: isize = -1;
        const SWP_NOMOVE: u32 = 0x0002;
        const SWP_NOSIZE: u32 = 0x0001;
        const SWP_NOACTIVATE: u32 = 0x0010;

        if let Some(window) = app.get_webview_window(&label) {
            let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
            unsafe {
                let prev_fg = GetForegroundWindow();
                ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
                if prev_fg != 0 && prev_fg != hwnd {
                    SetForegroundWindow(prev_fg);
                }
            }
            return Ok(());
        }
        Err("Window not found".into())
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(window) = app.get_webview_window(&label) {
            window.show().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("Window not found".into())
        }
    }
}

#[tauri::command]
fn toggle_devtools(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
}

#[tauri::command]
fn read_game_log(offset: u64) -> Result<serde_json::Value, String> {
    let local_app_data =
        std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found".to_string())?;
    let path = format!("{}\\VALORANT\\Saved\\Logs\\ShooterGame.log", local_app_data);

    let file =
        std::fs::File::open(&path).map_err(|e| format!("Could not open ShooterGame.log: {}", e))?;
    let file_len = file.metadata().map_err(|e| e.to_string())?.len();

    let actual_offset = if offset > file_len { 0 } else { offset };

    let read_from = if actual_offset == 0 && file_len > 131072 {
        file_len - 131072
    } else {
        actual_offset
    };

    let max_read: u64 = 131072;
    let read_len = std::cmp::min(file_len.saturating_sub(read_from), max_read);

    if read_len == 0 {
        return Ok(serde_json::json!({ "text": "", "offset": file_len, "fileSize": file_len }));
    }

    use std::io::{Read, Seek, SeekFrom};
    let mut file = file;
    file.seek(SeekFrom::Start(read_from))
        .map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; read_len as usize];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&buf).to_string();

    Ok(serde_json::json!({
        "text": text,
        "offset": file_len,
        "fileSize": file_len,
    }))
}

#[tauri::command]
fn check_node_installed() -> bool {
    let mut cmd = std::process::Command::new("node");
    cmd.args(["--version"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

#[tauri::command]
async fn health_check(
    state: tauri::State<'_, SharedState>,
) -> Result<Option<riot::PlayerInfo>, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || Ok(riot::health_check(&state)))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn check_current_game(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::check_current_game(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_match_loadouts(
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
async fn select_agent(
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
async fn lock_agent(
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
async fn pregame_quit(
    state: tauri::State<'_, SharedState>,
    match_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::pregame_quit(&state, &match_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn coregame_quit(
    state: tauri::State<'_, SharedState>,
    match_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::coregame_quit(&state, &match_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_home_stats(
    state: tauri::State<'_, SharedState>,
    queue_filter: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_home_stats(&state, &queue_filter))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn check_loadout(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::check_loadout(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_match_page(
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
async fn get_owned_agents(state: tauri::State<'_, SharedState>) -> Result<Vec<String>, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_owned_agents(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_party(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_party(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_friends(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_friends(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_penalties(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_penalties(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn set_party_accessibility(
    state: tauri::State<'_, SharedState>,
    open: bool,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::set_party_accessibility(&state, open))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn disable_party_code(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::disable_party_code(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn kick_from_party(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::kick_from_party(&state, &target_puuid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn invite_to_party(
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
async fn request_to_join_party(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::request_to_join_party(&state, &target_puuid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn generate_party_code(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::generate_party_code(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn join_party_by_code(
    state: tauri::State<'_, SharedState>,
    code: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::join_party_by_code(&state, &code))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn change_queue(
    state: tauri::State<'_, SharedState>,
    queue_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::change_queue(&state, &queue_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_custom_configs(state: tauri::State<'_, SharedState>) -> Result<String, String> {
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
async fn set_custom_settings(
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
async fn get_chat_conversations(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_chat_conversations(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_chat_messages(
    state: tauri::State<'_, SharedState>,
    cid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_chat_messages(&state, &cid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn send_chat_message(
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
async fn get_chat_participants(
    state: tauri::State<'_, SharedState>,
    cid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_chat_participants(&state, &cid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_loadout(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_loadout(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn set_loadout(
    state: tauri::State<'_, SharedState>,
    loadout_json: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::set_loadout(&state, &loadout_json))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_owned_items(
    state: tauri::State<'_, SharedState>,
    item_type_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_owned_items(&state, &item_type_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn start_custom_game_match(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::start_custom_game_match(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn enter_queue(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::enter_queue(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn leave_queue(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::leave_queue(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn start_discord_rpc(state: tauri::State<'_, DiscordShared>) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || discord::start_rpc(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn stop_discord_rpc(state: tauri::State<'_, DiscordShared>) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || discord::stop_rpc(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn update_discord_rpc(
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

#[tauri::command]
async fn xmpp_connect(
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
async fn xmpp_disconnect(state: tauri::State<'_, XmppShared>) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::xmpp::xmpp_disconnect(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn xmpp_poll(state: tauri::State<'_, XmppShared>) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::xmpp::xmpp_poll(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
fn xmpp_get_status(state: tauri::State<'_, XmppShared>) -> String {
    riot::xmpp::xmpp_get_status(&state)
}

#[tauri::command]
fn xmpp_get_logs(state: tauri::State<'_, XmppShared>) -> String {
    riot::xmpp::xmpp_get_logs(&state)
}

#[tauri::command]
async fn xmpp_send_fake_presence(
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
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[tauri::command]
async fn check_for_update() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = r#"const https=require('https');const o={hostname:'api.github.com',path:'/repos/TheKfcBandit/Valorant-Thing/releases?per_page=20',headers:{'User-Agent':'ValorantThing'}};https.get(o,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}).on('error',e=>{process.stderr.write(e.message);process.exit(1)})"#;
        let mut cmd = std::process::Command::new("node");
        cmd.args(["-e", script]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        let body = String::from_utf8_lossy(&output.stdout).to_string();
        let releases: Vec<serde_json::Value> = serde_json::from_str(&body).map_err(|e| format!("parse: {}", e))?;
        let current = CURRENT_VERSION;
        let cur_parts: Vec<u32> = current.split('.').filter_map(|s| s.parse().ok()).collect();

        let mut newer: Vec<&serde_json::Value> = releases.iter().filter(|r| {
            let t = r["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
            let parts: Vec<u32> = t.split('.').filter_map(|s| s.parse().ok()).collect();
            parts > cur_parts
        }).collect();
        if newer.is_empty() {
            return Ok(serde_json::json!({"update": false, "current": current}).to_string());
        }
        newer.sort_by(|a, b| {
            let av: Vec<u32> = a["tag_name"].as_str().unwrap_or("").trim_start_matches('v').split('.').filter_map(|s| s.parse().ok()).collect();
            let bv: Vec<u32> = b["tag_name"].as_str().unwrap_or("").trim_start_matches('v').split('.').filter_map(|s| s.parse().ok()).collect();
            bv.cmp(&av)
        });

        let latest = &newer[0];
        let tag = latest["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
        let mut download_url = String::new();
        let mut asset_name = String::new();
        if let Some(assets) = latest["assets"].as_array() {
            for a in assets {
                let name = a["name"].as_str().unwrap_or("");
                if name.ends_with(".exe") && name.contains("setup") {
                    download_url = a["browser_download_url"].as_str().unwrap_or("").to_string();
                    asset_name = name.to_string();
                    break;
                }
            }
        }
        let all_releases: Vec<serde_json::Value> = newer.iter().map(|r| {
            serde_json::json!({
                "version": r["tag_name"].as_str().unwrap_or("").trim_start_matches('v'),
                "notes": r["body"].as_str().unwrap_or(""),
                "published_at": r["published_at"].as_str().unwrap_or(""),
            })
        }).collect();
        Ok(serde_json::json!({
            "update": true,
            "current": current,
            "latest": tag,
            "download_url": download_url,
            "asset_name": asset_name,
            "release_url": latest["html_url"].as_str().unwrap_or(""),
            "release_notes": latest["body"].as_str().unwrap_or(""),
            "published_at": latest["published_at"].as_str().unwrap_or(""),
            "all_releases": all_releases,
        }).to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn download_and_install_update(
    app: tauri::AppHandle,
    url: String,
    filename: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !url.starts_with("https://github.com/")
            && !url.starts_with("https://objects.githubusercontent.com/")
        {
            return Err("Update URL must point to a GitHub release asset".to_string());
        }
        let filename = std::path::Path::new(&filename)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| n.ends_with(".exe"))
            .ok_or_else(|| "Invalid installer filename".to_string())?
            .to_string();
        let temp = std::env::temp_dir();
        let installer_path = temp.join(&filename);
        let bat_path = temp.join("valthing_update.bat");
        let installer_str = installer_path.to_string_lossy().to_string();
        let bat_str = bat_path.to_string_lossy().to_string();

        let mut cmd = std::process::Command::new("curl");
        cmd.args([
            "-L",
            "-o",
            &installer_str,
            "-A",
            "ValorantThing",
            "--fail",
            "--silent",
            "--show-error",
            &url,
        ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("download failed: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "Download failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }

        let bat_content = format!(
            "@echo off\r\ntimeout /t 2 /nobreak >nul\r\nstart \"\" \"{}\"\r\ndel \"%~f0\"\r\n",
            installer_str
        );
        std::fs::write(&bat_path, &bat_content).map_err(|e| format!("write bat: {}", e))?;

        let mut bat_cmd = std::process::Command::new("cmd");
        bat_cmd.args(["/c", "start", "", "/b", &bat_str]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            bat_cmd.creation_flags(0x08000000);
        }
        bat_cmd.spawn().map_err(|e| format!("spawn bat: {}", e))?;

        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    app.exit(0);
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
fn get_token_age(state: tauri::State<'_, SharedState>) -> u64 {
    riot::get_token_age_secs(&state)
}

#[tauri::command]
async fn get_player_mmr(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_player_mmr(&state, &target_puuid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_rr_history(
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
async fn get_match_details(
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
async fn resolve_player_names(
    state: tauri::State<'_, SharedState>,
    puuids: Vec<String>,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::resolve_player_names(&state, puuids))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_player_level_from_history(
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

// #23 Premier roster + standing view. Three pass-through commands that hit
// the same PD shard as the rest of the game endpoints. The cache write only
// happens once via cache_premier_bundle after the frontend has assembled the
// full player + division + conference triple — writing a partial bundle
// would atomically clobber a previously-valid snapshot with empty fields and
// poison the offline cache (Phase A pattern from #18).
#[tauri::command]
async fn get_premier_player(
    state: tauri::State<'_, SharedState>,
    target_puuid: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_premier_player(&state, &target_puuid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_premier_division(
    state: tauri::State<'_, SharedState>,
    division_id: String,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::get_premier_division(&state, &division_id))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn get_premier_conference(
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
async fn cache_premier_bundle(
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

#[tauri::command]
async fn splooshima_lookup(puuids: Vec<String>, api_key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let body = serde_json::json!(puuids).to_string();
        riot::splooshima_api_post("/v1/lookup", &body, &api_key)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

pub fn run() {
    // Route any backend panic through riot::logging so it lands in the log
    // viewer instead of vanishing with the window. Without this hook a panic
    // anywhere in a Tauri command (or a spawn_blocking task) is a silent
    // process death with no diagnostic trail.
    std::panic::set_hook(Box::new(|info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown>".to_string());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("<non-string payload>");
        let line = format!("[panic] {} at {}", payload, location);
        // Always print to stderr — the frontend emitter only works once
        // logging::init() has run inside .setup(). Anything that panics
        // before that point (icon load, AppUserModelID extern, .manage
        // chain) would otherwise vanish, since this hook replaces the
        // default stderr-print behavior. Cheap, always-correct fallback.
        eprintln!("{}", line);
        riot::logging::log_error(&line);
    }));

    #[cfg(windows)]
    {
        #[link(name = "shell32")]
        extern "system" {
            fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
        }
        let id: Vec<u16> = "com.valorantthing.app\0".encode_utf16().collect();
        unsafe {
            SetCurrentProcessExplicitAppUserModelID(id.as_ptr());
        }
    }

    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(riot::ConnectionState::default())))
        .manage(Arc::new(Mutex::new(discord::DiscordState::default())))
        .manage(Arc::new(Mutex::new(riot::xmpp::XmppState::default())))
        .manage::<store::WishlistShared>(Arc::new(Mutex::new(Vec::new())))
        .manage(match_db::new_db())
        .manage(match_details_cache::new_cache())
        .manage(rr_cache::new_cache())
        .manage(Mutex::new(spend_tracker::SpendState::default()))
        .manage(identity_cache::new_cache())
        .manage(loadout_presets::new_cache())
        .manage(premier_cache::new_cache())
        .manage(oauth::OAuthWebviewBusy::new())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            riot::logging::init(app.handle().clone());

            // Phase B (#26): boot-time OAuth session restoration + background
            // silent refresh. If a token blob is in the keychain (or JSON
            // fallback), hydrate ConnectionState immediately and validate;
            // any failure runs the three-rung refresh chain so Home/Store/
            // etc. render live data without a manual "Sign in with Riot"
            // click. Afterwards, run a 60s refresh loop that catches the
            // ~60min access-token expiry before the user notices.
            {
                let app_handle = app.handle().clone();
                let state = Arc::clone(&app.state::<SharedState>());
                tauri::async_runtime::spawn(async move {
                    // Boot hydration. populate_from_blob loads the data
                    // fields but leaves `connected=false` so any frontend
                    // command racing this validate sees "not connected"
                    // and waits, instead of firing against a stale token.
                    // Only mark_oauth_active (after validate succeeds) or
                    // a successful refresh chain flip the session live.
                    if let Some(blob) = token_store::load(&app_handle) {
                        oauth::populate_from_blob(&state, &blob);
                        let valid = {
                            let state = Arc::clone(&state);
                            tauri::async_runtime::spawn_blocking(move || {
                                riot::validate_token(&state)
                            })
                            .await
                            .unwrap_or(false)
                        };
                        if valid {
                            oauth::mark_oauth_active(&state);
                            riot::logging::log_info("[OAuth-Boot] session restored from keychain");
                        } else {
                            riot::logging::log_info(
                                "[OAuth-Boot] stored token invalid; running refresh chain",
                            );
                            let _ = oauth::refresh_oauth_session(
                                app_handle.clone(),
                                Arc::clone(&state),
                            )
                            .await;
                        }
                    }

                    // Bg refresh loop. Two triggers: NeedsRefresh state set
                    // by health_check on validate-fail (#2), or token age
                    // >= 540s (pre-emptive — get ahead of the 600s expiry).
                    // Skip behaviour prevents a slow rung-2 from spawning
                    // catch-up ticks racing on the cookie data_dir (#9).
                    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
                    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                    interval.tick().await; // skip the immediate first tick
                    loop {
                        interval.tick().await;
                        let (should_act, age) = match state.lock() {
                            Ok(s) => {
                                if !s.oauth_session {
                                    (false, 0)
                                } else {
                                    let age = s
                                        .token_fetched_at
                                        .map(|t| t.elapsed().as_secs())
                                        .unwrap_or(0);
                                    let signalled = s.oauth_state == riot::OAuthState::NeedsRefresh;
                                    (signalled || age >= 540, age)
                                }
                            }
                            Err(_) => (false, 0),
                        };
                        if !should_act {
                            continue;
                        }
                        riot::logging::log_info(&format!(
                            "[OAuth-Bg] refreshing (token age {}s)",
                            age
                        ));
                        let _ =
                            oauth::refresh_oauth_session(app_handle.clone(), Arc::clone(&state))
                                .await;
                    }
                });
            }

            // One-shot import of legacy match-cache.json into SQLite.
            // Runs off the setup thread so a multi-MB legacy cache doesn't
            // stall window creation. The migrator is idempotent
            // (schema_meta.json_imported), and any match_history_put_many
            // landing before it finishes uses INSERT OR IGNORE so a
            // newer row from a live fetch wins the race against the
            // older migrated copy — no data loss.
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let state = handle.state::<match_db::MatchDb>();
                    match_db::migrate_from_json(&handle, &state);
                });
            }
            {
                let conn = Arc::clone(&app.state::<SharedState>());
                let wl = Arc::clone(&app.state::<store::WishlistShared>());
                store::spawn_storefront_poller(app.handle().clone(), conn, wl);
            }
            let show_item = MenuItemBuilder::with_id("show", "Show").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Valorant Thing")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect,
            disconnect,
            get_status,
            get_player,
            get_oauth_state,
            is_valorant_running,
            is_valorant_foreground,
            get_valorant_monitor,
            list_monitors,
            find_valorant_path,
            compute_file_hash,
            force_copy_file,
            remove_file,
            list_dir,
            toggle_devtools,
            check_node_installed,
            health_check,
            exit_app,
            check_for_update,
            download_and_install_update,
            check_current_game,
            get_match_loadouts,
            select_agent,
            lock_agent,
            pregame_quit,
            coregame_quit,
            get_owned_agents,
            get_token_age,
            get_player_mmr,
            get_rr_history,
            get_match_details,
            get_home_stats,
            check_loadout,
            get_match_page,
            resolve_player_names,
            get_player_level_from_history,
            splooshima_lookup,
            get_party,
            get_friends,
            get_penalties,
            set_party_accessibility,
            disable_party_code,
            kick_from_party,
            invite_to_party,
            request_to_join_party,
            generate_party_code,
            join_party_by_code,
            change_queue,
            get_custom_configs,
            set_custom_settings,
            start_discord_rpc,
            stop_discord_rpc,
            update_discord_rpc,
            start_custom_game_match,
            get_chat_conversations,
            get_chat_messages,
            send_chat_message,
            get_chat_participants,
            enter_queue,
            leave_queue,
            get_loadout,
            set_loadout,
            get_owned_items,
            xmpp_connect,
            xmpp_disconnect,
            xmpp_poll,
            xmpp_get_status,
            xmpp_get_logs,
            xmpp_send_fake_presence,
            get_app_version,
            show_window_no_focus,
            read_game_log,
            cloud::cloud_save,
            cloud::cloud_load,
            store::get_storefront,
            store::set_wishlist,
            store::force_refresh_storefront,
            match_db::match_history_put,
            match_db::match_history_put_many,
            match_db::match_history_list,
            match_db::match_history_stats,
            match_db::match_history_distinct_queues,
            match_db::match_history_aggregate,
            rr_cache::rr_history_put_many,
            rr_cache::rr_history_list,
            rr_cache::rr_history_stats,
            spend_tracker::get_spend_summary,
            coach::coach_analyze,
            identity_cache::get_cached_identity,
            oauth::oauth_signin,
            oauth::oauth_signout,
            loadout_presets::list_loadout_presets,
            loadout_presets::save_loadout_preset,
            loadout_presets::apply_loadout_preset,
            loadout_presets::delete_loadout_preset,
            bomb_tracker::start_bomb_tracker,
            bomb_tracker::stop_bomb_tracker,
            bomb_tracker::is_bomb_tracker_running,
            get_premier_player,
            get_premier_division,
            get_premier_conference,
            cache_premier_bundle,
            premier_cache::get_cached_premier,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
