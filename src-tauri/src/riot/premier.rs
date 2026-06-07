use std::sync::Mutex;

use super::pd_session::pd_get_authed;
use super::types::ConnectionState;

// #23: Premier roster + division placement. The v2 player endpoint returns
// either a team object (potentially nested under `Teams[]` or `Team`) when the
// user is enrolled, or an empty/sparse payload when they're not. We normalize
// to `{ enrolled: bool, team?: object }` so the frontend has a stable contract
// and doesn't have to repeat the same structural sniffing.
fn extract_premier_team(json: &serde_json::Value) -> Option<serde_json::Value> {
    if let Some(arr) = json.get("Teams").and_then(|v| v.as_array()) {
        return arr
            .iter()
            .find(|t| t.get("id").is_some() || t.get("ID").is_some())
            .cloned();
    }
    if let Some(team) = json.get("Team") {
        if team.get("id").is_some() || team.get("ID").is_some() {
            return Some(team.clone());
        }
    }
    if json.get("id").is_some() || json.get("ID").is_some() {
        return Some(json.clone());
    }
    None
}

pub fn get_premier_player(
    state: &Mutex<ConnectionState>,
    target_puuid: &str,
) -> Result<String, String> {
    let path = format!("/premier/v2/players/{}", target_puuid);
    let raw = pd_get_authed(state, &path)?;
    let json: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Parse Premier player: {}", e))?;
    let envelope = match extract_premier_team(&json) {
        Some(team) => serde_json::json!({ "enrolled": true, "team": team, "raw": json }),
        None => serde_json::json!({ "enrolled": false, "raw": json }),
    };
    Ok(envelope.to_string())
}

pub fn get_premier_division(
    state: &Mutex<ConnectionState>,
    division_id: &str,
) -> Result<String, String> {
    let path = format!("/premier/v1/divisions/{}", division_id);
    pd_get_authed(state, &path)
}

pub fn get_premier_conference(
    state: &Mutex<ConnectionState>,
    conference_id: &str,
) -> Result<String, String> {
    let path = format!("/premier/v1/conferences/{}", conference_id);
    pd_get_authed(state, &path)
}
