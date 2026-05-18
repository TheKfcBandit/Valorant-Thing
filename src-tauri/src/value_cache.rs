// Generic file-backed JSON cache. Lazy load on first access, atomic write
// on every persist, corrupt-file rescue (rename to `.corrupt-{ts}` + log,
// continue with default). Replaces ~95 lines of byte-identical
// ensure_loaded + persist boilerplate that was copy-pasted across four
// cache modules — see philosophy rules 1 (one source of truth) and 2
// (copy permitted up to 2 instances).
//
// Storage layout (unchanged from the per-module implementations):
//   <appDataDir>/{filename}            — the committed snapshot
//   <appDataDir>/{filename}.tmp        — in-flight write, removed by rename
//   <appDataDir>/{filename}.corrupt-{ts} — quarantined unparseable file

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{de::DeserializeOwned, Serialize};
use tauri::AppHandle;

use crate::riot::logging::log_error;
use crate::util::cache_path as util_cache_path;

struct Inner<T> {
    value: T,
    loaded: bool,
}

impl<T: Default> Default for Inner<T> {
    fn default() -> Self {
        Self {
            value: T::default(),
            loaded: false,
        }
    }
}

pub struct Cache<T> {
    inner: Mutex<Inner<T>>,
    filename: &'static str,
    log_tag: &'static str,
}

impl<T> Cache<T>
where
    T: Default + Serialize + DeserializeOwned,
{
    pub fn new(filename: &'static str, log_tag: &'static str) -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            filename,
            log_tag,
        }
    }

    /// Run a read-only closure over the cached value. Lazily loads the file
    /// on first access. The closure must not block on anything that could
    /// re-enter this cache.
    pub fn read<R, F>(&self, app: &AppHandle, f: F) -> Result<R, String>
    where
        F: FnOnce(&T) -> R,
    {
        self.ensure_loaded(app)?;
        let guard = self.inner.lock().map_err(|e| e.to_string())?;
        Ok(f(&guard.value))
    }

    /// Run a mutating closure over the cached value. The closure returns
    /// `(result, should_persist)`; the file is written atomically (under
    /// the same lock that the closure ran under) when `should_persist` is
    /// true. Keeping the persist inside the locked scope preserves the
    /// superset-snapshot invariant under concurrent writers: two callers
    /// each see a complete map, the tail write overwrites the head with
    /// the same superset, no data is lost. Do not refactor to drop the
    /// lock before persisting.
    pub fn write<R, F>(&self, app: &AppHandle, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut T) -> (R, bool),
    {
        self.ensure_loaded(app)?;
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        let (result, should_persist) = f(&mut guard.value);
        if should_persist {
            let snapshot =
                serde_json::to_string(&guard.value).map_err(|e| format!("serialize: {}", e))?;
            let path = util_cache_path(app, self.filename)?;
            let tmp = path.with_extension("json.tmp");
            // Best-effort cleanup of any leftover .tmp from a prior crashed
            // write. Ignored error: if it doesn't exist, that's fine; if
            // removal fails, the upcoming write will fail with a clearer
            // error.
            let _ = std::fs::remove_file(&tmp);
            std::fs::write(&tmp, snapshot).map_err(|e| format!("write tmp: {}", e))?;
            std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {}", e))?;
        }
        Ok(result)
    }

    fn ensure_loaded(&self, app: &AppHandle) -> Result<(), String> {
        {
            let guard = self.inner.lock().map_err(|e| e.to_string())?;
            if guard.loaded {
                return Ok(());
            }
        }
        let path = util_cache_path(app, self.filename)?;
        let value: T = if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(s) => match serde_json::from_str::<T>(&s) {
                    Ok(v) => v,
                    Err(e) => {
                        // Preserve the corrupt file for diagnosis instead of
                        // silently dropping it.
                        let ts = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        let corrupt = path.with_extension(format!("json.corrupt-{}", ts));
                        let backup_note = match std::fs::rename(&path, &corrupt) {
                            Ok(_) => format!("backed up to {}", corrupt.display()),
                            Err(re) => format!("backup also failed: {}", re),
                        };
                        log_error(&format!(
                            "{} parse failed ({}); starting empty; {}",
                            self.log_tag, e, backup_note
                        ));
                        T::default()
                    }
                },
                Err(e) => {
                    log_error(&format!("{} read failed: {}", self.log_tag, e));
                    T::default()
                }
            }
        } else {
            T::default()
        };
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        guard.value = value;
        guard.loaded = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::collections::HashMap;

    // Exercise the read/write API without a real Tauri AppHandle by hitting
    // the Mutex layer directly. The disk I/O paths are smoke-tested in the
    // per-module integration callers when the app launches.

    #[test]
    fn default_inner_is_empty_and_unloaded() {
        let inner: Inner<HashMap<String, Value>> = Inner::default();
        assert!(inner.value.is_empty());
        assert!(!inner.loaded);
    }

    #[test]
    fn write_closure_decides_persist_flag() {
        // Without an AppHandle we can't call Cache::write, but we can
        // verify the (R, bool) contract on a stand-in: the closure both
        // mutates and reports whether a persist should happen.
        let mut map: HashMap<String, Value> = HashMap::new();
        let (was_new, should_persist) = {
            let entry = serde_json::json!({"matchId": "abc", "dateMs": 100});
            let was_new = !map.contains_key("abc");
            map.insert("abc".to_string(), entry);
            (was_new, was_new)
        };
        assert!(was_new);
        assert!(should_persist);
        assert_eq!(map.len(), 1);

        // Second insert of same key: no new entries, persist should skip.
        let (was_new, should_persist) = {
            let entry = serde_json::json!({"matchId": "abc", "dateMs": 200});
            let was_new = !map.contains_key("abc");
            map.insert("abc".to_string(), entry);
            (was_new, was_new)
        };
        assert!(!was_new);
        assert!(!should_persist);
    }
}
