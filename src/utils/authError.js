// Frontend half of #14. The Rust-side `pd_session::pd_*_authed` wrappers
// return the `AUTH_REFRESHING` sentinel string when an OAuth-mode PD call
// hits a 401/403 — the background refresh loop on the Rust side has been
// signalled and will recover within ~60s. The frontend's job is to not
// scare the user with a raw `AUTH_REFRESHING` in an error banner while
// that happens.
//
// Keep this in sync with the constant in
// `src-tauri/src/riot/pd_session.rs` (top-of-file comment notes the
// cross-language contract).

export const AUTH_REFRESHING = "AUTH_REFRESHING";

export function isTransientAuthError(err) {
  const msg = typeof err === "string" ? err : err?.message || String(err);
  return msg === AUTH_REFRESHING || msg.includes(AUTH_REFRESHING);
}

// Drop-in replacement for the repeated
//   `typeof e === "string" ? e : e?.message || fallback`
// pattern at error-display sites. Substitutes a user-friendly message
// for the AUTH_REFRESHING sentinel so the raw string never reaches the
// UI. For any other error, behaves identically to the inline pattern.
export function formatError(err, fallback) {
  if (isTransientAuthError(err)) return "Refreshing session…";
  const msg = typeof err === "string" ? err : err?.message;
  return msg || fallback;
}
