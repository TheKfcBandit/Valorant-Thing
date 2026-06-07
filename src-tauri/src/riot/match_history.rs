use std::sync::Mutex;

use super::auth::get_glz_creds;
use super::http::{pd_batch_get, pd_get};
use super::logging::log_info;
use super::types::ConnectionState;

fn extract_map_name(map_url: &str) -> String {
    map_url.rsplit('/').next().unwrap_or("Unknown").to_string()
}

pub fn get_player_mmr(
    state: &Mutex<ConnectionState>,
    target_puuid: &str,
) -> Result<String, String> {
    let (access_token, entitlements, _, _, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/mmr/v1/players/{}", target_puuid);
    let raw = pd_get(&shard, &path, &access_token, &entitlements, &client_version)?;
    let json: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Parse MMR: {}", e))?;

    let tier = json["LatestCompetitiveUpdate"]["TierAfterUpdate"]
        .as_u64()
        .unwrap_or(0);
    let rr = json["LatestCompetitiveUpdate"]["RankedRatingAfterUpdate"]
        .as_u64()
        .unwrap_or(0);

    let result = serde_json::json!({
        "currenttier": tier,
        "ranking_in_tier": rr,
        "raw": json,
    });
    Ok(result.to_string())
}

// #19: pass-through for the historical match-details endpoint. The frontend
// renders the full scoreboard from Riot's raw response; no transformation
// here so future details views (round-by-round, headshot %, etc.) don't have
// to re-fetch or re-shape.
pub fn get_match_details(state: &Mutex<ConnectionState>, match_id: &str) -> Result<String, String> {
    let (access_token, entitlements, _, _, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/match-details/v1/matches/{}", match_id);
    pd_get(&shard, &path, &access_token, &entitlements, &client_version)
}

// #24: per-match RR/tier history for the rolling line chart on HomePage.
// Backed by /mmr/v1/players/{puuid}/competitiveupdates, which Riot returns
// most-recent-first. We pass through the raw response so the frontend can
// do its own filtering (placement-tier-zero, queue) without an extra round
// trip when it wants a different slice.
pub fn get_rr_history(
    state: &Mutex<ConnectionState>,
    start: u64,
    end: u64,
) -> Result<String, String> {
    let (access_token, entitlements, puuid, _, shard, client_version) = get_glz_creds(state)?;
    let path = format!(
        "/mmr/v1/players/{}/competitiveupdates?startIndex={}&endIndex={}&queue=competitive",
        puuid, start, end
    );
    pd_get(&shard, &path, &access_token, &entitlements, &client_version)
}

pub fn get_match_page(
    state: &Mutex<ConnectionState>,
    page: u64,
    page_size: u64,
) -> Result<String, String> {
    let (access_token, entitlements, puuid, _region, shard, client_version) = get_glz_creds(state)?;

    let start = page * page_size;
    let end = start + page_size;
    let history_path = format!(
        "/match-history/v1/history/{}?startIndex={}&endIndex={}",
        puuid, start, end
    );
    let history_raw = pd_get(
        &shard,
        &history_path,
        &access_token,
        &entitlements,
        &client_version,
    )?;
    let history: serde_json::Value =
        serde_json::from_str(&history_raw).map_err(|e| format!("parse history: {}", e))?;
    let total = history["Total"].as_u64().unwrap_or(0);

    let mut match_paths: Vec<String> = Vec::new();
    if let Some(matches) = history["History"].as_array() {
        for m in matches {
            if let Some(id) = m["MatchID"].as_str() {
                match_paths.push(format!("/match-details/v1/matches/{}", id));
            }
        }
    }

    let mut matches: Vec<serde_json::Value> = Vec::new();
    if !match_paths.is_empty() {
        let details = pd_batch_get(
            &shard,
            &match_paths,
            &access_token,
            &entitlements,
            &client_version,
        )?;
        for detail in &details {
            if detail.is_null() {
                continue;
            }

            let map_name = extract_map_name(detail["matchInfo"]["mapId"].as_str().unwrap_or(""));
            let match_id = detail["matchInfo"]["matchId"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let game_start_ms = detail["matchInfo"]["gameStartMillis"].as_i64().unwrap_or(0);

            let player_data = detail["players"].as_array().and_then(|players| {
                players
                    .iter()
                    .find(|p| p["subject"].as_str() == Some(puuid.as_str()))
            });

            let (team_id, kills, deaths, assists, agent) = match player_data {
                Some(p) => (
                    p["teamId"].as_str().unwrap_or("").to_string(),
                    p["stats"]["kills"].as_u64().unwrap_or(0),
                    p["stats"]["deaths"].as_u64().unwrap_or(0),
                    p["stats"]["assists"].as_u64().unwrap_or(0),
                    p["characterId"].as_str().unwrap_or("").to_string(),
                ),
                None => continue,
            };

            let mut won = false;
            let mut rounds_won: u64 = 0;
            let mut rounds_lost: u64 = 0;

            if let Some(teams) = detail["teams"].as_array() {
                for team in teams {
                    let tid = team["teamId"].as_str().unwrap_or("");
                    let rw = team["roundsWon"].as_u64().unwrap_or(0);
                    if tid == team_id {
                        won = team["won"].as_bool().unwrap_or(false);
                        rounds_won = rw;
                    } else {
                        rounds_lost = rw;
                    }
                }
            }

            let queue_id = detail["matchInfo"]["queueID"]
                .as_str()
                .unwrap_or("")
                .to_string();

            let mut teammates: Vec<serde_json::Value> = Vec::new();
            let mut enemies: Vec<serde_json::Value> = Vec::new();
            if let Some(players) = detail["players"].as_array() {
                for p in players {
                    let p_puuid = p["subject"].as_str().unwrap_or("");
                    if p_puuid.is_empty() || p_puuid == puuid {
                        continue;
                    }
                    let p_team = p["teamId"].as_str().unwrap_or("");
                    let entry = serde_json::json!({
                        "puuid": p_puuid,
                        "agentId": p["characterId"].as_str().unwrap_or(""),
                    });
                    if p_team == team_id {
                        teammates.push(entry);
                    } else {
                        enemies.push(entry);
                    }
                }
            }

            matches.push(serde_json::json!({
                "matchId": match_id,
                "dateMs": game_start_ms,
                "map": map_name,
                "won": won,
                "roundsWon": rounds_won,
                "roundsLost": rounds_lost,
                "kills": kills,
                "deaths": deaths,
                "assists": assists,
                "agent": agent,
                "queueId": queue_id,
                "teammates": teammates,
                "enemies": enemies,
            }));
        }
    }

    Ok(serde_json::json!({
        "matches": matches,
        "total": total,
        "page": page,
        "pageSize": page_size,
    })
    .to_string())
}

pub fn get_player_level_from_history(
    state: &Mutex<ConnectionState>,
    target_puuid: &str,
) -> Result<String, String> {
    let (access_token, entitlements, _, _, shard, client_version) = get_glz_creds(state)?;
    let history_path = format!(
        "/match-history/v1/history/{}?startIndex=0&endIndex=5",
        target_puuid
    );
    let history_raw = pd_get(
        &shard,
        &history_path,
        &access_token,
        &entitlements,
        &client_version,
    )?;
    let history: serde_json::Value =
        serde_json::from_str(&history_raw).map_err(|e| format!("parse history: {}", e))?;

    let matches = history["History"].as_array().ok_or("No History array")?;
    if matches.is_empty() {
        return Ok(serde_json::json!({"level": 0}).to_string());
    }

    let match_id = matches[0]["MatchID"].as_str().ok_or("No MatchID")?;
    let detail_path = format!("/match-details/v1/matches/{}", match_id);
    let detail_raw = pd_get(
        &shard,
        &detail_path,
        &access_token,
        &entitlements,
        &client_version,
    )?;
    let detail: serde_json::Value =
        serde_json::from_str(&detail_raw).map_err(|e| format!("parse detail: {}", e))?;

    let mut level: u64 = 0;
    if let Some(players) = detail["players"].as_array() {
        for p in players {
            if p["subject"].as_str() == Some(target_puuid) {
                level = p["accountLevel"].as_u64().unwrap_or(0);
                break;
            }
        }
    }

    log_info(&format!(
        "[History] Level for {} = {} (from match {})",
        &target_puuid[..8.min(target_puuid.len())],
        level,
        match_id
    ));
    Ok(serde_json::json!({"level": level, "matchId": match_id}).to_string())
}

pub fn resolve_player_names(
    state: &Mutex<ConnectionState>,
    puuids: Vec<String>,
) -> Result<String, String> {
    let (access_token, entitlements, _, _, shard, client_version) = get_glz_creds(state)?;
    let body = serde_json::json!(puuids).to_string();
    let raw = super::http::pd_put(
        &shard,
        "/name-service/v2/players",
        &body,
        &access_token,
        &entitlements,
        &client_version,
    )?;
    let names: Vec<serde_json::Value> =
        serde_json::from_str(&raw).map_err(|e| format!("Parse names: {}", e))?;
    let mut result = Vec::new();
    for n in names {
        result.push(serde_json::json!({
            "puuid": n["Subject"].as_str().unwrap_or_default(),
            "name": n["GameName"].as_str().unwrap_or_default(),
            "tag": n["TagLine"].as_str().unwrap_or_default(),
        }));
    }
    Ok(serde_json::json!(result).to_string())
}
