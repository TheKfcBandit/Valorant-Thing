// Generic OS-keychain-backed secret store. Same keychain crate / fallback
// pattern as token_store.rs, but parameterized by a caller-supplied name so
// multiple secrets (LLM API keys, future share-code signing keys, etc.) can
// share one module. Closes #15 — moves the AI Coach API key off the
// renderer's localStorage, which any compromised extension or `tauri-fs`
// command could read.
//
// Key namespacing: we use a per-secret keychain entry under
// `valorant-thing` / `secret-<name>` so the existing `riot-oauth-blob` entry
// is untouched. Fallback files live under `cache_dir / secrets / <name>.txt`,
// individually quarantined on parse fail.

use std::path::PathBuf;

use tauri::AppHandle;

use crate::riot::logging::{log_error, log_info};
use crate::util::cache_path;

const SERVICE: &str = "valorant-thing";

fn keychain_key(name: &str) -> String {
    format!("secret-{}", name)
}

fn fallback_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    cache_path(app, &format!("secrets/{}.txt", name))
}

// Reject anything that isn't a-z0-9_- so a caller can't path-traverse via the
// fallback file name or smuggle separators into the keychain key.
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err("invalid secret name length".into());
    }
    if !name
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
    {
        return Err("invalid secret name chars".into());
    }
    Ok(())
}

pub fn save(app: &AppHandle, name: &str, value: &str) -> Result<(), String> {
    validate_name(name)?;

    // Wipe fallback FIRST so a crash mid-save can't leave a stale plaintext
    // shadowing a fresh keychain write. Same invariant as token_store::save.
    if let Ok(path) = fallback_path(app, name) {
        if path.exists() {
            if let Err(e) = std::fs::remove_file(&path) {
                log_error(&format!(
                    "[SecretStore] pre-save fallback wipe failed for {}: {}",
                    name, e
                ));
            }
        }
    }

    match keyring::Entry::new(SERVICE, &keychain_key(name)) {
        Ok(entry) => match entry.set_password(value) {
            Ok(()) => {
                log_info(&format!("[SecretStore] saved {} to keychain", name));
                return Ok(());
            }
            Err(e) => log_error(&format!(
                "[SecretStore] keychain set failed for {}, using fallback: {}",
                name, e
            )),
        },
        Err(e) => log_error(&format!(
            "[SecretStore] keychain unavailable for {}, using fallback: {}",
            name, e
        )),
    }

    let path = fallback_path(app, name)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("fallback mkdir: {}", e))?;
    }
    let tmp = path.with_extension("txt.tmp");
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, value).map_err(|e| format!("fallback write: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("fallback rename: {}", e))?;
    log_info(&format!("[SecretStore] saved {} to fallback file", name));
    Ok(())
}

pub fn load(app: &AppHandle, name: &str) -> Option<String> {
    if validate_name(name).is_err() {
        return None;
    }

    if let Ok(entry) = keyring::Entry::new(SERVICE, &keychain_key(name)) {
        if let Ok(value) = entry.get_password() {
            return Some(value);
        }
    }

    let path = fallback_path(app, name).ok()?;
    if !path.exists() {
        return None;
    }
    match std::fs::read_to_string(&path) {
        Ok(value) => Some(value),
        Err(e) => {
            log_error(&format!(
                "[SecretStore] fallback read failed for {}: {}",
                name, e
            ));
            None
        }
    }
}

pub fn wipe(app: &AppHandle, name: &str) -> Result<(), String> {
    validate_name(name)?;

    if let Ok(entry) = keyring::Entry::new(SERVICE, &keychain_key(name)) {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => log_error(&format!(
                "[SecretStore] keychain wipe failed for {}: {}",
                name, e
            )),
        }
    }
    if let Ok(path) = fallback_path(app, name) {
        if path.exists() {
            if let Err(e) = std::fs::remove_file(&path) {
                log_error(&format!(
                    "[SecretStore] fallback remove failed for {}: {}",
                    name, e
                ));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_secret(app: AppHandle, name: String) -> Option<String> {
    load(&app, &name)
}

#[tauri::command]
pub fn set_secret(app: AppHandle, name: String, value: String) -> Result<(), String> {
    if value.is_empty() {
        return wipe(&app, &name);
    }
    save(&app, &name, &value)
}

#[tauri::command]
pub fn delete_secret(app: AppHandle, name: String) -> Result<(), String> {
    wipe(&app, &name)
}
