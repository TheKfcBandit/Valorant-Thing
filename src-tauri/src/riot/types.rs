use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Notify;

// Phase B (#26): the lifecycle of an OAuth-backed session. Exposed to the
// frontend via `get_oauth_state` so the re-auth banner is driven by state
// (canonical) rather than relying on the `oauth-needs-reauth` event reaching
// a mounted listener (the event is a fast-path hint, not the truth).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OAuthState {
    /// No OAuth session ever established (or signed out).
    #[default]
    Inactive,
    /// Tokens were loaded from the keychain but `validate_token` hasn't
    /// finished yet. `connected` stays false during this window so commands
    /// don't fire against a possibly-stale token.
    Hydrating,
    /// Validated and live.
    Active,
    /// `health_check` saw a validate failure mid-session; the bg refresh
    /// loop picks this up on its next tick and runs the silent chain.
    /// Internal — the frontend banner ignores this and waits for a final
    /// transition to either Active (success) or NeedsReauth (rung-3 fail).
    NeedsRefresh,
    /// All three refresh rungs failed. The frontend shows the banner.
    NeedsReauth,
}

#[derive(Default)]
pub struct ConnectionState {
    pub connected: bool,
    pub port: Option<u16>,
    pub local_auth: Option<String>,
    pub access_token: Option<String>,
    pub entitlements: Option<String>,
    pub puuid: Option<String>,
    pub region: Option<String>,
    pub shard: Option<String>,
    pub client_version: Option<String>,
    pub game_name: Option<String>,
    pub game_tag: Option<String>,
    pub player_card_url: Option<String>,
    pub token_fetched_at: Option<Instant>,
    pub last_token_check: Option<Instant>,
    // Phase B (#26): true when the active session came from the webview OAuth
    // flow rather than from the local Riot Client lockfile. Drives Settings
    // UI state and tells health_check to skip the lockfile-based refresh path.
    pub oauth_session: bool,
    // Phase B fix-pass: single source of truth for the OAuth lifecycle.
    // `health_check` sets this to NeedsRefresh on validate-fail; the bg
    // refresh loop watches for that and triggers the silent chain on the
    // next tick. `oauth_session` stays as a back-compat boolean.
    pub oauth_state: OAuthState,
    // #14: wakes the bg refresh loop the moment a PD wrapper (or
    // `health_check`) detects a stale token, instead of leaving the loop
    // to discover it on its next 60s tick. Without this, a worst-case
    // user click can sit on "Refreshing session…" for the full interval.
    // Cloned at bg-loop start so the loop can `notified().await` without
    // holding the ConnectionState lock.
    pub oauth_refresh_notify: Arc<Notify>,
}

impl ConnectionState {
    /// Flip the OAuth state to `NeedsRefresh` and wake the bg refresh
    /// loop. Idempotent — if the loop is mid-refresh and the state has
    /// already moved past NeedsRefresh, the notify is a no-op until
    /// somebody awaits it again. Never downgrades a sticky NeedsReauth
    /// (rung-3 already failed; the user needs the banner).
    pub fn signal_needs_refresh(&mut self) {
        if self.oauth_state != OAuthState::NeedsReauth {
            self.oauth_state = OAuthState::NeedsRefresh;
        }
        self.oauth_refresh_notify.notify_one();
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PlayerInfo {
    pub puuid: String,
    pub game_name: String,
    pub game_tag: String,
    pub region: String,
    pub shard: String,
    pub client_version: String,
    pub player_card_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rso_debug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loadout_debug: Option<String>,
    #[serde(default)]
    pub oauth_session: bool,
}
