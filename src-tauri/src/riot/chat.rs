use std::sync::Mutex;

use super::auth::{get_glz_creds, get_local_creds};
use super::http::{glz_get, local_get, local_post};
use super::logging::log_info;
use super::types::ConnectionState;

pub fn get_chat_conversations(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (port, auth) = get_local_creds(state)?;
    let raw = local_get(port, &auth, "/chat/v6/conversations")?;
    let all: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::json!({}));
    let convs = all["conversations"].as_array().cloned().unwrap_or_default();

    let my_puuid = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.puuid.clone().unwrap_or_default()
    };

    let mut muc_labels: std::collections::HashMap<String, (String, String)> =
        std::collections::HashMap::new();
    if let Ok((at, ent, puuid, region, shard, cv)) = get_glz_creds(state) {
        if let Ok(pr) = glz_get(
            &region,
            &shard,
            &format!("/parties/v1/players/{}", puuid),
            &at,
            &ent,
            &cv,
        ) {
            if let Ok(pj) = serde_json::from_str::<serde_json::Value>(&pr) {
                if let Some(pid) = pj["CurrentPartyID"].as_str().filter(|s| !s.is_empty()) {
                    if let Ok(party_raw) = glz_get(
                        &region,
                        &shard,
                        &format!("/parties/v1/parties/{}", pid),
                        &at,
                        &ent,
                        &cv,
                    ) {
                        if let Ok(party) = serde_json::from_str::<serde_json::Value>(&party_raw) {
                            if let Some(muc) = party["MUCName"].as_str().filter(|s| !s.is_empty()) {
                                muc_labels.insert(
                                    muc.to_string(),
                                    ("ares-parties".into(), "Party".into()),
                                );
                            }
                        }
                    }
                }
            }
        }
        for (player_path, match_prefix, phase) in &[
            (
                format!("/pregame/v1/players/{}", puuid),
                "/pregame/v1/matches/",
                "pregame",
            ),
            (
                format!("/core-game/v1/players/{}", puuid),
                "/core-game/v1/matches/",
                "coregame",
            ),
        ] {
            if let Ok(pr) = glz_get(&region, &shard, player_path, &at, &ent, &cv) {
                if let Ok(pj) = serde_json::from_str::<serde_json::Value>(&pr) {
                    if let Some(mid) = pj["MatchID"].as_str().filter(|s| !s.is_empty()) {
                        if let Ok(mr) = glz_get(
                            &region,
                            &shard,
                            &format!("{}{}", match_prefix, mid),
                            &at,
                            &ent,
                            &cv,
                        ) {
                            if let Ok(mj) = serde_json::from_str::<serde_json::Value>(&mr) {
                                let ares = format!("ares-{}", phase);
                                if let Some(m) = mj["MUCName"].as_str().filter(|s| !s.is_empty()) {
                                    muc_labels
                                        .insert(m.to_string(), (ares.clone(), "Team Chat".into()));
                                }
                                if let Some(m) = mj["AllMUCName"].as_str().filter(|s| !s.is_empty())
                                {
                                    muc_labels
                                        .insert(m.to_string(), (ares.clone(), "All Chat".into()));
                                }
                                if let Some(m) =
                                    mj["TeamMUCName"].as_str().filter(|s| !s.is_empty())
                                {
                                    muc_labels
                                        .insert(m.to_string(), (ares.clone(), "Team Chat".into()));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut result = Vec::new();
    let mut seen_mucs = std::collections::HashSet::new();

    for c in &convs {
        let cid = match c["cid"].as_str() {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };
        let mut conv = c.clone();
        let cid_prefix = cid.split('@').next().unwrap_or("");
        if let Some((muc_key, (chat_type, display))) = muc_labels.iter().find(|(muc, _)| {
            let muc_prefix = muc.split('@').next().unwrap_or("");
            cid == muc.as_str() || cid_prefix == muc_prefix
        }) {
            conv["chat_type"] = serde_json::json!(chat_type);
            conv["display_name"] = serde_json::json!(display);
            seen_mucs.insert(muc_key.clone());
        } else {
            let encoded = cid.replace("@", "%40");
            if let Ok(pr) = local_get(
                port,
                &auth,
                &format!("/chat/v6/conversations/{}/participants", encoded),
            ) {
                if let Ok(pv) = serde_json::from_str::<serde_json::Value>(&pr) {
                    let parts = pv["participants"]
                        .as_array()
                        .or_else(|| pv.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let names: Vec<String> = parts
                        .iter()
                        .filter_map(|p| {
                            let pid = p["puuid"].as_str().unwrap_or("");
                            if pid == my_puuid {
                                return None;
                            }
                            let gn = p["game_name"].as_str().unwrap_or("");
                            let gt = p["game_tag"].as_str().unwrap_or("");
                            if !gn.is_empty() {
                                Some(format!("{}#{}", gn, gt))
                            } else {
                                None
                            }
                        })
                        .collect();
                    if !names.is_empty() {
                        conv["display_name"] = serde_json::json!(names.join(", "));
                    }
                }
            }
        }
        result.push(conv);
    }

    for (muc_cid, (chat_type, display)) in &muc_labels {
        if !seen_mucs.contains(muc_cid) {
            result.push(serde_json::json!({
                "cid": muc_cid,
                "chat_type": chat_type,
                "display_name": display,
                "type": "groupchat",
                "direct_messages": false,
            }));
        }
    }

    log_info(&format!(
        "[Chat] {} conversations returned ({} from list, {} game MUCs added)",
        result.len(),
        convs.len(),
        result.len() - convs.len()
    ));

    Ok(serde_json::json!({ "conversations": result }).to_string())
}

pub fn get_chat_messages(state: &Mutex<ConnectionState>, cid: &str) -> Result<String, String> {
    let (port, auth) = get_local_creds(state)?;
    let encoded_cid = cid.replace("@", "%40");
    let path = format!("/chat/v6/conversations/{}/messages", encoded_cid);
    local_get(port, &auth, &path)
}

pub fn send_chat_message(
    state: &Mutex<ConnectionState>,
    cid: &str,
    message: &str,
    msg_type: &str,
) -> Result<String, String> {
    let (port, auth) = get_local_creds(state)?;
    let send_type = if msg_type.is_empty() {
        "chat"
    } else {
        msg_type
    };

    let mut cids_to_try = vec![cid.to_string()];
    if cid.contains("@ares-") {
        let prefix = cid.split('@').next().unwrap_or(cid);
        cids_to_try.push(format!("{}@br1.pvp.net", prefix));
        if cid.contains("@ares-parties") {
            cids_to_try.push("ares-parties".to_string());
        } else if cid.contains("@ares-pregame") {
            cids_to_try.push("ares-pregame".to_string());
        } else if cid.contains("@ares-coregame") {
            cids_to_try.push("ares-coregame".to_string());
        }
    }

    for try_cid in &cids_to_try {
        let body = serde_json::json!({
            "cid": try_cid,
            "message": message,
            "type": send_type
        })
        .to_string();
        log_info(&format!("[Chat] Try sending {} to {}", send_type, try_cid));
        if let Ok(raw) = local_post(port, &auth, "/chat/v6/messages", &body) {
            let lines: Vec<&str> = raw.splitn(2, '\n').collect();
            let status = lines
                .first()
                .and_then(|s| s.parse::<u16>().ok())
                .unwrap_or(0);
            let resp_body = lines.get(1).unwrap_or(&"").to_string();
            if status < 400 {
                log_info(&format!("[Chat] Send OK with cid={}", try_cid));
                return Ok(resp_body);
            }
            log_info(&format!(
                "[Chat] Failed ({}): {}",
                status,
                &resp_body[..resp_body.len().min(100)]
            ));
        }
    }
    Err(format!(
        "Chat send failed: all CID formats tried for {}",
        cid
    ))
}

pub fn get_chat_participants(state: &Mutex<ConnectionState>, cid: &str) -> Result<String, String> {
    let (port, auth) = get_local_creds(state)?;
    let encoded_cid = cid.replace("@", "%40");
    let path = format!("/chat/v6/conversations/{}/participants", encoded_cid);
    local_get(port, &auth, &path)
}
