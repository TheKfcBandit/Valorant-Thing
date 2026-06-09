// Long-lived background work spawned from .setup(): OAuth session
// restoration + silent refresh, the one-shot legacy match-cache migration,
// and the storefront poller. Bodies moved verbatim out of lib.rs so it can
// stay at run()-plus-wiring size.

use std::sync::Arc;

use tauri::Manager;

use crate::{match_db, oauth, riot, store, token_store, SharedState};

// Phase B (#26): boot-time OAuth session restoration + background silent
// refresh. If a token blob is in the keychain (or JSON fallback), hydrate
// ConnectionState immediately and validate; any failure runs the three-rung
// refresh chain so Home/Store/etc. render live data without a manual "Sign
// in with Riot" click. Afterwards, run a 60s refresh loop that catches the
// ~60min access-token expiry before the user notices.
pub fn spawn_oauth_session_manager(app_handle: tauri::AppHandle, state: SharedState) {
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
                tauri::async_runtime::spawn_blocking(move || riot::validate_token(&state))
                    .await
                    .unwrap_or_else(|e| {
                        riot::logging::log_error(&format!(
                            "[OAuth-Boot] validate task failed: {}",
                            e
                        ));
                        false
                    })
            };
            if valid {
                oauth::mark_oauth_active(&state);
                riot::logging::log_info("[OAuth-Boot] session restored from keychain");
            } else {
                riot::logging::log_info("[OAuth-Boot] stored token invalid; running refresh chain");
                let _ = oauth::refresh_oauth_session(app_handle.clone(), Arc::clone(&state)).await;
            }
        }

        // Bg refresh loop. Three triggers, in priority order:
        //   1. `oauth_refresh_notify` woken by `signal_needs_refresh`
        //      from either `health_check` or a PD wrapper (#14).
        //      This is the fast path — a user click that lands on
        //      a 401 wakes the loop in <1s instead of waiting up
        //      to 60s for the next tick.
        //   2. NeedsRefresh state already set when the loop wakes
        //      (e.g., a prior signal we hadn't acted on yet).
        //   3. Token age >= 540s (pre-emptive — get ahead of the
        //      600s expiry even when nothing has signalled).
        // Skip behaviour prevents a slow rung-2 from spawning
        // catch-up ticks racing on the cookie data_dir.
        let notify = match state.lock() {
            Ok(s) => Arc::clone(&s.oauth_refresh_notify),
            Err(_) => {
                riot::logging::log_error(
                    "[OAuth-Bg] state mutex poisoned; background refresh disabled",
                );
                return;
            }
        };
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        interval.tick().await; // skip the immediate first tick
        loop {
            tokio::select! {
                _ = interval.tick() => {}
                _ = notify.notified() => {}
            }
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
                Err(_) => {
                    // A poisoned mutex never heals — stop the loop
                    // instead of silently spinning every 60s.
                    riot::logging::log_error(
                        "[OAuth-Bg] state mutex poisoned; stopping background refresh",
                    );
                    return;
                }
            };
            if !should_act {
                continue;
            }
            riot::logging::log_info(&format!("[OAuth-Bg] refreshing (token age {}s)", age));
            let _ = oauth::refresh_oauth_session(app_handle.clone(), Arc::clone(&state)).await;
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
pub fn spawn_match_db_migration(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let state = handle.state::<match_db::MatchDb>();
        match_db::migrate_from_json(&handle, &state);
    });
}

pub fn spawn_storefront_poller(app: &tauri::App) {
    let conn = Arc::clone(&app.state::<SharedState>());
    let wl = Arc::clone(&app.state::<store::WishlistShared>());
    store::spawn_storefront_poller(app.handle().clone(), conn, wl);
}
