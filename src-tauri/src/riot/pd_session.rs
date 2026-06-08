// Session-aware PD HTTP wrappers (#14). Closes the gap between #26's 60s
// background refresh loop and a user action that lands on a stale token in
// the middle of that gap.
//
// Pattern:
//   1. Read creds via `get_glz_creds` (drops the lock immediately).
//   2. Hit the raw HTTP layer in `pd_raw`, which surfaces the response status.
//   3. On 401/403:
//      - lockfile mode  → call `refresh_tokens` inline, retry once.
//      - OAuth   mode   → flip `oauth_state = NeedsRefresh` so the bg loop
//                         picks up the refresh on its next tick, and return
//                         the `AUTH_REFRESHING` sentinel. The frontend
//                         treats that sentinel as transient.
//
// Tests: `try_pd_with_refresh` is generic over an `attempt` closure so the
// retry/refresh decision logic can be unit-tested with a scripted backend
// without spawning Node or hitting Riot.

use std::sync::Mutex;

use super::auth::get_glz_creds;
use super::connection::refresh_tokens;
use super::logging::log_info;
use super::pd_raw::{pd_get_raw, pd_post_raw, pd_put_raw};
use super::types::ConnectionState;

/// Sentinel returned to the frontend when an OAuth-mode PD call hit 401/403
/// and the background refresh loop has been signalled. Callers should treat
/// it as transient and retry on the next health tick. The exact string is
/// the contract with the future `isTransientAuthError` helper in the
/// frontend — do NOT rename without a coordinated frontend change.
///
/// Altitude follow-up: a typed `AppError::TransientAuth` variant serialized
/// via `#[serde(tag = "kind")]` would let the type system enforce this
/// contract instead of a stringly-typed sentinel. Out of scope for #14;
/// every wrapped Tauri command would need to switch error type.
pub const AUTH_REFRESHING: &str = "AUTH_REFRESHING";

fn is_auth_status(status: u16) -> bool {
    // 403 covers entitlements-JWT expiry; 401 covers access-token expiry.
    // Both indicate the credentials are stale and a refresh would help.
    status == 401 || status == 403
}

fn finalize(path: &str, status: u16, body: String) -> Result<String, String> {
    if (200..300).contains(&status) {
        // 204 No Content is a legitimate empty-body success for PUTs and
        // settings ACKs — the loadout-save / name-service / future
        // player-settings write surfaces depend on this. Only treat an
        // empty body as an error on 200, where the call expected JSON
        // back.
        if status != 204 && body.is_empty() {
            return Err(format!("Empty response from {} (HTTP {})", path, status));
        }
        Ok(body)
    } else {
        Err(format!("{}: HTTP {} {}", path, status, body))
    }
}

// ────────────────────────── authed wrappers ──────────────────────────
//
// The PUT/POST authed variants ride along as a complete API so the per-domain
// migration PRs that follow the canary are mechanical edits, not "add a new
// export, then migrate" — that's why they carry `#[allow(dead_code)]`.

pub fn pd_get_authed(state: &Mutex<ConnectionState>, path: &str) -> Result<String, String> {
    let attempt = |_state: &Mutex<ConnectionState>| -> Result<(u16, String), String> {
        let (access_token, entitlements, _puuid, _region, shard, client_version) =
            get_glz_creds(_state)?;
        pd_get_raw(&shard, path, &access_token, &entitlements, &client_version)
    };
    try_pd_with_refresh(state, path, attempt, refresh_tokens)
}

#[allow(dead_code)]
pub fn pd_put_authed(
    state: &Mutex<ConnectionState>,
    path: &str,
    body: &str,
) -> Result<String, String> {
    let attempt = |_state: &Mutex<ConnectionState>| -> Result<(u16, String), String> {
        let (access_token, entitlements, _puuid, _region, shard, client_version) =
            get_glz_creds(_state)?;
        pd_put_raw(
            &shard,
            path,
            body,
            &access_token,
            &entitlements,
            &client_version,
        )
    };
    try_pd_with_refresh(state, path, attempt, refresh_tokens)
}

#[allow(dead_code)]
pub fn pd_post_authed(
    state: &Mutex<ConnectionState>,
    path: &str,
    body: &str,
) -> Result<String, String> {
    let attempt = |_state: &Mutex<ConnectionState>| -> Result<(u16, String), String> {
        let (access_token, entitlements, _puuid, _region, shard, client_version) =
            get_glz_creds(_state)?;
        pd_post_raw(
            &shard,
            path,
            body,
            &access_token,
            &entitlements,
            &client_version,
        )
    };
    try_pd_with_refresh(state, path, attempt, refresh_tokens)
}

/// Shared retry/refresh logic. Generic over `attempt` and `refresh` so the
/// production wrappers above and the unit tests below can share it without
/// either touching the real Node subprocess layer or the real lockfile.
///
/// Contract:
///   - On a non-auth status, finalize and return immediately (no retry).
///   - On 401/403:
///     - OAuth session  → mark NeedsRefresh, return AUTH_REFRESHING. Never
///       retry inline; the bg loop owns the refresh.
///     - Lockfile session → call refresh, retry exactly once. Any further
///       auth failure surfaces as a real error.
fn try_pd_with_refresh<F, R>(
    state: &Mutex<ConnectionState>,
    path: &str,
    mut attempt: F,
    mut refresh: R,
) -> Result<String, String>
where
    F: FnMut(&Mutex<ConnectionState>) -> Result<(u16, String), String>,
    R: FnMut(&Mutex<ConnectionState>) -> Result<(), String>,
{
    let (status, body) = attempt(state)?;
    if !is_auth_status(status) {
        return finalize(path, status, body);
    }

    let oauth = read_oauth_flag(state);
    if oauth {
        mark_needs_refresh(state);
        log_info(&format!(
            "[PdSession] {}: HTTP {} on OAuth session; signalled background refresh",
            path, status
        ));
        return Err(AUTH_REFRESHING.to_string());
    }

    log_info(&format!(
        "[PdSession] {}: HTTP {} on lockfile session; refreshing tokens and retrying",
        path, status
    ));
    if let Err(e) = refresh(state) {
        return Err(format!("token refresh failed: {}", e));
    }

    let (status, body) = attempt(state)?;
    finalize(path, status, body)
}

fn read_oauth_flag(state: &Mutex<ConnectionState>) -> bool {
    state.lock().map(|s| s.oauth_session).unwrap_or(false)
}

fn mark_needs_refresh(state: &Mutex<ConnectionState>) {
    if let Ok(mut s) = state.lock() {
        s.signal_needs_refresh();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::riot::types::OAuthState;
    use std::cell::Cell;

    fn seeded_state(connected: bool, oauth: bool) -> Mutex<ConnectionState> {
        Mutex::new(ConnectionState {
            connected,
            oauth_session: oauth,
            access_token: Some("tok".into()),
            entitlements: Some("ent".into()),
            puuid: Some("p".into()),
            region: Some("na".into()),
            shard: Some("na".into()),
            client_version: Some("v".into()),
            ..Default::default()
        })
    }

    #[test]
    fn auth_status_covers_401_and_403() {
        assert!(is_auth_status(401));
        assert!(is_auth_status(403));
        assert!(!is_auth_status(200));
        assert!(!is_auth_status(429));
        assert!(!is_auth_status(500));
    }

    #[test]
    fn finalize_passes_2xx_with_body() {
        assert_eq!(finalize("/x", 200, "ok".into()), Ok("ok".to_string()));
        assert_eq!(finalize("/x", 204, "x".into()), Ok("x".to_string()));
    }

    #[test]
    fn finalize_errs_empty_200_but_passes_empty_204() {
        // 200 with empty body is unexpected (the caller asked for JSON
        // and got nothing). 204 No Content is a legitimate empty-body
        // success — settings ACK PUTs in particular hit this.
        assert!(finalize("/x", 200, String::new())
            .unwrap_err()
            .contains("Empty"));
        assert_eq!(finalize("/x", 204, String::new()), Ok(String::new()));
    }

    #[test]
    fn finalize_errs_non_2xx() {
        assert!(finalize("/x", 500, "boom".into())
            .unwrap_err()
            .contains("HTTP 500"));
    }

    #[test]
    fn retry_succeeds_on_lockfile_after_refresh() {
        let state = seeded_state(true, false);
        let calls = Cell::new(0u32);
        let refreshes = Cell::new(0u32);

        let attempt = |_s: &Mutex<ConnectionState>| {
            let n = calls.get() + 1;
            calls.set(n);
            if n == 1 {
                Ok((401, String::new()))
            } else {
                Ok((200, "ok".into()))
            }
        };
        let refresh = |_s: &Mutex<ConnectionState>| -> Result<(), String> {
            refreshes.set(refreshes.get() + 1);
            Ok(())
        };

        let result = try_pd_with_refresh(&state, "/x", attempt, refresh);
        assert_eq!(result, Ok("ok".to_string()));
        assert_eq!(calls.get(), 2);
        assert_eq!(refreshes.get(), 1);
    }

    #[test]
    fn lockfile_double_auth_fail_surfaces_error() {
        let state = seeded_state(true, false);
        let calls = Cell::new(0u32);
        let attempt = |_s: &Mutex<ConnectionState>| {
            calls.set(calls.get() + 1);
            Ok((401, "creds".into()))
        };
        let refresh = |_s: &Mutex<ConnectionState>| Ok(());

        let err = try_pd_with_refresh(&state, "/x", attempt, refresh).unwrap_err();
        assert!(err.contains("HTTP 401"));
        assert_eq!(calls.get(), 2, "exactly one retry, never an infinite loop");
    }

    #[test]
    fn lockfile_refresh_failure_propagates() {
        let state = seeded_state(true, false);
        let attempt = |_s: &Mutex<ConnectionState>| Ok((401, String::new()));
        let refresh = |_s: &Mutex<ConnectionState>| Err("lockfile gone".to_string());

        let err = try_pd_with_refresh(&state, "/x", attempt, refresh).unwrap_err();
        assert!(err.contains("token refresh failed"));
        assert!(err.contains("lockfile gone"));
    }

    #[test]
    fn oauth_401_signals_bg_loop_and_returns_sentinel() {
        let state = seeded_state(true, true);
        let calls = Cell::new(0u32);
        let refreshes = Cell::new(0u32);

        let attempt = |_s: &Mutex<ConnectionState>| {
            calls.set(calls.get() + 1);
            Ok((401, String::new()))
        };
        let refresh = |_s: &Mutex<ConnectionState>| -> Result<(), String> {
            refreshes.set(refreshes.get() + 1);
            Ok(())
        };

        let result = try_pd_with_refresh(&state, "/x", attempt, refresh);
        assert_eq!(result, Err(AUTH_REFRESHING.to_string()));
        assert_eq!(calls.get(), 1, "no inline retry on OAuth session");
        assert_eq!(refreshes.get(), 0, "bg loop owns the refresh");
        assert_eq!(
            state.lock().unwrap().oauth_state,
            OAuthState::NeedsRefresh,
            "NeedsRefresh signal raised for the bg loop"
        );
    }

    #[test]
    fn oauth_403_signals_bg_loop() {
        let state = seeded_state(true, true);
        let attempt = |_s: &Mutex<ConnectionState>| Ok((403, String::new()));
        let refresh = |_s: &Mutex<ConnectionState>| Ok(());

        let result = try_pd_with_refresh(&state, "/x", attempt, refresh);
        assert_eq!(result, Err(AUTH_REFRESHING.to_string()));
        assert_eq!(state.lock().unwrap().oauth_state, OAuthState::NeedsRefresh);
    }

    #[test]
    fn marking_needs_refresh_does_not_downgrade_needs_reauth() {
        // Rung-3 has already failed and the user needs the banner. A late
        // PD call returning 401 must not erase that signal back to a
        // recoverable state.
        let state = seeded_state(true, true);
        state.lock().unwrap().oauth_state = OAuthState::NeedsReauth;
        let attempt = |_s: &Mutex<ConnectionState>| Ok((401, String::new()));
        let refresh = |_s: &Mutex<ConnectionState>| Ok(());

        let _ = try_pd_with_refresh(&state, "/x", attempt, refresh);
        assert_eq!(
            state.lock().unwrap().oauth_state,
            OAuthState::NeedsReauth,
            "NeedsReauth is sticky until the user signs back in"
        );
    }

    #[test]
    fn happy_path_no_refresh() {
        let state = seeded_state(true, false);
        let calls = Cell::new(0u32);
        let refreshes = Cell::new(0u32);
        let attempt = |_s: &Mutex<ConnectionState>| {
            calls.set(calls.get() + 1);
            Ok((200, "fine".into()))
        };
        let refresh = |_s: &Mutex<ConnectionState>| -> Result<(), String> {
            refreshes.set(refreshes.get() + 1);
            Ok(())
        };

        let result = try_pd_with_refresh(&state, "/x", attempt, refresh);
        assert_eq!(result, Ok("fine".to_string()));
        assert_eq!(calls.get(), 1);
        assert_eq!(refreshes.get(), 0);
    }

    #[test]
    fn non_auth_error_does_not_retry() {
        let state = seeded_state(true, false);
        let calls = Cell::new(0u32);
        let attempt = |_s: &Mutex<ConnectionState>| {
            calls.set(calls.get() + 1);
            Ok((500, "server fire".into()))
        };
        let refresh = |_s: &Mutex<ConnectionState>| Ok(());

        let err = try_pd_with_refresh(&state, "/x", attempt, refresh).unwrap_err();
        assert!(err.contains("HTTP 500"));
        assert_eq!(calls.get(), 1, "5xx is not retryable here");
    }
}
