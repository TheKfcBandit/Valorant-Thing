// Phase B (#26) — webview OAuth for live offline mode.
//
// Pops a Tauri webview to https://auth.riotgames.com/login, intercepts the
// redirect to playvalorant.com/opt_in#access_token=..., uses that token to
// populate ConnectionState the same way connect_and_store does after reading
// the local lockfile. Cookies persist in the webview's own data directory so
// subsequent sign-ins are click-through without a password prompt.
//
// This is the B-fallback rung (per #26 spec): no OS keychain, no background
// token refresh, no HttpOnly cookie extraction. Token lives ~60min; when it
// expires the user clicks "Sign in with Riot" again and the persistent cookie
// jar carries the session.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use crate::identity_cache::{self, IdentityCacheState};
use crate::riot::{self, ConnectionState, PlayerInfo};

const AUTHORIZE_URL: &str = "https://auth.riotgames.com/authorize\
    ?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in\
    &client_id=play-valorant-web-prod\
    &response_type=token%20id_token\
    &nonce=1\
    &scope=account%20openid";

const REDIRECT_PREFIX: &str = "https://playvalorant.com/opt_in";

// Match what a real browser sends — auth.riotgames.com sometimes serves
// different login flows to non-browser UAs.
const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                      (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Userinfo / pd headers use the in-game UA, same as the existing pd_get pipe.
const GAME_UA: &str = "ShooterGame/13 Windows/10.0.19042.1.256.64bit";

const SIGNIN_TIMEOUT_SECS: u64 = 300;

fn auth_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    Ok(dir.join("riot-auth-webview"))
}

#[tauri::command]
pub async fn oauth_signin(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<ConnectionState>>>,
    identity: tauri::State<'_, Mutex<IdentityCacheState>>,
) -> Result<PlayerInfo, String> {
    if app.get_webview_window("oauth").is_some() {
        return Err("Sign-in already in progress.".to_string());
    }

    let data_dir = auth_data_dir(&app)?;
    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("mkdir webview data: {}", e))?;
    }

    let authorize_url: Url = AUTHORIZE_URL
        .parse()
        .map_err(|e| format!("authorize url parse: {}", e))?;

    let (tx, rx) = oneshot::channel::<String>();
    let tx_slot = Arc::new(Mutex::new(Some(tx)));
    let tx_for_nav = Arc::clone(&tx_slot);
    let tx_for_close = Arc::clone(&tx_slot);

    let win = WebviewWindowBuilder::new(&app, "oauth", WebviewUrl::External(authorize_url))
        .title("Sign in with Riot")
        .inner_size(500.0, 700.0)
        .resizable(true)
        .data_directory(data_dir)
        .user_agent(WEB_UA)
        .on_navigation(move |url| {
            let s = url.as_str();
            if s.starts_with(REDIRECT_PREFIX) {
                if let Ok(mut guard) = tx_for_nav.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(s.to_string());
                    }
                }
                // Block the navigation — playvalorant.com/opt_in is just a
                // landing page that confirms the redirect happened; we don't
                // need it to load.
                return false;
            }
            true
        })
        .build()
        .map_err(|e| format!("webview build: {}", e))?;

    // Drop the sender on manual close so rx resolves immediately to
    // "Sign-in cancelled." instead of waiting out SIGNIN_TIMEOUT_SECS.
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if let Ok(mut guard) = tx_for_close.lock() {
                guard.take();
            }
        }
    });

    let captured_url = match tokio::time::timeout(
        Duration::from_secs(SIGNIN_TIMEOUT_SECS),
        rx,
    )
    .await
    {
        Ok(Ok(url)) => url,
        Ok(Err(_)) => {
            // Sender dropped — user closed the webview without completing.
            let _ = win.close();
            return Err("Sign-in cancelled.".to_string());
        }
        Err(_) => {
            let _ = win.close();
            return Err("Sign-in timed out.".to_string());
        }
    };
    let _ = win.close();

    let (access_token, _id_token) = parse_tokens_from_redirect(&captured_url).ok_or_else(|| {
        riot::logging::log_error(&format!(
            "[OAuth] Could not parse tokens from redirect URL (length={})",
            captured_url.len()
        ));
        "Riot returned an unexpected redirect format. Try again, or sign in via the Riot Client.".to_string()
    })?;

    let state_for_finalize = Arc::clone(&state);
    let info = tauri::async_runtime::spawn_blocking(move || {
        finalize_oauth_session(&state_for_finalize, &access_token)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    if let Err(e) = identity_cache::save(&app, &identity, &info) {
        riot::logging::log_error(&format!("[OAuth] identity_cache save failed: {}", e));
    }
    Ok(info)
}

#[tauri::command]
pub async fn oauth_signout(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<ConnectionState>>>,
) -> Result<(), String> {
    let state_clone = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::disconnect(&state_clone))
        .await
        .map_err(|e| format!("Task failed: {}", e))?;

    // Nuke the persisted cookie jar so the next sign-in prompts for a password.
    let data_dir = auth_data_dir(&app)?;
    if data_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&data_dir) {
            riot::logging::log_error(&format!(
                "[OAuth] failed to wipe {}: {}",
                data_dir.display(),
                e
            ));
        }
    }
    Ok(())
}

// Riot's standard redirect is `#access_token=...&id_token=...&...`. Some
// hardened paths use `?access_token=...`; we accept both. JWT chars are
// base64url (A-Za-z0-9-_) so no percent-decoding is required.
fn parse_tokens_from_redirect(url: &str) -> Option<(String, Option<String>)> {
    let body = if let Some(idx) = url.find('#') {
        &url[idx + 1..]
    } else if let Some(idx) = url.find('?') {
        &url[idx + 1..]
    } else {
        return None;
    };
    let mut access: Option<String> = None;
    let mut id: Option<String> = None;
    for pair in body.split('&') {
        let mut it = pair.splitn(2, '=');
        let k = it.next()?;
        let v = it.next().unwrap_or("");
        match k {
            "access_token" => access = Some(v.to_string()),
            "id_token" => id = Some(v.to_string()),
            _ => {}
        }
    }
    access.map(|a| (a, id))
}

// Sync — runs inside spawn_blocking. Reuses the same downstream calls as
// connect_and_store after the access_token / entitlements_jwt are in hand;
// region/version come from ShooterGame.log on disk (no Valorant required).
fn finalize_oauth_session(
    state: &Mutex<ConnectionState>,
    access_token: &str,
) -> Result<PlayerInfo, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(GAME_UA)
        .build()
        .map_err(|e| format!("reqwest build: {}", e))?;

    let entitlements_jwt = fetch_entitlements(&client, access_token)?;
    let (puuid, game_name, game_tag) = fetch_userinfo(&client, access_token)?;
    let (region, shard) = riot::parse_region_shard()?;
    let client_version = riot::parse_client_version().unwrap_or_else(|_| {
        fetch_client_version_fallback(&client).unwrap_or_else(|_| "unknown".to_string())
    });

    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.connected = true;
        s.port = None;
        s.local_auth = None;
        s.access_token = Some(access_token.to_string());
        s.entitlements = Some(entitlements_jwt.clone());
        s.puuid = Some(puuid.clone());
        s.region = Some(region.clone());
        s.shard = Some(shard.clone());
        s.client_version = Some(client_version.clone());
        s.game_name = Some(game_name.clone());
        s.game_tag = Some(game_tag.clone());
        s.player_card_url = None;
        s.token_fetched_at = Some(Instant::now());
        s.last_token_check = Some(Instant::now());
        s.oauth_session = true;
    }

    // Best-effort: pull the player card via pd_get now that ConnectionState
    // is populated. A failure here is logged but does NOT fail sign-in —
    // HomePage falls back to a placeholder card.
    let mut player_card_url: Option<String> = None;
    let loadout_path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    if let Ok(raw) = riot::pd_get(&shard, &loadout_path, access_token, &entitlements_jwt, &client_version) {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if let Some(card_id) = v["Identity"]["PlayerCardID"].as_str() {
                let url = format!(
                    "https://media.valorant-api.com/playercards/{}/smallart.png",
                    card_id
                );
                if let Ok(mut s) = state.lock() {
                    s.player_card_url = Some(url.clone());
                }
                player_card_url = Some(url);
            }
        }
    }

    Ok(PlayerInfo {
        puuid,
        game_name,
        game_tag,
        region,
        shard,
        client_version,
        player_card_url,
        rso_debug: None,
        loadout_debug: None,
        oauth_session: true,
    })
}

fn fetch_entitlements(
    client: &reqwest::blocking::Client,
    access_token: &str,
) -> Result<String, String> {
    let resp = client
        .post("https://entitlements.auth.riotgames.com/api/token/v1")
        .bearer_auth(access_token)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .map_err(|e| format!("entitlements request: {}", e))?;
    let status = resp.status();
    let body = resp.text().map_err(|e| format!("entitlements read: {}", e))?;
    if !status.is_success() {
        return Err(format!("Entitlements call failed: HTTP {}", status));
    }
    let v: Value =
        serde_json::from_str(&body).map_err(|e| format!("entitlements parse: {}", e))?;
    v["entitlements_token"]
        .as_str()
        .ok_or("No entitlements_token in response".to_string())
        .map(|s| s.to_string())
}

fn fetch_userinfo(
    client: &reqwest::blocking::Client,
    access_token: &str,
) -> Result<(String, String, String), String> {
    let resp = client
        .get("https://auth.riotgames.com/userinfo")
        .bearer_auth(access_token)
        .send()
        .map_err(|e| format!("userinfo request: {}", e))?;
    let body = resp.text().map_err(|e| format!("userinfo read: {}", e))?;
    let v: Value = serde_json::from_str(&body).map_err(|e| format!("userinfo parse: {}", e))?;
    let puuid = v["sub"]
        .as_str()
        .ok_or("No sub/puuid in userinfo")?
        .to_string();
    let game_name = v["acct"]["game_name"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("Unknown")
        .to_string();
    let game_tag = v["acct"]["tag_line"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("0000")
        .to_string();
    Ok((puuid, game_name, game_tag))
}

fn fetch_client_version_fallback(
    client: &reqwest::blocking::Client,
) -> Result<String, String> {
    let body = client
        .get("https://valorant-api.com/v1/version")
        .send()
        .map_err(|e| format!("version request: {}", e))?
        .text()
        .map_err(|e| format!("version read: {}", e))?;
    let clean = body.trim().trim_end_matches('\0');
    let v: Value = serde_json::from_str(clean).map_err(|e| format!("version parse: {}", e))?;
    Ok(v["data"]["riotClientVersion"]
        .as_str()
        .unwrap_or("unknown")
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fragment_redirect() {
        let url = "https://playvalorant.com/opt_in#access_token=ABC.def-ghi_123&scope=account%20openid&id_token=XYZ.qrs&token_type=Bearer&expires_in=3600";
        let (a, i) = parse_tokens_from_redirect(url).expect("should parse");
        assert_eq!(a, "ABC.def-ghi_123");
        assert_eq!(i.as_deref(), Some("XYZ.qrs"));
    }

    #[test]
    fn parses_query_redirect() {
        let url = "https://playvalorant.com/opt_in?access_token=AAA&id_token=BBB";
        let (a, i) = parse_tokens_from_redirect(url).expect("should parse");
        assert_eq!(a, "AAA");
        assert_eq!(i.as_deref(), Some("BBB"));
    }

    #[test]
    fn returns_none_when_no_access_token() {
        let url = "https://playvalorant.com/opt_in#scope=account&token_type=Bearer";
        assert!(parse_tokens_from_redirect(url).is_none());
    }

    #[test]
    fn missing_id_token_is_ok() {
        let url = "https://playvalorant.com/opt_in#access_token=ONLY";
        let (a, i) = parse_tokens_from_redirect(url).expect("should parse");
        assert_eq!(a, "ONLY");
        assert!(i.is_none());
    }
}
