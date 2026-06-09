use crate::riot;

#[tauri::command]
pub fn is_valorant_running() -> bool {
    riot::is_valorant_running()
}

#[tauri::command]
pub fn is_valorant_foreground() -> bool {
    riot::is_valorant_foreground()
}

#[tauri::command]
pub fn get_valorant_monitor() -> Result<String, String> {
    let (x, y, w, h) = riot::get_valorant_monitor()?;
    Ok(serde_json::json!({ "x": x, "y": y, "width": w, "height": h }).to_string())
}

#[tauri::command]
pub fn list_monitors() -> Result<String, String> {
    riot::list_monitors()
}

#[tauri::command]
pub fn find_valorant_path() -> Result<String, String> {
    riot::find_valorant_path()
}

#[tauri::command]
pub fn compute_file_hash(path: String) -> Result<String, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let data = std::fs::read(&path).map_err(|e| format!("read {}: {}", path, e))?;
    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);
    Ok(format!("{:x}", hasher.finish()))
}

#[tauri::command]
pub fn force_copy_file(source: String, dest: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
    }
    std::fs::copy(&source, &dest).map_err(|e| format!("copy {} -> {}: {}", source, dest, e))?;
    Ok(())
}

#[tauri::command]
pub fn remove_file(path: String) -> Result<(), String> {
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).map_err(|e| format!("remove {}: {}", path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut entries = vec![];
    for entry in std::fs::read_dir(dir)
        .map_err(|e| format!("readdir {}: {}", path, e))?
        .flatten()
    {
        if let Some(name) = entry.file_name().to_str() {
            entries.push(name.to_string());
        }
    }
    Ok(entries)
}

#[tauri::command]
pub fn read_game_log(offset: u64) -> Result<serde_json::Value, String> {
    let local_app_data =
        std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found".to_string())?;
    let path = format!("{}\\VALORANT\\Saved\\Logs\\ShooterGame.log", local_app_data);

    let file =
        std::fs::File::open(&path).map_err(|e| format!("Could not open ShooterGame.log: {}", e))?;
    let file_len = file.metadata().map_err(|e| e.to_string())?.len();

    let actual_offset = if offset > file_len { 0 } else { offset };

    let read_from = if actual_offset == 0 && file_len > 131072 {
        file_len - 131072
    } else {
        actual_offset
    };

    let max_read: u64 = 131072;
    let read_len = std::cmp::min(file_len.saturating_sub(read_from), max_read);

    if read_len == 0 {
        return Ok(serde_json::json!({ "text": "", "offset": file_len, "fileSize": file_len }));
    }

    use std::io::{Read, Seek, SeekFrom};
    let mut file = file;
    file.seek(SeekFrom::Start(read_from))
        .map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; read_len as usize];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&buf).to_string();

    Ok(serde_json::json!({
        "text": text,
        "offset": file_len,
        "fileSize": file_len,
    }))
}
