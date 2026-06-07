use std::sync::Mutex;

use super::auth::get_glz_creds;
use super::http::{glz_get, glz_post, glz_post_body, pd_get};
use super::logging::log_info;
use super::types::ConnectionState;

pub fn change_queue(state: &Mutex<ConnectionState>, queue_id: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(
        &region,
        &shard,
        &player_path,
        &access_token,
        &entitlements,
        &client_version,
    )?;
    let player_json: serde_json::Value =
        serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/queue", party_id);
    let body = serde_json::json!({"queueID": queue_id}).to_string();
    log_info(&format!("[Party] Changing queue to {}", queue_id));
    glz_post_body(
        &region,
        &shard,
        &path,
        &body,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn enter_queue(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(
        &region,
        &shard,
        &player_path,
        &access_token,
        &entitlements,
        &client_version,
    )?;
    let player_json: serde_json::Value =
        serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/matchmaking/join", party_id);
    log_info(&format!("[Queue] Entering queue for party {}", party_id));
    glz_post(
        &region,
        &shard,
        &path,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn leave_queue(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(
        &region,
        &shard,
        &player_path,
        &access_token,
        &entitlements,
        &client_version,
    )?;
    let player_json: serde_json::Value =
        serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/matchmaking/leave", party_id);
    log_info(&format!("[Queue] Leaving queue for party {}", party_id));
    glz_post(
        &region,
        &shard,
        &path,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn get_penalties(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, _, _, shard, client_version) = get_glz_creds(state)?;
    let path = "/restrictions/v3/penalties";
    pd_get(&shard, path, &access_token, &entitlements, &client_version)
}
