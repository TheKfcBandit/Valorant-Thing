// Per-match raw `/match-details/v1/matches/{match_id}` responses, keyed by
// match_id. Lets the match-details modal render any previously-fetched match
// while Valorant is closed and no OAuth session is active — the endpoint
// itself is immutable post-match, so a hit is always safe to serve.
//
// Storage/persistence/corrupt-rescue are inherited from value_cache::Cache.

use std::collections::HashMap;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::value_cache::Cache;

// Newtype rather than `pub type` so this cache has a distinct TypeId from
// rr_cache::RrCache, which also wraps Cache<HashMap<String, Value>>. Tauri's
// `.manage()` panics on duplicate TypeId at startup.
pub struct MatchDetailsCache(Cache<HashMap<String, Value>>);

impl std::ops::Deref for MatchDetailsCache {
    type Target = Cache<HashMap<String, Value>>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub fn new_cache() -> MatchDetailsCache {
    MatchDetailsCache(Cache::new(
        "match-details-cache.json",
        "[MatchDetailsCache]",
    ))
}

pub fn get(
    app: &AppHandle,
    cache: &MatchDetailsCache,
    match_id: &str,
) -> Result<Option<Value>, String> {
    cache.read(app, |map| map.get(match_id).cloned())
}

// #37: one death event extracted from a cached match-details payload, ready
// for the heatmap overlay. Coordinate space is Riot's internal world coords;
// the frontend translates them to map-image pixels via the per-map
// xMultiplier / yMultiplier / xScalarToAdd / yScalarToAdd from
// valorant-api.com/v1/maps.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathEvent {
    pub match_id: String,
    pub map_id: String,
    pub queue_id: String,
    pub round_num: u64,
    pub date_ms: i64,
    pub x: f64,
    pub y: f64,
    pub killer_puuid: String,
    pub killer_agent: String,
    pub weapon_id: String,
    pub is_secondary: bool,
    pub damage_type: String,
}

#[tauri::command]
pub async fn get_death_locations(
    app: AppHandle,
    cache: tauri::State<'_, MatchDetailsCache>,
    player_puuid: String,
) -> Result<String, String> {
    let events = cache.read(&app, |map| extract_deaths(map, &player_puuid))?;
    serde_json::to_string(&events).map_err(|e| e.to_string())
}

// #11: per-friend match summary extracted from the same cache. Same shape
// as the SQLite match_history rows the self tracker score consumes, so
// the frontend feeds both into the identical computeTrackerScore() path.
// camelCase to match the SQLite row shape and the JS-side contract in
// src/utils/trackerScore.js (aggregateMatches reads m.queueId, m.won…).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMatchSummary {
    pub match_id: String,
    pub date_ms: i64,
    pub queue_id: String,
    pub won: bool,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
}

#[tauri::command]
pub async fn get_player_match_summaries(
    app: AppHandle,
    cache: tauri::State<'_, MatchDetailsCache>,
    puuids: Vec<String>,
) -> Result<String, String> {
    let want: std::collections::HashSet<String> = puuids.iter().map(|p| p.to_lowercase()).collect();
    let by_puuid = cache.read(&app, |map| extract_summaries(map, &want))?;
    serde_json::to_string(&by_puuid).map_err(|e| e.to_string())
}

fn extract_summaries(
    map: &HashMap<String, Value>,
    want: &std::collections::HashSet<String>,
) -> HashMap<String, Vec<PlayerMatchSummary>> {
    let mut out: HashMap<String, Vec<PlayerMatchSummary>> = HashMap::new();
    if want.is_empty() {
        return out;
    }
    for (match_id, detail) in map {
        let info = &detail["matchInfo"];
        let queue_id = info["queueID"]
            .as_str()
            .or_else(|| info["queueId"].as_str())
            .unwrap_or("")
            .to_string();
        let date_ms = info["gameStartMillis"].as_i64().unwrap_or(0);

        // Build team_id -> won lookup once per match.
        let mut won_by_team: HashMap<String, bool> = HashMap::new();
        if let Some(teams) = detail["teams"].as_array() {
            for t in teams {
                if let Some(team_id) = t["teamId"].as_str() {
                    won_by_team.insert(team_id.to_lowercase(), t["won"].as_bool().unwrap_or(false));
                }
            }
        }

        let players = match detail["players"].as_array() {
            Some(p) => p,
            None => continue,
        };
        for p in players {
            let subject = match p["subject"].as_str() {
                Some(s) => s.to_lowercase(),
                None => continue,
            };
            if !want.contains(&subject) {
                continue;
            }
            let team = p["teamId"].as_str().unwrap_or("").to_lowercase();
            let stats = &p["stats"];
            let summary = PlayerMatchSummary {
                match_id: match_id.clone(),
                date_ms,
                queue_id: queue_id.clone(),
                won: *won_by_team.get(&team).unwrap_or(&false),
                kills: stats["kills"].as_i64().unwrap_or(0),
                deaths: stats["deaths"].as_i64().unwrap_or(0),
                assists: stats["assists"].as_i64().unwrap_or(0),
            };
            out.entry(subject).or_default().push(summary);
        }
    }
    out
}

// Iterate every cached match and pull out the rounds where the target
// player died. The cache only contains matches that the user has opened
// (the match-details modal populates it on demand) — for v1 we accept the
// "open some matches first" empty-state and let the data accumulate as the
// user uses the app. A future PR could backfill via match_history::
// get_match_page's batch results.
fn extract_deaths(map: &HashMap<String, Value>, player_puuid: &str) -> Vec<DeathEvent> {
    let mut out = Vec::new();
    for (match_id, detail) in map {
        let info = &detail["matchInfo"];
        let map_id = info["mapId"].as_str().unwrap_or("").to_string();
        let queue_id = info["queueID"]
            .as_str()
            .or_else(|| info["queueId"].as_str())
            .unwrap_or("")
            .to_string();
        let date_ms = info["gameStartMillis"].as_i64().unwrap_or(0);

        // puuid -> characterId so each death can label the killer's agent
        // without the frontend re-walking `players` per row.
        let mut agent_by_puuid: HashMap<String, String> = HashMap::new();
        if let Some(players) = detail["players"].as_array() {
            for p in players {
                if let (Some(s), Some(c)) = (p["subject"].as_str(), p["characterId"].as_str()) {
                    agent_by_puuid.insert(s.to_string(), c.to_lowercase());
                }
            }
        }

        let rounds = match detail["roundResults"].as_array() {
            Some(r) => r,
            None => continue,
        };
        for round in rounds {
            let round_num = round["roundNum"].as_u64().unwrap_or(0);
            let pstats = match round["playerStats"].as_array() {
                Some(p) => p,
                None => continue,
            };
            for stat in pstats {
                let kills = match stat["kills"].as_array() {
                    Some(k) => k,
                    None => continue,
                };
                for k in kills {
                    if k["victim"].as_str() != Some(player_puuid) {
                        continue;
                    }
                    let loc = &k["victimLocation"];
                    let killer = k["killer"].as_str().unwrap_or("").to_string();
                    let killer_agent = agent_by_puuid.get(&killer).cloned().unwrap_or_default();
                    let fd = &k["finishingDamage"];
                    out.push(DeathEvent {
                        match_id: match_id.clone(),
                        map_id: map_id.clone(),
                        queue_id: queue_id.clone(),
                        round_num,
                        date_ms,
                        x: loc["x"].as_f64().unwrap_or(0.0),
                        y: loc["y"].as_f64().unwrap_or(0.0),
                        killer_puuid: killer,
                        killer_agent,
                        weapon_id: fd["damageItem"].as_str().unwrap_or("").to_lowercase(),
                        is_secondary: fd["isSecondaryFireMode"].as_bool().unwrap_or(false),
                        damage_type: fd["damageType"].as_str().unwrap_or("Weapon").to_string(),
                    });
                }
            }
        }
    }
    out
}

pub fn put(
    app: &AppHandle,
    cache: &MatchDetailsCache,
    match_id: &str,
    payload: Value,
) -> Result<(), String> {
    // Schema sniff: every real /match-details response carries both
    // `matchInfo` and `players`. Anything else (Riot error envelopes,
    // partial bodies, 200-shaped failure responses) parses as valid JSON
    // but would poison the cache for the entire process lifetime since
    // we have no TTL or invalidation hook. Refuse to persist; the caller
    // still returns the raw body to the frontend, just nothing's cached.
    if payload.get("matchInfo").is_none() || payload.get("players").is_none() {
        return Err("payload missing matchInfo/players — refusing to cache".to_string());
    }

    cache.write(app, |map| {
        // Mirror rr_cache::rr_history_put_many: only persist when something
        // actually changed. Repeat opens of the same modal then don't
        // re-serialize the whole HashMap to disk on every miss-through.
        let unchanged = map.get(match_id) == Some(&payload);
        map.insert(match_id.to_string(), payload);
        ((), !unchanged)
    })
}
