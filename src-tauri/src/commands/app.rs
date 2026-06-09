use tauri::Manager;

#[tauri::command]
pub fn show_window_no_focus(app: tauri::AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        extern "system" {
            fn GetForegroundWindow() -> isize;
            fn SetForegroundWindow(hwnd: isize) -> i32;
            fn ShowWindow(hwnd: isize, cmd: i32) -> i32;
            fn SetWindowPos(
                hwnd: isize,
                insert_after: isize,
                x: i32,
                y: i32,
                cx: i32,
                cy: i32,
                flags: u32,
            ) -> i32;
        }
        const SW_SHOWNOACTIVATE: i32 = 4;
        const HWND_TOPMOST: isize = -1;
        const SWP_NOMOVE: u32 = 0x0002;
        const SWP_NOSIZE: u32 = 0x0001;
        const SWP_NOACTIVATE: u32 = 0x0010;

        if let Some(window) = app.get_webview_window(&label) {
            let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
            unsafe {
                let prev_fg = GetForegroundWindow();
                ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
                if prev_fg != 0 && prev_fg != hwnd {
                    SetForegroundWindow(prev_fg);
                }
            }
            return Ok(());
        }
        Err("Window not found".into())
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(window) = app.get_webview_window(&label) {
            window.show().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("Window not found".into())
        }
    }
}

#[tauri::command]
pub fn toggle_devtools(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
}

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn check_node_installed() -> bool {
    let mut cmd = std::process::Command::new("node");
    cmd.args(["--version"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[tauri::command]
pub async fn check_for_update() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = r#"const https=require('https');const o={hostname:'api.github.com',path:'/repos/TheKfcBandit/Valorant-Thing/releases?per_page=20',headers:{'User-Agent':'ValorantThing'}};https.get(o,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}).on('error',e=>{process.stderr.write(e.message);process.exit(1)})"#;
        let mut cmd = std::process::Command::new("node");
        cmd.args(["-e", script]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        let body = String::from_utf8_lossy(&output.stdout).to_string();
        let releases: Vec<serde_json::Value> =
            serde_json::from_str(&body).map_err(|e| format!("parse: {}", e))?;
        let current = CURRENT_VERSION;
        let cur_parts: Vec<u32> = current.split('.').filter_map(|s| s.parse().ok()).collect();

        let mut newer: Vec<&serde_json::Value> = releases
            .iter()
            .filter(|r| {
                let t = r["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
                let parts: Vec<u32> = t.split('.').filter_map(|s| s.parse().ok()).collect();
                parts > cur_parts
            })
            .collect();
        if newer.is_empty() {
            return Ok(serde_json::json!({"update": false, "current": current}).to_string());
        }
        newer.sort_by(|a, b| {
            let av: Vec<u32> = a["tag_name"]
                .as_str()
                .unwrap_or("")
                .trim_start_matches('v')
                .split('.')
                .filter_map(|s| s.parse().ok())
                .collect();
            let bv: Vec<u32> = b["tag_name"]
                .as_str()
                .unwrap_or("")
                .trim_start_matches('v')
                .split('.')
                .filter_map(|s| s.parse().ok())
                .collect();
            bv.cmp(&av)
        });

        let latest = &newer[0];
        let tag = latest["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
        let mut download_url = String::new();
        let mut asset_name = String::new();
        if let Some(assets) = latest["assets"].as_array() {
            for a in assets {
                let name = a["name"].as_str().unwrap_or("");
                if name.ends_with(".exe") && name.contains("setup") {
                    download_url = a["browser_download_url"].as_str().unwrap_or("").to_string();
                    asset_name = name.to_string();
                    break;
                }
            }
        }
        let all_releases: Vec<serde_json::Value> = newer
            .iter()
            .map(|r| {
                serde_json::json!({
                    "version": r["tag_name"].as_str().unwrap_or("").trim_start_matches('v'),
                    "notes": r["body"].as_str().unwrap_or(""),
                    "published_at": r["published_at"].as_str().unwrap_or(""),
                })
            })
            .collect();
        Ok(serde_json::json!({
            "update": true,
            "current": current,
            "latest": tag,
            "download_url": download_url,
            "asset_name": asset_name,
            "release_url": latest["html_url"].as_str().unwrap_or(""),
            "release_notes": latest["body"].as_str().unwrap_or(""),
            "published_at": latest["published_at"].as_str().unwrap_or(""),
            "all_releases": all_releases,
        })
        .to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn download_and_install_update(
    app: tauri::AppHandle,
    url: String,
    filename: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !url.starts_with("https://github.com/")
            && !url.starts_with("https://objects.githubusercontent.com/")
        {
            return Err("Update URL must point to a GitHub release asset".to_string());
        }
        let filename = std::path::Path::new(&filename)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| n.ends_with(".exe"))
            .ok_or_else(|| "Invalid installer filename".to_string())?
            .to_string();
        let temp = std::env::temp_dir();
        let installer_path = temp.join(&filename);
        let bat_path = temp.join("valthing_update.bat");
        let installer_str = installer_path.to_string_lossy().to_string();
        let bat_str = bat_path.to_string_lossy().to_string();

        let mut cmd = std::process::Command::new("curl");
        cmd.args([
            "-L",
            "-o",
            &installer_str,
            "-A",
            "ValorantThing",
            "--fail",
            "--silent",
            "--show-error",
            &url,
        ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("download failed: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "Download failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }

        let bat_content = format!(
            "@echo off\r\ntimeout /t 2 /nobreak >nul\r\nstart \"\" \"{}\"\r\ndel \"%~f0\"\r\n",
            installer_str
        );
        std::fs::write(&bat_path, &bat_content).map_err(|e| format!("write bat: {}", e))?;

        let mut bat_cmd = std::process::Command::new("cmd");
        bat_cmd.args(["/c", "start", "", "/b", &bat_str]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            bat_cmd.creation_flags(0x08000000);
        }
        bat_cmd.spawn().map_err(|e| format!("spawn bat: {}", e))?;

        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    app.exit(0);
    #[allow(unreachable_code)]
    Ok(())
}
