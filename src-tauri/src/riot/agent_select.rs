use std::sync::Mutex;

use super::auth::get_glz_creds;
use super::http::{glz_get, glz_post};
use super::logging::log_info;
use super::pd_session::pd_get_authed;
use super::types::ConnectionState;

pub fn check_current_game(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;

    let pregame_player_path = format!("/pregame/v1/players/{}", puuid);
    if let Ok(pregame_raw) = glz_get(
        &region,
        &shard,
        &pregame_player_path,
        &access_token,
        &entitlements,
        &client_version,
    ) {
        if let Ok(pregame_json) = serde_json::from_str::<serde_json::Value>(&pregame_raw) {
            if let Some(match_id) = pregame_json["MatchID"].as_str().filter(|s| !s.is_empty()) {
                let match_path = format!("/pregame/v1/matches/{}", match_id);
                if let Ok(match_raw) = glz_get(
                    &region,
                    &shard,
                    &match_path,
                    &access_token,
                    &entitlements,
                    &client_version,
                ) {
                    let mut result: serde_json::Value =
                        serde_json::from_str(&match_raw).unwrap_or(serde_json::json!({}));
                    result["_phase"] = serde_json::json!("pregame");
                    return Ok(result.to_string());
                }
            }
        }
    }

    let coregame_player_path = format!("/core-game/v1/players/{}", puuid);
    if let Ok(coregame_raw) = glz_get(
        &region,
        &shard,
        &coregame_player_path,
        &access_token,
        &entitlements,
        &client_version,
    ) {
        if let Ok(coregame_json) = serde_json::from_str::<serde_json::Value>(&coregame_raw) {
            if let Some(match_id) = coregame_json["MatchID"].as_str().filter(|s| !s.is_empty()) {
                let match_path = format!("/core-game/v1/matches/{}", match_id);
                if let Ok(match_raw) = glz_get(
                    &region,
                    &shard,
                    &match_path,
                    &access_token,
                    &entitlements,
                    &client_version,
                ) {
                    let mut result: serde_json::Value =
                        serde_json::from_str(&match_raw).unwrap_or(serde_json::json!({}));
                    result["_phase"] = serde_json::json!("ingame");
                    return Ok(result.to_string());
                }
            }
        }
    }

    Err("Not in a match".to_string())
}

pub fn get_match_loadouts(
    state: &Mutex<ConnectionState>,
    match_id: &str,
    phase: &str,
) -> Result<String, String> {
    let (access_token, entitlements, _puuid, region, shard, client_version) = get_glz_creds(state)?;
    let path = match phase {
        "pregame" => format!("/pregame/v1/matches/{}/loadouts", match_id),
        "ingame" => format!("/core-game/v1/matches/{}/loadouts", match_id),
        _ => return Err(format!("Bad phase: {}", phase)),
    };
    glz_get(
        &region,
        &shard,
        &path,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn select_agent(
    state: &Mutex<ConnectionState>,
    match_id: &str,
    agent_id: &str,
) -> Result<String, String> {
    let (access_token, entitlements, _, region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/pregame/v1/matches/{}/select/{}", match_id, agent_id);
    log_info(&format!(
        "[Game] Selecting agent {} in match {}",
        agent_id, match_id
    ));
    glz_post(
        &region,
        &shard,
        &path,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn lock_agent(
    state: &Mutex<ConnectionState>,
    match_id: &str,
    agent_id: &str,
) -> Result<String, String> {
    let (access_token, entitlements, _, region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/pregame/v1/matches/{}/lock/{}", match_id, agent_id);
    log_info(&format!(
        "[Game] Locking agent {} in match {}",
        agent_id, match_id
    ));
    glz_post(
        &region,
        &shard,
        &path,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn pregame_quit(state: &Mutex<ConnectionState>, match_id: &str) -> Result<String, String> {
    let (access_token, entitlements, _, region, shard, client_version) = get_glz_creds(state)?;
    let quit_path = format!("/pregame/v1/matches/{}/quit", match_id);
    log_info(&format!("[Game] Dodging match {}", match_id));
    glz_post(
        &region,
        &shard,
        &quit_path,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn coregame_quit(state: &Mutex<ConnectionState>, match_id: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/core-game/v1/players/{}/disassociate/{}", puuid, match_id);
    log_info(&format!("[Game] Leaving match {}", match_id));
    glz_post(
        &region,
        &shard,
        &path,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn get_owned_agents(state: &Mutex<ConnectionState>) -> Result<Vec<String>, String> {
    let (_, _, puuid, _, _, _) = get_glz_creds(state)?;
    let path = format!(
        "/store/v1/entitlements/{}/01bb38e1-da47-4e6a-9b3d-945fe4655707",
        puuid
    );
    let raw = pd_get_authed(state, &path)?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let items = json["Entitlements"]
        .as_array()
        .ok_or("No Entitlements array")?;
    let ids: Vec<String> = items
        .iter()
        .filter_map(|item| item["ItemID"].as_str().map(|s| s.to_lowercase()))
        .collect();
    log_info(&format!("[Game] Owned agents: {} total", ids.len()));
    Ok(ids)
}
