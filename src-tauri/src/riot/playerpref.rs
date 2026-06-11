// #39/#45: read/write the server-side `Ares.PlayerSettings` blob on the
// player-preferences service. This is the store the game client itself
// syncs in-game settings (sensitivity, keybinds, crosshair profiles, …)
// against: it reads the blob at launch and writes it back on exit — so
// callers must not write while VALORANT.exe is running (the exit write
// would clobber ours). That guard lives in `commands::playerpref`.
//
// Wire format: the `data` field is standard base64 of raw-DEFLATE
// (zlib wbits -15) compressed UTF-8 JSON — flate2's Deflate{En,De}coder
// is exactly that framing.

use std::io::{Read, Write};
use std::sync::Mutex;

use base64::Engine;
use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use flate2::Compression;

use super::auth::get_glz_creds;
use super::connection::refresh_tokens;
use super::pd_raw::{playerpref_get_raw, playerpref_put_raw};
use super::pd_session::try_pd_with_refresh;
use super::types::ConnectionState;

const PREF_TYPE: &str = "Ares.PlayerSettings";
const GET_PATH: &str = "/playerPref/v3/getPreference/Ares.PlayerSettings";
const PUT_PATH: &str = "/playerPref/v3/savePreference";

pub fn get_player_settings(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let attempt = |state: &Mutex<ConnectionState>| -> Result<(u16, String), String> {
        let (access_token, entitlements, _puuid, _region, _shard, client_version) =
            get_glz_creds(state)?;
        playerpref_get_raw(GET_PATH, &access_token, &entitlements, &client_version)
    };
    let body = try_pd_with_refresh(state, GET_PATH, attempt, refresh_tokens)?;
    decode_pref_data(&extract_pref_data(&body)?)
}

pub fn put_player_settings(
    state: &Mutex<ConnectionState>,
    decoded_json: &str,
) -> Result<(), String> {
    validate_decoded_settings(decoded_json)?;
    let body = serde_json::json!({
        "type": PREF_TYPE,
        "data": encode_pref_data(decoded_json)?,
    })
    .to_string();
    let attempt = |state: &Mutex<ConnectionState>| -> Result<(u16, String), String> {
        let (access_token, entitlements, _puuid, _region, _shard, client_version) =
            get_glz_creds(state)?;
        playerpref_put_raw(
            PUT_PATH,
            &body,
            &access_token,
            &entitlements,
            &client_version,
        )
    };
    try_pd_with_refresh(state, PUT_PATH, attempt, refresh_tokens)?;
    Ok(())
}

fn extract_pref_data(get_body: &str) -> Result<String, String> {
    let v: serde_json::Value = serde_json::from_str(get_body)
        .map_err(|e| format!("getPreference response not JSON: {}", e))?;
    v.get("data")
        .and_then(|d| d.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "getPreference response missing 'data' field".to_string())
}

fn decode_pref_data(data_b64: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64.trim())
        .map_err(|e| format!("settings blob: bad base64: {}", e))?;
    let mut out = String::new();
    DeflateDecoder::new(bytes.as_slice())
        .read_to_string(&mut out)
        .map_err(|e| format!("settings blob: inflate failed: {}", e))?;
    Ok(out)
}

fn encode_pref_data(json: &str) -> Result<String, String> {
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(json.as_bytes())
        .map_err(|e| format!("settings blob: deflate failed: {}", e))?;
    let bytes = encoder
        .finish()
        .map_err(|e| format!("settings blob: deflate finish failed: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

// Cheap sanity gate before a write: the blob must at least look like
// Ares.PlayerSettings, or a mangled import would wipe every in-game
// setting on the account. Shape per community references (ValorantCC,
// ValLib); re-confirmed against a real export during #39 verification.
fn validate_decoded_settings(json: &str) -> Result<(), String> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("settings JSON invalid: {}", e))?;
    let obj = v
        .as_object()
        .ok_or_else(|| "settings JSON is not an object".to_string())?;
    const SETTINGS_ARRAYS: [&str; 4] = [
        "stringSettings",
        "boolSettings",
        "intSettings",
        "floatSettings",
    ];
    let looks_right = SETTINGS_ARRAYS
        .iter()
        .any(|k| obj.get(*k).map(|x| x.is_array()).unwrap_or(false));
    if looks_right {
        Ok(())
    } else {
        Err("settings JSON doesn't look like Ares.PlayerSettings (no settings arrays)".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL_SETTINGS: &str =
        r#"{"stringSettings":[{"settingEnum":"EAresStringSettingName::Foo","value":"bar"}]}"#;

    #[test]
    fn codec_round_trips() {
        let encoded = encode_pref_data(MINIMAL_SETTINGS).unwrap();
        assert_eq!(decode_pref_data(&encoded).unwrap(), MINIMAL_SETTINGS);
    }

    #[test]
    fn decode_rejects_bad_base64() {
        assert!(decode_pref_data("not base64 !!!").is_err());
    }

    #[test]
    fn decode_rejects_non_deflate_bytes() {
        let b64 = base64::engine::general_purpose::STANDARD.encode(b"plain text, not deflate");
        assert!(decode_pref_data(&b64).is_err());
    }

    #[test]
    fn decode_tolerates_surrounding_whitespace() {
        let encoded = format!("  {}\n", encode_pref_data(MINIMAL_SETTINGS).unwrap());
        assert_eq!(decode_pref_data(&encoded).unwrap(), MINIMAL_SETTINGS);
    }

    #[test]
    fn extract_pulls_data_field() {
        let body = r#"{"type":"Ares.PlayerSettings","data":"abc123","modified":1}"#;
        assert_eq!(extract_pref_data(body).unwrap(), "abc123");
    }

    #[test]
    fn extract_errors_on_missing_data() {
        assert!(extract_pref_data(r#"{"type":"Ares.PlayerSettings"}"#).is_err());
        assert!(extract_pref_data("not json").is_err());
    }

    #[test]
    fn validate_accepts_each_settings_array() {
        for key in [
            "stringSettings",
            "boolSettings",
            "intSettings",
            "floatSettings",
        ] {
            let json = format!(r#"{{"{}":[]}}"#, key);
            assert!(validate_decoded_settings(&json).is_ok(), "{}", key);
        }
    }

    #[test]
    fn validate_rejects_wrong_shapes() {
        assert!(validate_decoded_settings("[]").is_err());
        assert!(validate_decoded_settings("not json").is_err());
        assert!(validate_decoded_settings("{}").is_err());
        assert!(validate_decoded_settings(r#"{"stringSettings":"not an array"}"#).is_err());
    }
}
