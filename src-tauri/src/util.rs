use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn cache_path(app: &AppHandle, filename: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
    }
    Ok(dir.join(filename))
}
