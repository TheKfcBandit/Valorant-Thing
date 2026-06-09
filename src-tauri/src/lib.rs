use std::sync::{Arc, Mutex};
use tauri::Manager;

mod background;
mod bomb_tracker;
mod cloud;
mod coach;
mod commands;
mod discord;
mod identity_cache;
mod loadout_presets;
mod match_db;
mod match_details_cache;
mod oauth;
mod premier_cache;
mod riot;
mod rr_cache;
mod secret_store;
mod spend_tracker;
mod store;
mod token_store;
mod tray;
mod util;
mod value_cache;

pub(crate) type SharedState = Arc<Mutex<riot::ConnectionState>>;
pub(crate) type DiscordShared = Arc<Mutex<discord::DiscordState>>;
pub(crate) type XmppShared = Arc<Mutex<riot::xmpp::XmppState>>;

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
        .manage(spend_tracker::new_cache())
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
            background::spawn_oauth_session_manager(
                app.handle().clone(),
                Arc::clone(&app.state::<SharedState>()),
            );
            background::spawn_match_db_migration(app.handle().clone());
            background::spawn_storefront_poller(app);
            tray::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connection::connect,
            commands::connection::disconnect,
            commands::connection::get_status,
            commands::connection::get_player,
            commands::connection::get_oauth_state,
            commands::connection::health_check,
            commands::connection::get_token_age,
            commands::process::is_valorant_running,
            commands::process::is_valorant_foreground,
            commands::process::get_valorant_monitor,
            commands::process::list_monitors,
            commands::process::find_valorant_path,
            commands::process::compute_file_hash,
            commands::process::force_copy_file,
            commands::process::remove_file,
            commands::process::list_dir,
            commands::process::read_game_log,
            commands::app::show_window_no_focus,
            commands::app::toggle_devtools,
            commands::app::exit_app,
            commands::app::get_app_version,
            commands::app::check_node_installed,
            commands::app::check_for_update,
            commands::app::download_and_install_update,
            commands::live_match::check_current_game,
            commands::live_match::get_match_loadouts,
            commands::live_match::select_agent,
            commands::live_match::lock_agent,
            commands::live_match::pregame_quit,
            commands::live_match::coregame_quit,
            commands::live_match::get_owned_agents,
            commands::stats::get_home_stats,
            commands::stats::get_player_mmr,
            commands::stats::get_rr_history,
            commands::stats::get_match_details,
            commands::stats::get_match_page,
            commands::stats::resolve_player_names,
            commands::stats::get_player_level_from_history,
            commands::stats::splooshima_lookup,
            commands::party::get_party,
            commands::party::get_friends,
            commands::party::get_penalties,
            commands::party::set_party_accessibility,
            commands::party::disable_party_code,
            commands::party::kick_from_party,
            commands::party::invite_to_party,
            commands::party::request_to_join_party,
            commands::party::generate_party_code,
            commands::party::join_party_by_code,
            commands::party::change_queue,
            commands::party::enter_queue,
            commands::party::leave_queue,
            commands::party::get_custom_configs,
            commands::party::set_custom_settings,
            commands::party::start_custom_game_match,
            commands::chat::get_chat_conversations,
            commands::chat::get_chat_messages,
            commands::chat::send_chat_message,
            commands::chat::get_chat_participants,
            commands::loadout::get_loadout,
            commands::loadout::set_loadout,
            commands::loadout::get_owned_items,
            commands::loadout::check_loadout,
            commands::premier::get_premier_player,
            commands::premier::get_premier_division,
            commands::premier::get_premier_conference,
            commands::premier::cache_premier_bundle,
            commands::presence::xmpp_connect,
            commands::presence::xmpp_disconnect,
            commands::presence::xmpp_poll,
            commands::presence::xmpp_get_status,
            commands::presence::xmpp_get_logs,
            commands::presence::xmpp_send_fake_presence,
            commands::presence::start_discord_rpc,
            commands::presence::stop_discord_rpc,
            commands::presence::update_discord_rpc,
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
            premier_cache::get_cached_premier,
            secret_store::get_secret,
            secret_store::set_secret,
            secret_store::delete_secret,
            match_details_cache::get_death_locations,
            match_details_cache::get_player_match_summaries,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
