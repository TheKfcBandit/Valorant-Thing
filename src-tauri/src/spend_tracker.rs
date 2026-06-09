use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::riot::logging::{log_error, log_info};
use crate::riot::{self, ConnectionState};
use crate::util::now_ms;
use crate::value_cache::Cache;

const SKIN_LEVEL_ITEM_TYPE: &str = "3ad1b2b2-acdb-4524-852f-954a76ddae0a";
const COST_VP: &str = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
const COST_RP: &str = "e59aa87c-4cbf-517a-5983-6e81511be9b7";
const COST_KC: &str = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d";

#[derive(Default, Serialize, Deserialize)]
pub struct SpendData {
    tracking_since_ms: Option<i64>,
    last_owned: HashSet<String>,
    purchases: Vec<Purchase>,
    offer_cache: HashMap<String, OfferCost>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Purchase {
    skin_level_uuid: String,
    date_ms: i64,
    vp: u64,
    rp: u64,
    kc: u64,
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct OfferCost {
    vp: u64,
    rp: u64,
    kc: u64,
}

pub type SpendTrackerCache = Cache<SpendData>;

pub fn new_cache() -> SpendTrackerCache {
    Cache::new("spend-tracker.json", "[Spend]")
}

fn parse_owned_skin_levels(json: &Value) -> HashSet<String> {
    let mut out = HashSet::new();
    if let Some(arr) = json["Entitlements"].as_array() {
        for e in arr {
            if let Some(id) = e["ItemID"].as_str() {
                out.insert(id.to_lowercase());
            }
        }
    } else if let Some(groups) = json["EntitlementsByTypes"].as_array() {
        for g in groups {
            if let Some(arr) = g["Entitlements"].as_array() {
                for e in arr {
                    if let Some(id) = e["ItemID"].as_str() {
                        out.insert(id.to_lowercase());
                    }
                }
            }
        }
    }
    out
}

fn fetch_owned_skin_levels(state: &Mutex<ConnectionState>) -> Result<HashSet<String>, String> {
    let raw = riot::get_owned_items(state, SKIN_LEVEL_ITEM_TYPE)?;
    let json: Value = serde_json::from_str(&raw).map_err(|e| format!("parse owned: {}", e))?;
    Ok(parse_owned_skin_levels(&json))
}

fn fetch_offer_catalog(
    state: &Mutex<ConnectionState>,
) -> Result<HashMap<String, OfferCost>, String> {
    let (access_token, entitlements, shard, client_version) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        if !s.connected {
            return Err("Not connected".to_string());
        }
        (
            s.access_token.clone().ok_or("No access_token")?,
            s.entitlements.clone().ok_or("No entitlements")?,
            s.shard.clone().ok_or("No shard")?,
            s.client_version.clone().ok_or("No client_version")?,
        )
    };
    let raw = riot::pd_get(
        &shard,
        "/store/v1/offers/",
        &access_token,
        &entitlements,
        &client_version,
    )?;
    let json: Value = serde_json::from_str(&raw).map_err(|e| format!("parse offers: {}", e))?;
    let mut by_reward_id: HashMap<String, OfferCost> = HashMap::new();
    if let Some(offers) = json["Offers"].as_array() {
        for offer in offers {
            let cost = &offer["Cost"];
            let oc = OfferCost {
                vp: cost[COST_VP].as_u64().unwrap_or(0),
                rp: cost[COST_RP].as_u64().unwrap_or(0),
                kc: cost[COST_KC].as_u64().unwrap_or(0),
            };
            if let Some(rewards) = offer["Rewards"].as_array() {
                for r in rewards {
                    if let Some(item_id) = r["ItemID"].as_str() {
                        // Keep the cheapest occurrence (skin levels can show up in bundles too).
                        let key = item_id.to_lowercase();
                        let prefer_new = match by_reward_id.get(&key) {
                            Some(existing) => existing.vp == 0 && oc.vp > 0,
                            None => true,
                        };
                        if prefer_new {
                            by_reward_id.insert(key, oc.clone());
                        }
                    }
                }
            }
        }
    }
    Ok(by_reward_id)
}

fn build_summary(d: &SpendData, now: i64, new_since_last: usize) -> Value {
    let (vp_total, rp_total, kc_total) = d.purchases.iter().fold((0u64, 0u64, 0u64), |acc, p| {
        (acc.0 + p.vp, acc.1 + p.rp, acc.2 + p.kc)
    });
    let month_cutoff = now - 30 * 24 * 3600 * 1000;
    let (vp_month, rp_month) = d
        .purchases
        .iter()
        .filter(|p| p.date_ms >= month_cutoff)
        .fold((0u64, 0u64), |acc, p| (acc.0 + p.vp, acc.1 + p.rp));

    serde_json::json!({
        "trackingSinceMs": d.tracking_since_ms,
        "purchases": d.purchases,
        "vpSpent": vp_total,
        "rpSpent": rp_total,
        "kcSpent": kc_total,
        "thisMonthVp": vp_month,
        "thisMonthRp": rp_month,
        "newSinceLast": new_since_last,
    })
}

#[tauri::command]
pub async fn get_spend_summary(
    app: AppHandle,
    state: tauri::State<'_, std::sync::Arc<Mutex<ConnectionState>>>,
    spend: tauri::State<'_, SpendTrackerCache>,
) -> Result<Value, String> {
    let state_for_owned = std::sync::Arc::clone(&state);
    let owned =
        tauri::async_runtime::spawn_blocking(move || fetch_owned_skin_levels(&state_for_owned))
            .await
            .map_err(|e| format!("Task failed: {}", e))??;

    let (had_prior, new_items) = spend.read(&app, |d| {
        let had = d.tracking_since_ms.is_some();
        let news: Vec<String> = owned
            .iter()
            .filter(|id| !d.last_owned.contains(*id))
            .cloned()
            .collect();
        (had, news)
    })?;

    // First-ever snapshot: just baseline, no purchases.
    if !had_prior {
        let since = now_ms();
        spend.write(&app, |d| {
            d.tracking_since_ms = Some(since);
            d.last_owned = owned;
            ((), true)
        })?;
        log_info("[Spend] First-ever baseline snapshot taken — tracking starts now");
        return Ok(serde_json::json!({
            "trackingSinceMs": since,
            "purchases": Value::Array(vec![]),
            "vpSpent": 0,
            "rpSpent": 0,
            "kcSpent": 0,
            "thisMonthVp": 0,
            "thisMonthRp": 0,
            "newSinceLast": 0,
        }));
    }

    // Fetch catalog only if there's something new and it's not all cached.
    if !new_items.is_empty() {
        let need_catalog = spend.read(&app, |d| {
            new_items.iter().any(|id| !d.offer_cache.contains_key(id))
        })?;
        if need_catalog {
            let state_for_cat = std::sync::Arc::clone(&state);
            let catalog =
                tauri::async_runtime::spawn_blocking(move || fetch_offer_catalog(&state_for_cat))
                    .await
                    .map_err(|e| format!("Task failed: {}", e))?;
            match catalog {
                Ok(cat) => {
                    // No persist here: the purchases write below always
                    // follows on this path and commits the merged cache.
                    spend.write(&app, |d| {
                        for (k, v) in cat {
                            d.offer_cache.insert(k, v);
                        }
                        ((), false)
                    })?;
                }
                Err(e) => log_error(&format!("[Spend] catalog fetch failed: {}", e)),
            }
        }
    }

    // Apply purchases.
    let now = now_ms();
    spend.write(&app, |d| {
        for id in &new_items {
            let oc = d.offer_cache.get(id).cloned().unwrap_or_default();
            d.purchases.push(Purchase {
                skin_level_uuid: id.clone(),
                date_ms: now,
                vp: oc.vp,
                rp: oc.rp,
                kc: oc.kc,
            });
        }
        d.last_owned = owned;
        ((), true)
    })?;

    spend.read(&app, |d| build_summary(d, now, new_items.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_owned_skin_levels_handles_flat_entitlements_shape() {
        let json = serde_json::json!({
            "Entitlements": [
                { "ItemID": "AAAA-1111" },
                { "ItemID": "bbbb-2222" },
                { "NotAnItem": true }
            ]
        });
        let owned = parse_owned_skin_levels(&json);
        assert_eq!(owned.len(), 2);
        assert!(owned.contains("aaaa-1111"), "ids must be lowercased");
        assert!(owned.contains("bbbb-2222"));
    }

    #[test]
    fn parse_owned_skin_levels_handles_grouped_shape() {
        let json = serde_json::json!({
            "EntitlementsByTypes": [
                { "Entitlements": [{ "ItemID": "CCCC-3333" }] },
                { "Entitlements": [{ "ItemID": "dddd-4444" }] }
            ]
        });
        let owned = parse_owned_skin_levels(&json);
        assert_eq!(owned.len(), 2);
        assert!(owned.contains("cccc-3333"));
    }

    #[test]
    fn parse_owned_skin_levels_returns_empty_on_unknown_shape() {
        assert!(parse_owned_skin_levels(&serde_json::json!({})).is_empty());
        assert!(parse_owned_skin_levels(&serde_json::json!({ "Entitlements": "nope" })).is_empty());
    }

    #[test]
    fn build_summary_folds_totals_and_30_day_window() {
        let now: i64 = 100 * 24 * 3600 * 1000;
        let cutoff = now - 30 * 24 * 3600 * 1000;
        let d = SpendData {
            tracking_since_ms: Some(1),
            last_owned: HashSet::new(),
            purchases: vec![
                Purchase {
                    skin_level_uuid: "old".into(),
                    date_ms: cutoff - 1,
                    vp: 1000,
                    rp: 10,
                    kc: 1,
                },
                Purchase {
                    skin_level_uuid: "edge".into(),
                    date_ms: cutoff,
                    vp: 2000,
                    rp: 20,
                    kc: 2,
                },
                Purchase {
                    skin_level_uuid: "new".into(),
                    date_ms: now,
                    vp: 4000,
                    rp: 40,
                    kc: 4,
                },
            ],
            offer_cache: HashMap::new(),
        };
        let summary = build_summary(&d, now, 1);
        assert_eq!(summary["vpSpent"], 7000);
        assert_eq!(summary["rpSpent"], 70);
        assert_eq!(summary["kcSpent"], 7);
        // The cutoff is inclusive (>=), so "edge" counts toward the month.
        assert_eq!(summary["thisMonthVp"], 6000);
        assert_eq!(summary["thisMonthRp"], 60);
        assert_eq!(summary["newSinceLast"], 1);
        assert_eq!(summary["trackingSinceMs"], 1);
    }

    #[test]
    fn spend_data_on_disk_shape_is_stable() {
        // Pins the JSON field names so the Cache<SpendData> migration (and
        // any future refactor) can't silently orphan existing spend files.
        let json = r#"{
            "tracking_since_ms": 42,
            "last_owned": ["aaaa"],
            "purchases": [
                { "skin_level_uuid": "aaaa", "date_ms": 7, "vp": 100, "rp": 0, "kc": 0 }
            ],
            "offer_cache": { "aaaa": { "vp": 100, "rp": 0, "kc": 0 } }
        }"#;
        let d: SpendData = serde_json::from_str(json).expect("legacy shape must parse");
        assert_eq!(d.tracking_since_ms, Some(42));
        assert_eq!(d.purchases.len(), 1);
        assert_eq!(d.purchases[0].vp, 100);

        let back = serde_json::to_string(&d).unwrap();
        for field in [
            "tracking_since_ms",
            "last_owned",
            "purchases",
            "skin_level_uuid",
            "date_ms",
            "offer_cache",
        ] {
            assert!(back.contains(field), "serialized output lost field {field}");
        }
    }
}
