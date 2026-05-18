// Phase A of #18 — persists last-seen PlayerInfo so the home page and
// other identity-keyed UI keep working when Valorant is closed.
// Storage/persistence inherited from value_cache::Cache.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::riot::PlayerInfo;
use crate::util::now_ms;
use crate::value_cache::Cache;

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct IdentitySnapshot {
    pub puuid: String,
    pub game_name: String,
    pub game_tag: String,
    pub region: String,
    pub shard: String,
    pub client_version: String,
    pub player_card_url: Option<String>,
    /// Wall-clock millis when this snapshot was last refreshed by a live
    /// connect.
    pub saved_at_ms: i64,
}

pub type IdentityCache = Cache<Option<IdentitySnapshot>>;

pub fn new_cache() -> IdentityCache {
    Cache::new("identity.json", "[IdentityCache]")
}

/// Save a fresh PlayerInfo snapshot. Called from connect_and_store after a
/// successful live connect.
pub fn save(app: &AppHandle, cache: &IdentityCache, info: &PlayerInfo) -> Result<(), String> {
    let snap = IdentitySnapshot {
        puuid: info.puuid.clone(),
        game_name: info.game_name.clone(),
        game_tag: info.game_tag.clone(),
        region: info.region.clone(),
        shard: info.shard.clone(),
        client_version: info.client_version.clone(),
        player_card_url: info.player_card_url.clone(),
        saved_at_ms: now_ms(),
    };
    cache.write(app, |slot| {
        *slot = Some(snap);
        ((), true)
    })
}

#[tauri::command]
pub async fn get_cached_identity(
    app: AppHandle,
    cache: tauri::State<'_, IdentityCache>,
) -> Result<Option<IdentitySnapshot>, String> {
    cache.read(&app, |slot| slot.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_roundtrips_through_serde() {
        let snap = IdentitySnapshot {
            puuid: "abc".into(),
            game_name: "Player".into(),
            game_tag: "1234".into(),
            region: "na".into(),
            shard: "na".into(),
            client_version: "1.0".into(),
            player_card_url: Some("https://example/card.png".into()),
            saved_at_ms: 1_700_000_000_000,
        };
        let s = serde_json::to_string(&snap).unwrap();
        let back: IdentitySnapshot = serde_json::from_str(&s).unwrap();
        assert_eq!(back.puuid, "abc");
        assert_eq!(back.saved_at_ms, 1_700_000_000_000);
    }
}
