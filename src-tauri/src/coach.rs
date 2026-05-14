// AI Coach — calls a user-configured LLM provider with the most recent
// match summary plus a small history window, returning coaching tips.
//
// Privacy: nothing is stored or sent on the app's behalf. The user supplies
// their own API key; match data is sent only to the user's chosen provider.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize)]
pub struct CoachRequest {
    pub provider: String, // "anthropic" | "openai" | "openai-compat"
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>, // for openai-compat
    pub recent_matches: Vec<Value>,
}

#[derive(Serialize)]
pub struct CoachResponse {
    pub tips: String,
    pub raw: Option<Value>,
}

fn is_valid_match(m: &Value) -> bool {
    // Require at least the K/D/A trio so the prompt isn't padded with all-zeros
    // rows from malformed cache entries (which would silently degrade tips).
    m.get("kills").and_then(|v| v.as_u64()).is_some()
        && m.get("deaths").and_then(|v| v.as_u64()).is_some()
        && m.get("assists").and_then(|v| v.as_u64()).is_some()
}

fn build_user_prompt(matches: &[Value]) -> (String, usize) {
    let mut s = String::new();
    let mut skipped = 0usize;
    s.push_str("You are an experienced Valorant coach. Analyze the player's recent matches and provide 3-5 short, specific, actionable tips. Focus on concrete patterns visible in the data (agent choices, win rates, KDA trends, map performance). Be direct, no fluff. Format as a numbered list.\n\n");
    s.push_str("Recent matches (most recent first):\n");
    let mut idx = 0;
    for m in matches.iter().take(10) {
        if !is_valid_match(m) {
            skipped += 1;
            continue;
        }
        idx += 1;
        s.push_str(&format!(
            "{}. Map={}  Agent={}  Queue={}  K/D/A={}/{}/{}  Rounds={}-{}  Result={}\n",
            idx,
            m["map"].as_str().unwrap_or("?"),
            m["agent"].as_str().unwrap_or("?"),
            m["queueId"].as_str().unwrap_or("?"),
            m["kills"].as_u64().unwrap_or(0),
            m["deaths"].as_u64().unwrap_or(0),
            m["assists"].as_u64().unwrap_or(0),
            m["roundsWon"].as_u64().unwrap_or(0),
            m["roundsLost"].as_u64().unwrap_or(0),
            if m["won"].as_bool().unwrap_or(false) { "WIN" } else { "LOSS" },
        ));
    }
    (s, skipped)
}

async fn call_anthropic(api_key: &str, model: &str, prompt: &str) -> Result<(String, Value), String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    });
    let res = client.post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send().await
        .map_err(|e| format!("anthropic request: {}", e))?;
    let status = res.status();
    let json: Value = res.json().await.map_err(|e| format!("anthropic parse: {}", e))?;
    if !status.is_success() {
        return Err(json["error"]["message"].as_str().unwrap_or("Anthropic error").to_string());
    }
    let text = json["content"][0]["text"].as_str().unwrap_or("").to_string();
    Ok((text, json))
}

async fn call_openai_like(api_key: &str, model: &str, base_url: &str, prompt: &str) -> Result<(String, Value), String> {
    let client = reqwest::Client::new();
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    });
    let res = client.post(&url)
        .bearer_auth(api_key)
        .header("content-type", "application/json")
        .json(&body)
        .send().await
        .map_err(|e| format!("openai request: {}", e))?;
    let status = res.status();
    let json: Value = res.json().await.map_err(|e| format!("openai parse: {}", e))?;
    if !status.is_success() {
        return Err(json["error"]["message"].as_str().unwrap_or("OpenAI error").to_string());
    }
    let text = json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
    Ok((text, json))
}

#[tauri::command]
pub async fn coach_analyze(req: CoachRequest) -> Result<CoachResponse, String> {
    if req.api_key.trim().is_empty() {
        return Err("API key is required".to_string());
    }
    if req.recent_matches.is_empty() {
        return Err("No recent matches to analyze. Play a few games and try again.".to_string());
    }
    let (prompt, skipped) = build_user_prompt(&req.recent_matches);
    if skipped > 0 {
        eprintln!("[Coach] Skipped {} malformed match entries (missing K/D/A)", skipped);
    }
    if !prompt.contains("1. Map=") {
        return Err("All recent matches were malformed (missing K/D/A). Try again later.".to_string());
    }
    let (tips, raw) = match req.provider.as_str() {
        "anthropic" => call_anthropic(&req.api_key, &req.model, &prompt).await?,
        "openai" => call_openai_like(&req.api_key, &req.model, "https://api.openai.com", &prompt).await?,
        "openai-compat" => {
            let base = req.base_url.as_deref().unwrap_or("");
            if base.is_empty() {
                return Err("openai-compat requires base_url".to_string());
            }
            call_openai_like(&req.api_key, &req.model, base, &prompt).await?
        }
        other => return Err(format!("Unknown provider: {}", other)),
    };
    Ok(CoachResponse { tips, raw: Some(raw) })
}
