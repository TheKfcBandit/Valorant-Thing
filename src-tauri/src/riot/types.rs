use serde::{Deserialize, Serialize};
use std::time::Instant;

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
