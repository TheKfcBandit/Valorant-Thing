use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::riot::logging::{log_error, log_info};
use crate::riot::{self, ConnectionState};
use crate::util::now_ms;
use crate::value_cache::Cache;

// Riot's "Skins" entitlement type — its ItemIDs are skin-level UUIDs, the
// currency of the storefront, the offers catalog, and valorant-api's level
// lookup. NOT "3ad1b2b2-…", which is "Skin Variants" (chromas): tracking
// that type is why every ledger entry rendered as an unpriceable
// "Unknown skin" (#41 follow-up).
const SKIN_LEVEL_ITEM_TYPE: &str = "e7c63390-eda7-46e0-bb7a-a6abdacd2433";
const COST_VP: &str = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
const COST_RP: &str = "e59aa87c-4cbf-517a-5983-6e81511be9b7";
const COST_KC: &str = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d";

#[derive(Default, Serialize, Deserialize)]
pub struct SpendData {
    tracking_since_ms: Option<i64>,
    last_owned: HashSet<String>,
    purchases: Vec<Purchase>,
    offer_cache: HashMap<String, OfferCost>,
    // Flipped by the one-time chroma→skin-level re-baseline; defaults false
    // so ledgers written before the item-type fix migrate on first load.
    #[serde(default)]
    retracked_v2: bool,
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

// Once-per-app-session guard for refreshing the (large) offers catalog when
// it's only needed opportunistically: backfilling old zero-cost ledger
// entries and computing the collection view. New-purchase pricing bypasses
// this and always fetches when an id is missing.
static CATALOG_REFRESHED: AtomicBool = AtomicBool::new(false);

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
            // Only the requested type should come back, but if Riot ever
            // returns the full grouped inventory, flattening every group
            // would log agents/cards/sprays as phantom skin purchases.
            if g["ItemTypeID"].as_str() != Some(SKIN_LEVEL_ITEM_TYPE) {
                continue;
            }
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

// One-time migration for ledgers written while the tracker queried the
// "Skin Variants" (chroma) entitlement type. Those entries match neither
// the level lookup nor the offers catalog (all zero-cost), and last_owned
// holds chroma UUIDs — without a re-baseline, the first correctly-typed
// diff would log the user's entire skin collection as phantom purchases.
// Returns the number of purged junk entries, or None if already migrated.
fn rebaseline_v2(d: &mut SpendData, owned: &HashSet<String>) -> Option<usize> {
    if d.retracked_v2 {
        return None;
    }
    let before = d.purchases.len();
    d.purchases.retain(|p| p.vp > 0 || p.rp > 0 || p.kc > 0);
    d.last_owned = owned.clone();
    d.retracked_v2 = true;
    Some(before - d.purchases.len())
}

fn fetch_owned_skin_levels(state: &Mutex<ConnectionState>) -> Result<HashSet<String>, String> {
    let raw = riot::get_owned_items(state, SKIN_LEVEL_ITEM_TYPE)?;
    let json: Value = serde_json::from_str(&raw).map_err(|e| format!("parse owned: {}", e))?;
    Ok(parse_owned_skin_levels(&json))
}

fn fetch_offer_catalog(
    state: &Mutex<ConnectionState>,
) -> Result<HashMap<String, OfferCost>, String> {
    // Refresh-aware wrapper (#14). The old raw pd_get path here 401'd
    // silently on a stale token while the owned-items diff (already on the
    // authed wrapper) succeeded — which is exactly how ledger entries got
    // written with zero cost and the UI showed "price unknown" everywhere.
    let raw = riot::pd_get_authed(state, "/store/v1/offers/")?;
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

// Retro-price ledger entries that were written while the offers catalog was
// unavailable (the pre-fix catalog fetch 401'd silently on stale tokens, so
// zero-cost purchases accumulated). Entries that still have no catalog offer
// after a successful refresh are genuinely not store purchases — battlepass
// rewards, radianite level upgrades, bundle-only items — and stay at zero.
fn backfill_unpriced(d: &mut SpendData) -> u32 {
    let SpendData {
        purchases,
        offer_cache,
        ..
    } = d;
    let mut repriced = 0u32;
    for p in purchases.iter_mut() {
        if p.vp == 0 && p.rp == 0 && p.kc == 0 {
            if let Some(oc) = offer_cache.get(&p.skin_level_uuid) {
                if oc.vp > 0 || oc.rp > 0 || oc.kc > 0 {
                    p.vp = oc.vp;
                    p.rp = oc.rp;
                    p.kc = oc.kc;
                    repriced += 1;
                }
            }
        }
    }
    repriced
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

// Collection view (#41 follow-up): Riot keeps no purchase ledger, so the
// only complete answer to "what have I bought and what did it cost" is the
// entitlement list itself — every owned skin level, priced from the offers
// catalog. No dates (ownership isn't a transaction log), and it's an
// estimate: gifts count as spend, bundle discounts and battlepass items
// don't price. Owned levels with no catalog offer (BP rewards, upgrade
// levels, bundle-only) are counted but not priced.
#[tauri::command]
pub async fn get_owned_collection(
    app: AppHandle,
    state: tauri::State<'_, std::sync::Arc<Mutex<ConnectionState>>>,
    spend: tauri::State<'_, SpendTrackerCache>,
) -> Result<Value, String> {
    let state_for_owned = std::sync::Arc::clone(&state);
    let owned =
        tauri::async_runtime::spawn_blocking(move || fetch_owned_skin_levels(&state_for_owned))
            .await
            .map_err(|e| format!("Task failed: {}", e))??;

    // Make sure the catalog is loaded once per session (or whenever the
    // persisted cache is still empty) so the collection can price itself.
    let cache_empty = spend.read(&app, |d| d.offer_cache.is_empty())?;
    if cache_empty || !CATALOG_REFRESHED.load(Ordering::Relaxed) {
        let state_for_cat = std::sync::Arc::clone(&state);
        let catalog =
            tauri::async_runtime::spawn_blocking(move || fetch_offer_catalog(&state_for_cat))
                .await
                .map_err(|e| format!("Task failed: {}", e))?;
        match catalog {
            Ok(cat) => {
                CATALOG_REFRESHED.store(true, Ordering::Relaxed);
                spend.write(&app, |d| {
                    for (k, v) in cat {
                        d.offer_cache.insert(k, v);
                    }
                    ((), true)
                })?;
            }
            Err(e) => log_error(&format!("[Spend] collection catalog fetch failed: {}", e)),
        }
    }

    spend.read(&app, |d| {
        let mut items: Vec<Value> = Vec::new();
        let (mut vp, mut rp, mut kc) = (0u64, 0u64, 0u64);
        for id in &owned {
            let Some(oc) = d.offer_cache.get(id) else {
                continue;
            };
            if oc.vp == 0 && oc.rp == 0 && oc.kc == 0 {
                continue;
            }
            vp += oc.vp;
            rp += oc.rp;
            kc += oc.kc;
            items.push(serde_json::json!({
                "uuid": id,
                "vp": oc.vp,
                "rp": oc.rp,
                "kc": oc.kc,
            }));
        }
        serde_json::json!({
            "items": items,
            "vpTotal": vp,
            "rpTotal": rp,
            "kcTotal": kc,
            "ownedLevels": owned.len(),
            "unpriced": owned.len() - items.len(),
        })
    })
}

// Read-only view for the Purchase History panel (#41): no network fetch,
// no owned-items diff — just the cached ledger, so the page renders
// offline and never mutates tracking state as a side effect of viewing.
#[tauri::command]
pub async fn list_purchases(
    app: AppHandle,
    spend: tauri::State<'_, SpendTrackerCache>,
) -> Result<Value, String> {
    spend.read(&app, |d| {
        serde_json::json!({
            "trackingSinceMs": d.tracking_since_ms,
            "purchases": d.purchases,
        })
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

    let purged = spend.write(&app, |d| {
        let purged = rebaseline_v2(d, &owned);
        (purged, purged.is_some())
    })?;
    if let Some(n) = purged {
        log_info(&format!(
            "[Spend] re-baselined on skin-level entitlements; purged {} junk chroma-era entries",
            n
        ));
    }

    let (had_prior, new_items, has_unpriced) = spend.read(&app, |d| {
        let had = d.tracking_since_ms.is_some();
        let news: Vec<String> = owned
            .iter()
            .filter(|id| !d.last_owned.contains(*id))
            .cloned()
            .collect();
        let unpriced = d
            .purchases
            .iter()
            .any(|p| p.vp == 0 && p.rp == 0 && p.kc == 0);
        (had, news, unpriced)
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

    // Fetch the catalog when new items need pricing, or — at most once per
    // app session — when the ledger holds zero-cost entries that an earlier
    // failed fetch left behind. Items with no offer at all (battlepass,
    // upgrades) would otherwise force a refetch of the large offers payload
    // on every 5-minute Home refresh.
    let needs_for_new = !new_items.is_empty()
        && spend.read(&app, |d| {
            new_items.iter().any(|id| !d.offer_cache.contains_key(id))
        })?;
    let needs_for_backfill = has_unpriced && !CATALOG_REFRESHED.load(Ordering::Relaxed);
    if needs_for_new || needs_for_backfill {
        let state_for_cat = std::sync::Arc::clone(&state);
        let catalog =
            tauri::async_runtime::spawn_blocking(move || fetch_offer_catalog(&state_for_cat))
                .await
                .map_err(|e| format!("Task failed: {}", e))?;
        match catalog {
            Ok(cat) => {
                CATALOG_REFRESHED.store(true, Ordering::Relaxed);
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

    // Apply purchases, then retro-price any older zero-cost entries the
    // freshly merged catalog can now resolve.
    let now = now_ms();
    let repriced = spend.write(&app, |d| {
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
        let repriced = backfill_unpriced(d);
        (repriced, true)
    })?;
    if repriced > 0 {
        log_info(&format!(
            "[Spend] retro-priced {} ledger entries from the offers catalog",
            repriced
        ));
    }

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
                {
                    "ItemTypeID": SKIN_LEVEL_ITEM_TYPE,
                    "Entitlements": [{ "ItemID": "CCCC-3333" }, { "ItemID": "dddd-4444" }]
                }
            ]
        });
        let owned = parse_owned_skin_levels(&json);
        assert_eq!(owned.len(), 2);
        assert!(owned.contains("cccc-3333"));
    }

    #[test]
    fn parse_owned_skin_levels_ignores_foreign_groups() {
        // A full grouped inventory must not leak agents/cards/sprays into
        // the owned-skin set — that's how 56 junk "purchases" happened.
        let json = serde_json::json!({
            "EntitlementsByTypes": [
                {
                    "ItemTypeID": "01bb38e1-da47-4e6a-9b3d-945fe4655707",
                    "Entitlements": [{ "ItemID": "agent-1" }]
                },
                {
                    "ItemTypeID": SKIN_LEVEL_ITEM_TYPE,
                    "Entitlements": [{ "ItemID": "level-1" }]
                },
                {
                    "Entitlements": [{ "ItemID": "untyped-1" }]
                }
            ]
        });
        let owned = parse_owned_skin_levels(&json);
        assert_eq!(owned.len(), 1);
        assert!(owned.contains("level-1"));
    }

    #[test]
    fn rebaseline_purges_junk_and_runs_exactly_once() {
        let mut d = SpendData {
            tracking_since_ms: Some(1),
            last_owned: HashSet::from(["chroma-1".to_string(), "chroma-2".to_string()]),
            purchases: vec![
                Purchase {
                    skin_level_uuid: "chroma-junk".into(),
                    date_ms: 1,
                    vp: 0,
                    rp: 0,
                    kc: 0,
                },
                Purchase {
                    skin_level_uuid: "real-priced".into(),
                    date_ms: 2,
                    vp: 1775,
                    rp: 0,
                    kc: 0,
                },
            ],
            offer_cache: HashMap::new(),
            retracked_v2: false,
        };
        let owned = HashSet::from(["level-1".to_string()]);

        assert_eq!(rebaseline_v2(&mut d, &owned), Some(1));
        assert_eq!(d.purchases.len(), 1, "priced entries survive the purge");
        assert_eq!(d.purchases[0].skin_level_uuid, "real-priced");
        assert_eq!(d.last_owned, owned, "diff restarts from the typed set");
        assert!(d.retracked_v2);

        // Second call is a no-op: the migration must never re-purge.
        assert_eq!(rebaseline_v2(&mut d, &owned), None);
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
            retracked_v2: true,
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
    fn backfill_reprices_only_zero_cost_entries_with_catalog_hits() {
        let purchase = |id: &str, vp: u64| Purchase {
            skin_level_uuid: id.into(),
            date_ms: 1,
            vp,
            rp: 0,
            kc: 0,
        };
        let mut d = SpendData {
            tracking_since_ms: Some(1),
            last_owned: HashSet::new(),
            purchases: vec![
                purchase("in-catalog", 0),     // failed fetch at detection time
                purchase("no-offer", 0),       // battlepass / upgrade — no offer
                purchase("already-paid", 875), // priced entries must not change
            ],
            offer_cache: HashMap::from([
                (
                    "in-catalog".to_string(),
                    OfferCost {
                        vp: 1775,
                        rp: 0,
                        kc: 0,
                    },
                ),
                ("zero-offer".to_string(), OfferCost::default()),
            ]),
            retracked_v2: true,
        };
        assert_eq!(backfill_unpriced(&mut d), 1);
        assert_eq!(d.purchases[0].vp, 1775);
        assert_eq!(d.purchases[1].vp, 0, "no catalog offer stays unpriced");
        assert_eq!(d.purchases[2].vp, 875, "priced entries untouched");
        // Idempotent: a second pass finds nothing left to reprice.
        assert_eq!(backfill_unpriced(&mut d), 0);
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
        assert!(!d.retracked_v2, "pre-migration files default to unmigrated");

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
