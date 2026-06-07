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
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use crate::identity_cache::{self, IdentityCache};
use crate::riot::{self, ConnectionState, OAuthState, PlayerInfo};
use crate::token_store;

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

// Silent rung-2 refresh: the persistent cookies should auto-complete the
// flow in <2s. If Riot serves the login page instead (cookies stale), we
// give up fast and fall through to rung 3.
const SILENT_REFRESH_TIMEOUT_SECS: u64 = 10;

fn auth_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    Ok(dir.join("riot-auth-webview"))
}

// Phase B fix-pass (#4): only one OAuth-flavoured webview may exist at a
// time. All three webviews (`oauth`, `oauth-cookies`, `oauth-silent`) share
// the same `data_directory`, and WebView2's backing cookie SQLite store
// does not tolerate concurrent writers — the second open either fails or
// silently corrupts the jar. This lock is the single gate that all three
// entry points pass through; `BusyGuard::drop` releases it so even a panic
// or future-cancellation in the middle of a sign-in never leaks the slot.
pub struct OAuthWebviewBusy(Arc<Mutex<Option<&'static str>>>);

impl OAuthWebviewBusy {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }

    /// Acquire the slot under `label`. Returns the holding label as Err if
    /// the slot is already taken. The returned guard releases on drop.
    pub fn try_acquire(&self, label: &'static str) -> Result<BusyGuard, &'static str> {
        let mut held = self.0.lock().map_err(|_| "lock poisoned")?;
        if let Some(existing) = *held {
            return Err(existing);
        }
        *held = Some(label);
        Ok(BusyGuard {
            slot: Arc::clone(&self.0),
        })
    }
}

pub struct BusyGuard {
    slot: Arc<Mutex<Option<&'static str>>>,
}

impl Drop for BusyGuard {
    fn drop(&mut self) {
        if let Ok(mut held) = self.slot.lock() {
            *held = None;
        }
    }
}

// Phase B fix-pass (#10): RAII close for the OAuth webviews. Without this,
// any early return / panic / future-cancellation in a rung that builds a
// webview leaves the named window alive — and rung-2 then fails forever
// with "silent refresh already running" because the slot is taken. Drop is
// best-effort; close() may fail in shutdown, which is acceptable since the
// process is going away anyway.
struct WebviewCloseGuard {
    win: Option<tauri::WebviewWindow>,
}

impl WebviewCloseGuard {
    fn new(win: tauri::WebviewWindow) -> Self {
        Self { win: Some(win) }
    }

    fn as_window(&self) -> Option<&tauri::WebviewWindow> {
        self.win.as_ref()
    }
}

impl Drop for WebviewCloseGuard {
    fn drop(&mut self) {
        if let Some(w) = self.win.take() {
            let _ = w.close();
        }
    }
}

#[tauri::command]
pub async fn oauth_signin(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<ConnectionState>>>,
    identity: tauri::State<'_, IdentityCache>,
    busy: tauri::State<'_, OAuthWebviewBusy>,
) -> Result<PlayerInfo, String> {
    // Single source of truth for "is any OAuth webview alive" — covers the
    // race where a bg-refresh's hidden 'oauth-cookies' / 'oauth-silent' is
    // active and the user clicks Sign-in in Settings. The label-check
    // alone would let two webviews attach to the same data_directory.
    let _busy_guard = busy
        .try_acquire("oauth-signin")
        .map_err(|held| format!("OAuth webview busy as '{}'", held))?;
    if app.get_webview_window("oauth").is_some() {
        return Err("Sign-in already in progress.".to_string());
    }

    let data_dir = auth_data_dir(&app)?;
    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("mkdir webview data: {}", e))?;
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

    let captured_url =
        match tokio::time::timeout(Duration::from_secs(SIGNIN_TIMEOUT_SECS), rx).await {
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
        "Riot returned an unexpected redirect format. Try again, or sign in via the Riot Client."
            .to_string()
    })?;

    let state_for_finalize = Arc::clone(&state);
    let info = tauri::async_runtime::spawn_blocking(move || {
        finalize_initial_signin(&state_for_finalize, &access_token)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    if let Err(e) = identity_cache::save(&app, &identity, &info) {
        riot::logging::log_error(&format!("[OAuth] identity_cache save failed: {}", e));
    }

    // Persist the full token blob so the next app launch can hydrate
    // ConnectionState without a manual sign-in. Best-effort — a keychain
    // failure falls through to the JSON store inside token_store::save.
    if let Ok(s) = state.lock() {
        if let Some(blob) = token_store::blob_from_state(&s) {
            if let Err(e) = token_store::save(&app, &blob) {
                riot::logging::log_error(&format!("[OAuth] token_store save failed: {}", e));
            }
        }
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

    // Wipe the persisted token blob (keychain + JSON fallback) so the next
    // boot doesn't try to silently restore the session.
    token_store::wipe(&app);

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

// Phase B fix-pass (#12): keep response bodies of auth.riotgames.com out
// of the log. The bodies CAN contain access_tokens (the happy-path 200
// shape is `{"response":{"parameters":{"uri":"...#access_token=..."}}}`),
// and `format!("...{}", txt)` ends up in `[OAuth]`-prefixed log lines that
// land on disk. Status + body length is sufficient to debug shape
// mismatches without leaking credentials.
fn safe_response_summary(prefix: &str, status: reqwest::StatusCode, body: &str) -> String {
    format!("{} (HTTP {}, {} body bytes)", prefix, status, body.len())
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

// Sync — runs inside spawn_blocking. Used by `oauth_signin` to establish a
// brand-new session: we don't yet know region/shard/version, so we read
// `ShooterGame.log` on disk (Valorant must have run at least once on this
// machine for the log to exist — same precondition the lockfile path has).
//
// The silent refresh path uses `finalize_refresh` instead, which reuses
// the region/shard/version already in `ConnectionState` and never touches
// the log. See #1 in the second-pass plan.
fn finalize_initial_signin(
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
        s.oauth_state = OAuthState::Active;
    }

    // Best-effort: pull the player card via pd_get now that ConnectionState
    // is populated. A failure here is logged but does NOT fail sign-in —
    // HomePage falls back to a placeholder card.
    let mut player_card_url: Option<String> = None;
    let loadout_path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    if let Ok(raw) = riot::pd_get(
        &shard,
        &loadout_path,
        access_token,
        &entitlements_jwt,
        &client_version,
    ) {
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

// Sync — runs inside spawn_blocking. Used by the silent refresh rungs.
// puuid/region/shard/client_version are stable across refreshes (they're
// account-bound, not token-bound), so we read them from `ConnectionState`
// instead of re-deriving from ShooterGame.log. Only `access_token` and
// `entitlements` need to roll over.
//
// We still call /userinfo as a tripwire: if the new access_token resolves
// to a different puuid than the one in state, the cookie jar belongs to a
// different account and we must abort rather than silently swap identity.
fn finalize_refresh(state: &Mutex<ConnectionState>, access_token: &str) -> Result<(), String> {
    let prior_puuid = state
        .lock()
        .map_err(|e| e.to_string())?
        .puuid
        .clone()
        .ok_or("no prior puuid in state — refresh without an active session")?;

    let client = reqwest::blocking::Client::builder()
        .user_agent(GAME_UA)
        .build()
        .map_err(|e| format!("reqwest build: {}", e))?;

    let entitlements_jwt = fetch_entitlements(&client, access_token)?;
    let (new_puuid, _name, _tag) = fetch_userinfo(&client, access_token)?;
    if new_puuid != prior_puuid {
        return Err(format!(
            "refresh produced a different puuid ({}..) than the active session ({}..); aborting",
            &new_puuid[..new_puuid.len().min(8)],
            &prior_puuid[..prior_puuid.len().min(8)]
        ));
    }

    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.connected = true;
    s.access_token = Some(access_token.to_string());
    s.entitlements = Some(entitlements_jwt);
    s.token_fetched_at = Some(Instant::now());
    // Let the next health_check independently validate. Stamping
    // last_token_check here would suppress validation for 60s.
    s.last_token_check = None;
    s.oauth_session = true;
    s.oauth_state = OAuthState::Active;
    Ok(())
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
    let body = resp
        .text()
        .map_err(|e| format!("entitlements read: {}", e))?;
    if !status.is_success() {
        return Err(format!("Entitlements call failed: HTTP {}", status));
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| format!("entitlements parse: {}", e))?;
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
    let status = resp.status();
    let body = resp.text().map_err(|e| format!("userinfo read: {}", e))?;
    if !status.is_success() {
        return Err(format!("Userinfo call failed: HTTP {}", status));
    }
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

/// Silent three-rung token refresh. Called from boot-time hydration and from
/// the background OAuth-health task. Each rung is tried in order; the first
/// to return Ok wins.
///
/// * **Rung 1** — read persistent cookies via Tauri 2's `cookies_for_url` and
///   POST `/api/v1/authorization` for a fresh access_token. Purely silent.
/// * **Rung 2** — open a hidden webview to AUTHORIZE_URL; the persistent
///   cookie jar logs the user in automatically and the redirect fires. Brief
///   wall-clock latency, no UI.
/// * **Rung 3** — wipe stored tokens + cookie jar, mark the session dead,
///   emit `oauth-needs-reauth` so the React app surfaces a re-sign-in banner.
pub async fn refresh_oauth_session(
    app: AppHandle,
    state: Arc<Mutex<ConnectionState>>,
) -> Result<(), String> {
    // Hold the webview slot for the WHOLE chain — rung-1 and rung-2 both
    // create webviews under the same data_directory, and if oauth_signin
    // (or a stacked refresh) grabbed it mid-chain we'd race the cookie jar.
    // If the slot is taken, drop the refresh attempt entirely; the bg loop
    // ticks again in 60s, and any in-flight sign-in is itself trying to
    // restore the session.
    let busy = app.state::<OAuthWebviewBusy>();
    let _busy_guard = match busy.try_acquire("oauth-refresh") {
        Ok(g) => g,
        Err(held) => {
            riot::logging::log_info(&format!(
                "[OAuth] Refresh skipped: webview busy as '{}'",
                held
            ));
            return Err(format!("OAuth webview busy as '{}'", held));
        }
    };

    riot::logging::log_info("[OAuth] Starting silent refresh chain");

    match try_rung1_cookie_refresh(&app, &state).await {
        Ok(()) => {
            riot::logging::log_info("[OAuth] Refresh succeeded via rung 1 (cookies API)");
            persist_state_token_blob(&app, &state);
            return Ok(());
        }
        Err(e) => riot::logging::log_info(&format!("[OAuth] Rung 1 failed: {}", e)),
    }

    match try_rung2_silent_webview(&app, &state).await {
        Ok(()) => {
            riot::logging::log_info("[OAuth] Refresh succeeded via rung 2 (silent webview)");
            persist_state_token_blob(&app, &state);
            return Ok(());
        }
        Err(e) => riot::logging::log_info(&format!("[OAuth] Rung 2 failed: {}", e)),
    }

    // Rung 3: terminal. Mirror oauth_signout — wipe BOTH the persisted token
    // store AND the webview cookie jar (the cookies are what caused rung-3
    // in the first place; reusing them on the next manual sign-in would just
    // loop the failure). disconnect() resets oauth_state to Inactive; we
    // then explicitly mark NeedsReauth so the React banner appears via the
    // state-poll path (the event below is a fast-path hint).
    riot::logging::log_error("[OAuth] All refresh rungs failed; user must re-sign-in");
    token_store::wipe(&app);
    if let Ok(data_dir) = auth_data_dir(&app) {
        if data_dir.exists() {
            if let Err(e) = std::fs::remove_dir_all(&data_dir) {
                riot::logging::log_error(&format!(
                    "[OAuth] rung-3 failed to wipe {}: {}",
                    data_dir.display(),
                    e
                ));
            }
        }
    }
    riot::disconnect(&state);
    if let Ok(mut s) = state.lock() {
        s.oauth_state = OAuthState::NeedsReauth;
    }
    let _ = app.emit("oauth-needs-reauth", ());
    Err("All refresh rungs failed; re-sign-in required".to_string())
}

fn persist_state_token_blob(app: &AppHandle, state: &Mutex<ConnectionState>) {
    if let Ok(s) = state.lock() {
        if let Some(blob) = token_store::blob_from_state(&s) {
            if let Err(e) = token_store::save(app, &blob) {
                riot::logging::log_error(&format!(
                    "[OAuth] post-refresh token_store save failed: {}",
                    e
                ));
            }
        }
    }
}

async fn try_rung1_cookie_refresh(
    app: &AppHandle,
    state: &Arc<Mutex<ConnectionState>>,
) -> Result<(), String> {
    let data_dir = auth_data_dir(app)?;
    if !data_dir.exists() {
        return Err("no persisted cookie jar".to_string());
    }

    // We need a webview pointed at auth.riotgames.com so its in-process
    // cookie store loads our persistent cookies. Hidden, no navigation
    // intercept — we just need the jar populated.
    let cookie_probe_url: Url = "https://auth.riotgames.com/"
        .parse()
        .map_err(|e| format!("probe url parse: {}", e))?;

    // Make sure no stale "oauth-cookies" window is lingering from a prior
    // crashed run before we try to build a new one with the same label.
    if let Some(w) = app.get_webview_window("oauth-cookies") {
        let _ = w.close();
    }

    let win = WebviewWindowBuilder::new(
        app,
        "oauth-cookies",
        WebviewUrl::External(cookie_probe_url.clone()),
    )
    .title("Refreshing Riot session")
    .inner_size(400.0, 300.0)
    .visible(false)
    .resizable(false)
    .data_directory(data_dir)
    .user_agent(WEB_UA)
    .build()
    .map_err(|e| format!("hidden webview build: {}", e))?;
    let guard = WebviewCloseGuard::new(win);

    // Give the webview a moment to load the cookie jar. The probe page may
    // 302 around, but we don't care — we just need the runtime cookie store
    // populated for this URL.
    tokio::time::sleep(Duration::from_millis(1200)).await;

    let cookies = guard
        .as_window()
        .ok_or("guard window gone")?
        .cookies_for_url(cookie_probe_url)
        .map_err(|e| format!("cookies_for_url: {}", e))?;
    drop(guard); // Explicit close; the Drop impl would also fire on early-return.

    if cookies.is_empty() {
        return Err("empty cookie jar".to_string());
    }

    // Build a Cookie header from every cookie scoped to auth.riotgames.com.
    // Riot's /api/v1/authorization expects the standard `ssid` (and friends);
    // sending the full set is safe.
    let cookie_header = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");

    // POST the standard authorization body and parse the redirect from the
    // 303 Location header. reqwest::blocking is fine inside spawn_blocking.
    let cookie_header_clone = cookie_header.clone();
    let captured = tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .user_agent(WEB_UA)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| format!("reqwest build: {}", e))?;
        let body = serde_json::json!({
            "client_id": "play-valorant-web-prod",
            "nonce": "1",
            "redirect_uri": "https://playvalorant.com/opt_in",
            "response_type": "token id_token",
            "scope": "account openid"
        });
        let resp = client
            .post("https://auth.riotgames.com/api/v1/authorization")
            .header("Cookie", cookie_header_clone)
            .header("Content-Type", "application/json")
            .body(body.to_string())
            .send()
            .map_err(|e| format!("authorization request: {}", e))?;

        // The happy path is a 303 with `Location: https://playvalorant.com/opt_in#access_token=...`.
        // Some flows return 200 with `{"type":"response","response":{"parameters":{"uri":"..."}}}`.
        if let Some(loc) = resp.headers().get("Location") {
            if let Ok(s) = loc.to_str() {
                return Ok::<String, String>(s.to_string());
            }
        }
        let status = resp.status();
        let txt = resp
            .text()
            .map_err(|e| format!("authorization read: {}", e))?;
        if !status.is_success() {
            return Err(safe_response_summary(
                "authorization request failed",
                status,
                &txt,
            ));
        }
        let v: Value =
            serde_json::from_str(&txt).map_err(|e| format!("authorization json: {}", e))?;
        if let Some(uri) = v["response"]["parameters"]["uri"].as_str() {
            return Ok(uri.to_string());
        }
        Err(safe_response_summary(
            "authorization response missing Location/uri",
            status,
            &txt,
        ))
    })
    .await
    .map_err(|e| format!("rung1 task join: {}", e))??;

    let (access_token, _id) = parse_tokens_from_redirect(&captured)
        .ok_or_else(|| "could not parse access_token from authorization response".to_string())?;

    // Finalize: refresh path reuses puuid/region/shard/client_version from
    // ConnectionState — never reads ShooterGame.log. The userinfo call
    // inside also serves as an identity tripwire (#1).
    let state_for_finalize = Arc::clone(state);
    tauri::async_runtime::spawn_blocking(move || {
        finalize_refresh(&state_for_finalize, &access_token)
    })
    .await
    .map_err(|e| format!("rung1 finalize join: {}", e))??;

    Ok(())
}

async fn try_rung2_silent_webview(
    app: &AppHandle,
    state: &Arc<Mutex<ConnectionState>>,
) -> Result<(), String> {
    // Mirror rung-1's stale-window cleanup: a leaked "oauth-silent" from a
    // prior process state would otherwise wedge every future refresh. The
    // top-of-chain BusyGuard prevents concurrent refresh attempts, so this
    // cleanup is purely for cross-process / crash recovery.
    if let Some(w) = app.get_webview_window("oauth-silent") {
        let _ = w.close();
    }

    let data_dir = auth_data_dir(app)?;
    if !data_dir.exists() {
        return Err("no persisted cookie jar".to_string());
    }

    let authorize_url: Url = AUTHORIZE_URL
        .parse()
        .map_err(|e| format!("authorize url parse: {}", e))?;

    let (tx, rx) = oneshot::channel::<String>();
    let tx_slot = Arc::new(Mutex::new(Some(tx)));
    let tx_for_nav = Arc::clone(&tx_slot);
    let tx_for_close = Arc::clone(&tx_slot);

    let win = WebviewWindowBuilder::new(app, "oauth-silent", WebviewUrl::External(authorize_url))
        .title("Refreshing Riot session")
        .inner_size(500.0, 700.0)
        .visible(false)
        .resizable(false)
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
                return false;
            }
            true
        })
        .build()
        .map_err(|e| format!("silent webview build: {}", e))?;
    let guard = WebviewCloseGuard::new(win);

    if let Some(w) = guard.as_window() {
        w.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Ok(mut g) = tx_for_close.lock() {
                    g.take();
                }
            }
        });
    }

    // Phase B fix-pass (#8): show-on-stall. The common case (valid cookies)
    // produces a redirect well under a second — the user sees nothing.
    // But if Riot serves an interstitial (GDPR consent refresh, anti-bot
    // challenge, regional re-attestation) the redirect never fires and
    // `.visible(false)` would hide the prompt from the user, causing
    // rung-2 to time out and rung-3 to wipe a perfectly valid session.
    // After 3s of no redirect, reveal the webview so the user can engage.
    let app_for_watcher = app.clone();
    let tx_for_watcher = Arc::clone(&tx_slot);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(3)).await;
        let still_pending = tx_for_watcher.lock().map(|g| g.is_some()).unwrap_or(false);
        if !still_pending {
            return;
        }
        if let Some(w) = app_for_watcher.get_webview_window("oauth-silent") {
            let _ = w.show();
            let _ = w.set_focus();
            riot::logging::log_info(
                "[OAuth] rung-2 stalled past 3s; revealing webview for user interaction",
            );
        }
    });

    let captured_url =
        match tokio::time::timeout(Duration::from_secs(SILENT_REFRESH_TIMEOUT_SECS), rx).await {
            Ok(Ok(url)) => url,
            Ok(Err(_)) => {
                drop(guard);
                return Err("silent webview cancelled".to_string());
            }
            Err(_) => {
                drop(guard);
                return Err(format!(
                    "silent refresh timed out after {}s (cookies likely stale)",
                    SILENT_REFRESH_TIMEOUT_SECS
                ));
            }
        };
    drop(guard);

    let (access_token, _id) = parse_tokens_from_redirect(&captured_url)
        .ok_or_else(|| "could not parse access_token from silent redirect".to_string())?;

    let state_for_finalize = Arc::clone(state);
    tauri::async_runtime::spawn_blocking(move || {
        finalize_refresh(&state_for_finalize, &access_token)
    })
    .await
    .map_err(|e| format!("rung2 finalize join: {}", e))??;

    Ok(())
}

/// Populate `ConnectionState` with the data fields from a persisted token
/// blob at boot. **Does NOT mark the session connected** — that's
/// `mark_oauth_active`'s job, called only after `validate_token` (or the
/// refresh chain) succeeds. The intermediate state is `OAuthState::Hydrating`:
/// commands that check `connected` see false and don't fire against a
/// possibly-expired access_token, but the data is there for the validate
/// probe to use. See #7 + #13 in the second-pass plan.
pub fn populate_from_blob(state: &Mutex<ConnectionState>, blob: &token_store::TokenBlob) {
    if let Ok(mut s) = state.lock() {
        s.connected = false;
        s.port = None;
        s.local_auth = None;
        s.access_token = Some(blob.access_token.clone());
        s.entitlements = Some(blob.entitlements.clone());
        s.puuid = Some(blob.puuid.clone());
        s.region = Some(blob.region.clone());
        s.shard = Some(blob.shard.clone());
        s.client_version = Some(blob.client_version.clone());
        s.game_name = Some(blob.game_name.clone());
        s.game_tag = Some(blob.game_tag.clone());
        s.player_card_url = blob.player_card_url.clone();
        s.token_fetched_at = Some(Instant::now());
        // Deliberately NOT setting last_token_check — let the first
        // health_check / boot-task validate run unsuppressed.
        s.last_token_check = None;
        s.oauth_session = true;
        s.oauth_state = OAuthState::Hydrating;
    }
}

/// Flip a hydrated session live after a successful `validate_token`. The
/// only legal transition into `OAuthState::Active` from `Hydrating`.
pub fn mark_oauth_active(state: &Mutex<ConnectionState>) {
    if let Ok(mut s) = state.lock() {
        s.connected = true;
        s.oauth_session = true;
        s.oauth_state = OAuthState::Active;
    }
}

fn fetch_client_version_fallback(client: &reqwest::blocking::Client) -> Result<String, String> {
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
