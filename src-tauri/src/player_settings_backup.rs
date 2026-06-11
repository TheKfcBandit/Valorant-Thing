// #39/#45: pre-write snapshots of the server-side Ares.PlayerSettings blob.
// Guardrail for the player-settings write path: every write first snapshots
// what the server currently holds, so a bad import or crosshair push is
// always recoverable from the Settings page.
//
// Two slots: `original` is the first snapshot ever taken on this install
// (sticky — never overwritten, the belt-and-braces escape hatch), `latest`
// is the snapshot taken immediately before the most recent write.

use serde::{Deserialize, Serialize};

use crate::value_cache::Cache;

#[derive(Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub saved_at_ms: i64,
    pub decoded_json: String,
}

#[derive(Default, Serialize, Deserialize)]
pub struct SettingsBackupFile {
    pub original: Option<Snapshot>,
    pub latest: Option<Snapshot>,
}

pub type SettingsBackupCache = Cache<SettingsBackupFile>;

pub fn new_cache() -> SettingsBackupCache {
    Cache::new("player-settings-backup.json", "[SettingsBackup]")
}

pub fn record_pre_write(file: &mut SettingsBackupFile, decoded_json: &str, now_ms: i64) {
    let snapshot = Snapshot {
        saved_at_ms: now_ms,
        decoded_json: decoded_json.to_string(),
    };
    if file.original.is_none() {
        file.original = Some(snapshot.clone());
    }
    file.latest = Some(snapshot);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_write_fills_both_slots() {
        let mut file = SettingsBackupFile::default();
        record_pre_write(&mut file, "{\"a\":1}", 100);
        assert_eq!(file.original.as_ref().unwrap().decoded_json, "{\"a\":1}");
        assert_eq!(file.latest.as_ref().unwrap().saved_at_ms, 100);
    }

    #[test]
    fn original_is_sticky_latest_is_replaced() {
        let mut file = SettingsBackupFile::default();
        record_pre_write(&mut file, "first", 100);
        record_pre_write(&mut file, "second", 200);
        record_pre_write(&mut file, "third", 300);
        assert_eq!(file.original.as_ref().unwrap().decoded_json, "first");
        assert_eq!(file.original.as_ref().unwrap().saved_at_ms, 100);
        assert_eq!(file.latest.as_ref().unwrap().decoded_json, "third");
        assert_eq!(file.latest.as_ref().unwrap().saved_at_ms, 300);
    }
}
