use std::sync::Mutex;

use super::auth::get_glz_creds;
use super::logging::log_info;
use super::pd_session::pd_get_authed;
use super::types::ConnectionState;

// #22: actual in-act peak. `season.CompetitiveTier` is end-of-act, so a player
// who hit P3 mid-act but finished at P2 has CompetitiveTier=16 forever. The
// real peak is the highest tier in `WinsByTier` with a non-zero win count.
// Fall back to CompetitiveTier if WinsByTier is missing (older acts, edge
// cases) so we never regress below the previous behavior.
fn act_peak_tier(season: &serde_json::Value) -> u64 {
    let mut peak: u64 = 0;
    if let Some(map) = season["WinsByTier"].as_object() {
        for (tier_str, wins) in map {
            if wins.as_u64().unwrap_or(0) == 0 {
                continue;
            }
            if let Ok(t) = tier_str.parse::<u64>() {
                if t > peak {
                    peak = t;
                }
            }
        }
    }
    if peak == 0 {
        peak = season["CompetitiveTier"].as_u64().unwrap_or(0);
    }
    peak
}

pub fn get_home_stats(
    state: &Mutex<ConnectionState>,
    _queue_filter: &str,
) -> Result<String, String> {
    // `get_glz_creds` is still useful here for the early "Not connected"
    // gate and to grab `puuid` for path construction — the wrapper would
    // surface the same error on the first attempt, but a single up-front
    // check is cleaner than three.
    let (_, _, puuid, _region, _, _) = get_glz_creds(state)?;

    // MMR endpoint can return non-JSON for accounts with no comp history,
    // brief Riot 5xx blips, or token-edge cases. Match the same resilience
    // the loadout / xp fetches below already have: log the failure but
    // continue with zeroed defaults so HomePage still renders the rest.
    let mmr_path = format!("/mmr/v1/players/{}", puuid);
    let mmr: serde_json::Value = match pd_get_authed(state, &mmr_path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|e| {
            log_info(&format!(
                "[Home] mmr parse failed ({}), falling back to defaults",
                e
            ));
            serde_json::Value::Null
        }),
        Err(e) => {
            log_info(&format!(
                "[Home] mmr fetch failed ({}), falling back to defaults",
                e
            ));
            serde_json::Value::Null
        }
    };

    let current_tier = mmr["LatestCompetitiveUpdate"]["TierAfterUpdate"]
        .as_u64()
        .unwrap_or(0);
    let current_rr = mmr["LatestCompetitiveUpdate"]["RankedRatingAfterUpdate"]
        .as_u64()
        .unwrap_or(0);

    let mut peak_tier: u64 = 0;
    let mut comp_wins: u64 = 0;
    let mut comp_games: u64 = 0;
    if let Some(seasons) = mmr["QueueSkills"]["competitive"]["SeasonalInfoBySeasonID"].as_object() {
        for (_id, season) in seasons {
            let act_peak = act_peak_tier(season);
            if act_peak > peak_tier {
                peak_tier = act_peak;
            }
            comp_wins += season["NumberOfWinsWithPlacements"].as_u64().unwrap_or(0);
            comp_games += season["NumberOfGames"].as_u64().unwrap_or(0);
        }
    }

    let loadout_path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    let mut card_id = String::new();
    if let Ok(loadout_raw) = pd_get_authed(state, &loadout_path) {
        if let Ok(loadout) = serde_json::from_str::<serde_json::Value>(&loadout_raw) {
            card_id = loadout["Identity"]["PlayerCardID"]
                .as_str()
                .unwrap_or("")
                .to_string();
        }
    }

    let mut account_level: u64 = 0;
    let xp_path = format!("/account-xp/v1/players/{}", puuid);
    if let Ok(xp_raw) = pd_get_authed(state, &xp_path) {
        if let Ok(xp) = serde_json::from_str::<serde_json::Value>(&xp_raw) {
            account_level = xp["Progress"]["Level"].as_u64().unwrap_or(0);
        }
    }

    Ok(serde_json::json!({
        "level": account_level,
        "cardId": card_id,
        "currentTier": current_tier,
        "currentRR": current_rr,
        "peakTier": peak_tier,
        "wins": comp_wins,
        "losses": comp_games.saturating_sub(comp_wins),
        "totalGames": comp_games,
    })
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // #22 case: P3 (tier 17) hit mid-act, finished at P2 (tier 16).
    #[test]
    fn act_peak_uses_wins_by_tier_over_end_of_act() {
        let season = json!({
            "CompetitiveTier": 16,
            "WinsByTier": { "16": 5, "17": 2 },
        });
        assert_eq!(act_peak_tier(&season), 17);
    }

    #[test]
    fn act_peak_ignores_zero_win_tiers() {
        // Riot sometimes leaves placeholder entries with 0 wins.
        let season = json!({
            "CompetitiveTier": 14,
            "WinsByTier": { "14": 10, "20": 0, "25": 0 },
        });
        assert_eq!(act_peak_tier(&season), 14);
    }

    #[test]
    fn act_peak_falls_back_to_competitive_tier_when_wins_by_tier_missing() {
        // Older acts may not include WinsByTier at all.
        let season = json!({ "CompetitiveTier": 13 });
        assert_eq!(act_peak_tier(&season), 13);
    }

    #[test]
    fn act_peak_falls_back_when_wins_by_tier_all_zero() {
        let season = json!({
            "CompetitiveTier": 12,
            "WinsByTier": { "12": 0, "13": 0 },
        });
        assert_eq!(act_peak_tier(&season), 12);
    }

    #[test]
    fn act_peak_handles_unparseable_tier_keys() {
        // Defensive: ignore malformed keys without crashing.
        let season = json!({
            "CompetitiveTier": 10,
            "WinsByTier": { "garbage": 5, "11": 3 },
        });
        assert_eq!(act_peak_tier(&season), 11);
    }
}
