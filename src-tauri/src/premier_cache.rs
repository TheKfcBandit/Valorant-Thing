// Phase A of #18, extended for #23 — persists the last good Premier
// roster / division / conference responses so the Premier tab can render
// when Valorant is closed. Storage/persistence inherited from
// value_cache::Cache.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::util::now_ms;
use crate::value_cache::Cache;

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct PremierSnapshot {
    /// Raw JSON string returned by `get_premier_player` (already normalized
    /// into the `{ enrolled, team, raw }` envelope by the Rust side).
    pub player: String,
    /// Raw response body for `/premier/v1/divisions/{id}`. Empty when the
    /// user isn't on a team (no division to look up).
    pub division: String,
    /// Raw response body for `/premier/v1/conferences/{id}`.
    pub conference: String,
    /// Wall-clock millis when this snapshot was last refreshed by a live fetch.
    pub saved_at_ms: i64,
}

pub type PremierCache = Cache<Option<PremierSnapshot>>;

pub fn new_cache() -> PremierCache {
    Cache::new("premier.json", "[PremierCache]")
}

/// Save a fresh Premier snapshot. Returns `Err` on disk failure; callers
/// should treat the write as best-effort and log-and-swallow rather than
/// propagating to the frontend (see `cache_premier_bundle` in lib.rs).
pub fn save(
    app: &AppHandle,
    cache: &PremierCache,
    player: String,
    division: String,
    conference: String,
) -> Result<(), String> {
    let snap = PremierSnapshot {
        player,
        division,
        conference,
        saved_at_ms: now_ms(),
    };
    cache.write(app, |slot| {
        *slot = Some(snap);
        ((), true)
    })
}

#[tauri::command]
pub async fn get_cached_premier(
    app: AppHandle,
    cache: tauri::State<'_, PremierCache>,
) -> Result<Option<PremierSnapshot>, String> {
    cache.read(&app, |slot| slot.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_roundtrips_through_serde() {
        let snap = PremierSnapshot {
            player: r#"{"enrolled":true}"#.into(),
            division: r#"{"standings":[]}"#.into(),
            conference: r#"{"matches":[]}"#.into(),
            saved_at_ms: 1_700_000_000_000,
        };
        let s = serde_json::to_string(&snap).unwrap();
        let back: PremierSnapshot = serde_json::from_str(&s).unwrap();
        assert_eq!(back.player, r#"{"enrolled":true}"#);
        assert_eq!(back.saved_at_ms, 1_700_000_000_000);
    }
}
