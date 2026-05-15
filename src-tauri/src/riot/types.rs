use serde::{Deserialize, Serialize};
use std::time::Instant;

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

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            connected: false,
            port: None,
            local_auth: None,
            access_token: None,
            entitlements: None,
            puuid: None,
            region: None,
            shard: None,
            client_version: None,
            game_name: None,
            game_tag: None,
            player_card_url: None,
            token_fetched_at: None,
            last_token_check: None,
            oauth_session: false,
        }
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
