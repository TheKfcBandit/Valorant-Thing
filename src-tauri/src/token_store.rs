// OS-keychain-backed persistence of the OAuth session token blob, with a
// JSON-file fallback for keychain failures (Win11 corporate-managed machines
// occasionally lock out the credential store). Lets the app re-hydrate
// `ConnectionState` at boot so Home/Store/Wrapped render live data without
// Valorant running and without making the user click "Sign in with Riot"
// every launch.
//
// On rung-3 fallback (token expired AND silent refresh failed both rungs),
// the caller wipes both stores so the next sign-in is a real password prompt.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::riot::logging::{log_error, log_info};
use crate::util::cache_path;

const SERVICE: &str = "valorant-thing";
const KEY: &str = "riot-oauth-blob";
const FALLBACK_FILE: &str = "token-store.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBlob {
    pub access_token: String,
    pub entitlements: String,
    pub puuid: String,
    pub region: String,
    pub shard: String,
    pub client_version: String,
    pub game_name: String,
    pub game_tag: String,
    pub player_card_url: Option<String>,
    pub saved_at_ms: u64,
    // Cookie header for auth.riotgames.com (ssid + friends). WebView2 drops
    // these session cookies on process exit, so the keychain blob is the
    // only place they survive a restart; the boot refresh chain replays
    // them when the on-disk jar is empty. serde(default) keeps pre-field
    // blobs loading.
    #[serde(default)]
    pub auth_cookies: Option<String>,
}

fn fallback_path(app: &AppHandle) -> Result<PathBuf, String> {
    cache_path(app, FALLBACK_FILE)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn save(app: &AppHandle, blob: &TokenBlob) -> Result<(), String> {
    let json = serde_json::to_string(blob).map_err(|e| format!("serialize: {}", e))?;

    // Invariant: at most one store holds a value at any moment. Wipe the
    // fallback FIRST so a crash between the two writes can never leave a
    // stale fallback shadowing a fresh keychain entry.
    if let Ok(path) = fallback_path(app) {
        if path.exists() {
            if let Err(e) = std::fs::remove_file(&path) {
                log_error(&format!(
                    "[TokenStore] pre-save fallback wipe failed: {}",
                    e
                ));
            }
        }
    }

    // Primary: OS keychain.
    match keyring::Entry::new(SERVICE, KEY) {
        Ok(entry) => match entry.set_password(&json) {
            Ok(()) => {
                log_info("[TokenStore] saved to keychain");
                return Ok(());
            }
            Err(e) => log_error(&format!(
                "[TokenStore] keychain set failed, using JSON fallback: {}",
                e
            )),
        },
        Err(e) => log_error(&format!(
            "[TokenStore] keychain unavailable, using JSON fallback: {}",
            e
        )),
    }

    // Fallback: atomic-rename JSON write. Same pattern as value_cache.rs.
    let path = fallback_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, &json).map_err(|e| format!("fallback write: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("fallback rename: {}", e))?;
    log_info("[TokenStore] saved to JSON fallback");
    Ok(())
}

pub fn load(app: &AppHandle) -> Option<TokenBlob> {
    // Primary: keychain.
    if let Ok(entry) = keyring::Entry::new(SERVICE, KEY) {
        if let Ok(json) = entry.get_password() {
            match serde_json::from_str::<TokenBlob>(&json) {
                Ok(blob) => {
                    log_info("[TokenStore] loaded from keychain");
                    return Some(blob);
                }
                Err(e) => log_error(&format!(
                    "[TokenStore] keychain payload parse failed: {}",
                    e
                )),
            }
        }
    }

    // Fallback.
    let path = match fallback_path(app) {
        Ok(p) => p,
        Err(_) => return None,
    };
    if !path.exists() {
        return None;
    }
    match std::fs::read_to_string(&path) {
        Ok(json) => match serde_json::from_str::<TokenBlob>(&json) {
            Ok(blob) => {
                log_info("[TokenStore] loaded from JSON fallback");
                Some(blob)
            }
            Err(e) => {
                // Corrupt-file rescue: quarantine and continue empty. Same
                // shape as value_cache.rs's rescue path.
                let corrupt = path.with_extension(format!("json.corrupt-{}", now_ms() / 1000));
                let _ = std::fs::rename(&path, &corrupt);
                log_error(&format!(
                    "[TokenStore] fallback parse failed ({}); quarantined",
                    e
                ));
                None
            }
        },
        Err(e) => {
            log_error(&format!("[TokenStore] fallback read failed: {}", e));
            None
        }
    }
}

pub fn wipe(app: &AppHandle) {
    if let Ok(entry) = keyring::Entry::new(SERVICE, KEY) {
        // NoEntry is the success case for a wipe-on-signout (nothing to
        // delete). Every other variant — PlatformFailure, NoStorageAccess,
        // PermissionDenied via the OS — is a real failure that the
        // previous swallow-all path hid: a successful-looking signout
        // could leave creds in the keychain, and the next launch would
        // silently re-hydrate the session the user thought they'd logged
        // out of. Match-and-log so real failures appear in the logs.
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => log_error(&format!("[TokenStore] keychain wipe failed: {}", e)),
        }
    }
    if let Ok(path) = fallback_path(app) {
        if path.exists() {
            if let Err(e) = std::fs::remove_file(&path) {
                log_error(&format!("[TokenStore] fallback remove failed: {}", e));
            }
        }
    }
    log_info("[TokenStore] wiped");
}

pub fn blob_from_state(s: &crate::riot::ConnectionState) -> Option<TokenBlob> {
    Some(TokenBlob {
        access_token: s.access_token.clone()?,
        entitlements: s.entitlements.clone()?,
        puuid: s.puuid.clone()?,
        region: s.region.clone()?,
        shard: s.shard.clone()?,
        client_version: s.client_version.clone()?,
        game_name: s.game_name.clone()?,
        game_tag: s.game_tag.clone()?,
        player_card_url: s.player_card_url.clone(),
        saved_at_ms: now_ms(),
        auth_cookies: s.auth_cookies.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::riot::ConnectionState;

    fn full_state() -> ConnectionState {
        ConnectionState {
            access_token: Some("at".into()),
            entitlements: Some("ent".into()),
            puuid: Some("puuid-1".into()),
            region: Some("na".into()),
            shard: Some("na".into()),
            client_version: Some("release-09".into()),
            game_name: Some("Name".into()),
            game_tag: Some("TAG".into()),
            player_card_url: Some("https://x/card.png".into()),
            auth_cookies: Some("ssid=abc; clid=ue1".into()),
            ..ConnectionState::default()
        }
    }

    #[test]
    fn blob_from_state_builds_from_complete_state() {
        let blob = blob_from_state(&full_state()).expect("complete state must yield a blob");
        assert_eq!(blob.access_token, "at");
        assert_eq!(blob.puuid, "puuid-1");
        assert_eq!(blob.player_card_url.as_deref(), Some("https://x/card.png"));
        assert!(blob.saved_at_ms > 0);
    }

    #[test]
    fn blob_from_state_requires_every_token_field() {
        let mutations: [fn(&mut ConnectionState); 8] = [
            |s| s.access_token = None,
            |s| s.entitlements = None,
            |s| s.puuid = None,
            |s| s.region = None,
            |s| s.shard = None,
            |s| s.client_version = None,
            |s| s.game_name = None,
            |s| s.game_tag = None,
        ];
        for mutate in mutations {
            let mut s = full_state();
            mutate(&mut s);
            assert!(blob_from_state(&s).is_none());
        }
    }

    #[test]
    fn blob_from_state_allows_missing_card_url() {
        let mut s = full_state();
        s.player_card_url = None;
        let blob = blob_from_state(&s).expect("card url is optional");
        assert!(blob.player_card_url.is_none());
    }

    #[test]
    fn token_blob_serde_roundtrip_preserves_fields() {
        let blob = blob_from_state(&full_state()).unwrap();
        let json = serde_json::to_string(&blob).unwrap();
        let back: TokenBlob = serde_json::from_str(&json).unwrap();
        assert_eq!(back.access_token, blob.access_token);
        assert_eq!(back.entitlements, blob.entitlements);
        assert_eq!(back.game_tag, blob.game_tag);
        assert_eq!(back.saved_at_ms, blob.saved_at_ms);
        assert_eq!(back.auth_cookies.as_deref(), Some("ssid=abc; clid=ue1"));
    }

    #[test]
    fn token_blob_without_auth_cookies_field_still_parses() {
        // Blobs persisted before the cookie-persistence fix lack the field;
        // serde(default) must keep them loading (None) instead of logging
        // the user out with a parse failure.
        let legacy = r#"{
            "access_token": "at", "entitlements": "ent", "puuid": "p",
            "region": "na", "shard": "na", "client_version": "v",
            "game_name": "n", "game_tag": "t",
            "player_card_url": null, "saved_at_ms": 1
        }"#;
        let blob: TokenBlob = serde_json::from_str(legacy).expect("legacy blob must parse");
        assert!(blob.auth_cookies.is_none());
    }
}
