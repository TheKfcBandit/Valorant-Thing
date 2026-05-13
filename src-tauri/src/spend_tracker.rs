use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::riot::{self, ConnectionState};
use crate::riot::logging::{log_error, log_info};

const SKIN_LEVEL_ITEM_TYPE: &str = "3ad1b2b2-acdb-4524-852f-954a76ddae0a";
const COST_VP: &str = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
const COST_RP: &str = "e59aa87c-4cbf-517a-5983-6e81511be9b7";
const COST_KC: &str = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d";

#[derive(Default, Serialize, Deserialize)]
struct SpendData {
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

pub struct SpendState {
    data: SpendData,
    loaded: bool,
}

impl Default for SpendState {
    fn default() -> Self {
        Self { data: SpendData::default(), loaded: false }
    }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn spend_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("app_data_dir: {}", e))?;
    if !dir.exists() { std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?; }
    Ok(dir.join("spend-tracker.json"))
}

fn ensure_loaded(app: &AppHandle, state: &Mutex<SpendState>) -> Result<(), String> {
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.loaded { return Ok(()); }
    }
    let path = spend_path(app)?;
    let data: SpendData = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_else(|e| {
                log_error(&format!("[Spend] parse failed, starting empty: {}", e));
                SpendData::default()
            }),
            Err(_) => SpendData::default(),
        }
    } else {
        SpendData::default()
    };
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.data = data;
    s.loaded = true;
    Ok(())
}

fn persist(app: &AppHandle, state: &Mutex<SpendState>) -> Result<(), String> {
    let path = spend_path(app)?;
    let snapshot = {
        let s = state.lock().map_err(|e| e.to_string())?;
        serde_json::to_string(&s.data).map_err(|e| format!("serialize: {}", e))?
    };
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, snapshot).map_err(|e| format!("write tmp: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

fn fetch_owned_skin_levels(state: &Mutex<ConnectionState>) -> Result<HashSet<String>, String> {
    let raw = riot::get_owned_items(state, SKIN_LEVEL_ITEM_TYPE)?;
    let json: Value = serde_json::from_str(&raw).map_err(|e| format!("parse owned: {}", e))?;
    let mut out = HashSet::new();
    if let Some(arr) = json["Entitlements"].as_array() {
        for e in arr {
            if let Some(id) = e["ItemID"].as_str() { out.insert(id.to_lowercase()); }
        }
    } else if let Some(groups) = json["EntitlementsByTypes"].as_array() {
        for g in groups {
            if let Some(arr) = g["Entitlements"].as_array() {
                for e in arr {
                    if let Some(id) = e["ItemID"].as_str() { out.insert(id.to_lowercase()); }
                }
            }
        }
    }
    Ok(out)
}

fn fetch_offer_catalog(state: &Mutex<ConnectionState>) -> Result<HashMap<String, OfferCost>, String> {
    let (access_token, entitlements, shard, client_version) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        if !s.connected { return Err("Not connected".to_string()); }
        (
            s.access_token.clone().ok_or("No access_token")?,
            s.entitlements.clone().ok_or("No entitlements")?,
            s.shard.clone().ok_or("No shard")?,
            s.client_version.clone().ok_or("No client_version")?,
        )
    };
    let raw = riot::pd_get(&shard, "/store/v1/offers/", &access_token, &entitlements, &client_version)?;
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
                        if prefer_new { by_reward_id.insert(key, oc.clone()); }
                    }
                }
            }
        }
    }
    Ok(by_reward_id)
}

#[tauri::command]
pub async fn get_spend_summary(
    app: AppHandle,
    state: tauri::State<'_, std::sync::Arc<Mutex<ConnectionState>>>,
    spend: tauri::State<'_, Mutex<SpendState>>,
) -> Result<Value, String> {
    ensure_loaded(&app, &spend)?;

    let state_for_owned = std::sync::Arc::clone(&state);
    let owned = tauri::async_runtime::spawn_blocking(move || fetch_owned_skin_levels(&state_for_owned))
        .await
        .map_err(|e| format!("Task failed: {}", e))??;

    let (had_prior, new_items) = {
        let s = spend.lock().map_err(|e| e.to_string())?;
        let had = s.data.tracking_since_ms.is_some();
        let prior = &s.data.last_owned;
        let news: Vec<String> = owned.iter().filter(|id| !prior.contains(*id)).cloned().collect();
        (had, news)
    };

    // First-ever snapshot: just baseline, no purchases.
    if !had_prior {
        {
            let mut s = spend.lock().map_err(|e| e.to_string())?;
            s.data.tracking_since_ms = Some(now_ms());
            s.data.last_owned = owned;
        }
        persist(&app, &spend)?;
        log_info("[Spend] First-ever baseline snapshot taken — tracking starts now");
        return Ok(serde_json::json!({
            "trackingSinceMs": now_ms(),
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
        let need_catalog = {
            let s = spend.lock().map_err(|e| e.to_string())?;
            new_items.iter().any(|id| !s.data.offer_cache.contains_key(id))
        };
        if need_catalog {
            let state_for_cat = std::sync::Arc::clone(&state);
            let catalog = tauri::async_runtime::spawn_blocking(move || fetch_offer_catalog(&state_for_cat))
                .await
                .map_err(|e| format!("Task failed: {}", e))?;
            match catalog {
                Ok(cat) => {
                    let mut s = spend.lock().map_err(|e| e.to_string())?;
                    for (k, v) in cat { s.data.offer_cache.insert(k, v); }
                }
                Err(e) => log_error(&format!("[Spend] catalog fetch failed: {}", e)),
            }
        }
    }

    // Apply purchases.
    let now = now_ms();
    {
        let mut s = spend.lock().map_err(|e| e.to_string())?;
        for id in &new_items {
            let oc = s.data.offer_cache.get(id).cloned().unwrap_or_default();
            s.data.purchases.push(Purchase {
                skin_level_uuid: id.clone(),
                date_ms: now,
                vp: oc.vp,
                rp: oc.rp,
                kc: oc.kc,
            });
        }
        s.data.last_owned = owned;
    }
    persist(&app, &spend)?;

    // Build summary.
    let s = spend.lock().map_err(|e| e.to_string())?;
    let (vp_total, rp_total, kc_total) = s.data.purchases.iter()
        .fold((0u64, 0u64, 0u64), |acc, p| (acc.0 + p.vp, acc.1 + p.rp, acc.2 + p.kc));
    let month_cutoff = now - 30 * 24 * 3600 * 1000;
    let (vp_month, rp_month) = s.data.purchases.iter()
        .filter(|p| p.date_ms >= month_cutoff)
        .fold((0u64, 0u64), |acc, p| (acc.0 + p.vp, acc.1 + p.rp));

    Ok(serde_json::json!({
        "trackingSinceMs": s.data.tracking_since_ms,
        "purchases": s.data.purchases,
        "vpSpent": vp_total,
        "rpSpent": rp_total,
        "kcSpent": kc_total,
        "thisMonthVp": vp_month,
        "thisMonthRp": rp_month,
        "newSinceLast": new_items.len(),
    }))
}
