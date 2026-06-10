use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::riot::{self, ConnectionState};
use crate::util::{cache_path, now_ms};

pub type WishlistShared = Arc<Mutex<Vec<String>>>;

// --- Phase A of #18: storefront stale-cache ---

#[derive(Serialize, Deserialize, Clone)]
struct StorefrontCacheFile {
    raw: String,
    fetched_at_ms: i64,
}

fn save_storefront_to_disk(app: &AppHandle, raw: &str) {
    // Best-effort. A failed write should never break a successful fetch.
    let path = match cache_path(app, "store-cache.json") {
        Ok(p) => p,
        Err(e) => {
            riot::logging::log_error(&format!("[StoreCache] path: {}", e));
            return;
        }
    };
    let entry = StorefrontCacheFile {
        raw: raw.to_string(),
        fetched_at_ms: now_ms(),
    };
    let serialized = match serde_json::to_string(&entry) {
        Ok(s) => s,
        Err(e) => {
            riot::logging::log_error(&format!("[StoreCache] serialize: {}", e));
            return;
        }
    };
    // Unique tmp name per write: the poller thread and the get_storefront
    // command can persist concurrently, and a SHARED tmp name lets writer B
    // rename the file writer A already renamed away — the "[StoreCache]
    // rename: cannot find the file" error from the field. Last rename wins;
    // both candidates are complete snapshots, so either outcome is valid.
    let tmp = path.with_extension(format!("json.tmp{}", now_ms()));
    if let Err(e) = std::fs::write(&tmp, serialized) {
        riot::logging::log_error(&format!("[StoreCache] write tmp: {}", e));
        return;
    }
    if let Err(e) = std::fs::rename(&tmp, &path) {
        riot::logging::log_error(&format!("[StoreCache] rename: {}", e));
        let _ = std::fs::remove_file(&tmp);
    }
}

fn load_storefront_from_disk(app: &AppHandle) -> Option<StorefrontCacheFile> {
    let path = cache_path(app, "store-cache.json").ok()?;
    if !path.exists() {
        return None;
    }
    let s = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&s).ok()
}

#[derive(Serialize)]
pub struct StorefrontResult {
    pub raw: String,
    pub fetched_at_ms: i64,
    /// None ⇒ this is a fresh fetch. Some ⇒ this is the cached snapshot,
    /// returned because the live fetch failed (no Riot Client / network /
    /// stale token). Frontend uses this to show the "stale" banner.
    pub stale_since_ms: Option<i64>,
}

#[derive(Clone, Serialize)]
struct WishlistHit {
    offer_id: String,
    kind: &'static str,
}

#[derive(Clone, Serialize)]
struct StoreUpdate {
    raw: String,
    fetched_at_ms: i64,
}

fn fetch_storefront_inner(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, shard, client_version) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        if !s.connected {
            return Err("Not connected".to_string());
        }
        (
            s.access_token.clone().ok_or("No access_token")?,
            s.entitlements.clone().ok_or("No entitlements")?,
            s.puuid.clone().ok_or("No puuid")?,
            s.shard.clone().ok_or("No shard")?,
            s.client_version.clone().ok_or("No client_version")?,
        )
    };
    let path = format!("/store/v3/storefront/{}", puuid);
    // /store/v3/storefront/{puuid} requires POST with an empty JSON body. The
    // older v2 endpoint was GET, but v2 is deprecated. Using GET on v3 returns
    // 405 Method Not Allowed, which silently breaks the entire Store page.
    riot::pd_post(
        &shard,
        &path,
        "{}",
        &access_token,
        &entitlements,
        &client_version,
    )
}

fn extract_offer_ids(raw: &str) -> (Vec<String>, Vec<String>) {
    let mut daily = Vec::new();
    let mut night_market = Vec::new();
    let v: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(e) => {
            riot::logging::log_error(&format!(
                "[Store] Storefront JSON parse failed: {} (first 80 chars: {:?})",
                e,
                raw.chars().take(80).collect::<String>()
            ));
            return (daily, night_market);
        }
    };

    if let Some(arr) = v["SkinsPanelLayout"]["SingleItemStoreOffers"].as_array() {
        for offer in arr {
            if let Some(id) = offer["OfferID"].as_str() {
                daily.push(id.to_lowercase());
            }
        }
    }
    if let Some(arr) = v["SkinsPanelLayout"]["SingleItemOffers"].as_array() {
        for id in arr {
            if let Some(s) = id.as_str() {
                let lc = s.to_lowercase();
                if !daily.contains(&lc) {
                    daily.push(lc);
                }
            }
        }
    }

    if let Some(arr) = v["BonusStore"]["BonusStoreOffers"].as_array() {
        for offer in arr {
            if let Some(id) = offer["Offer"]["OfferID"].as_str() {
                night_market.push(id.to_lowercase());
            } else if let Some(id) = offer["BonusOfferID"].as_str() {
                night_market.push(id.to_lowercase());
            }
        }
    }

    (daily, night_market)
}

fn dedup_key(day_key: &str, kind: &str, id: &str) -> String {
    format!("{}|{}|{}", day_key, kind, id)
}

fn collect_candidates(raw: &str, wishlist: &Mutex<Vec<String>>) -> Vec<WishlistHit> {
    let wl: HashSet<String> = match wishlist.lock() {
        Ok(g) => g.iter().map(|s| s.to_lowercase()).collect(),
        Err(_) => return Vec::new(),
    };
    if wl.is_empty() {
        return Vec::new();
    }
    let (daily, nm) = extract_offer_ids(raw);
    let mut hits = Vec::new();
    for id in daily {
        if wl.contains(&id) {
            hits.push(WishlistHit {
                offer_id: id,
                kind: "daily",
            });
        }
    }
    for id in nm {
        if wl.contains(&id) {
            hits.push(WishlistHit {
                offer_id: id,
                kind: "night-market",
            });
        }
    }
    hits
}

fn utc_day_key(secs: i64) -> String {
    let day = secs.div_euclid(86_400);
    format!("d{}", day)
}

fn emit_and_notify(app: &AppHandle, raw: &str, hits: &[WishlistHit]) {
    let _ = app.emit(
        "store-update",
        StoreUpdate {
            raw: raw.to_string(),
            fetched_at_ms: now_ms(),
        },
    );
    for hit in hits {
        let _ = app.emit("wishlist-hit", hit.clone());
    }
}

pub fn spawn_storefront_poller(
    app: AppHandle,
    state: Arc<Mutex<ConnectionState>>,
    wishlist: WishlistShared,
) {
    tauri::async_runtime::spawn(async move {
        let mut seen: HashSet<String> = HashSet::new();
        let mut last_fetched_day: String = String::new();

        loop {
            let connected = state.lock().map(|s| s.connected).unwrap_or(false);
            if !connected {
                tokio::time::sleep(Duration::from_secs(30)).await;
                continue;
            }

            // Refresh tokens if needed and validate the session.
            // health_check returns None if it had to disconnect.
            let state_for_health = Arc::clone(&state);
            let still_connected = tauri::async_runtime::spawn_blocking(move || {
                riot::health_check(&state_for_health).is_some()
            })
            .await
            .unwrap_or(false);

            if !still_connected {
                tokio::time::sleep(Duration::from_secs(30)).await;
                continue;
            }

            let now = now_ms() / 1000;
            let day_key = utc_day_key(now);

            if day_key != last_fetched_day {
                let app2 = app.clone();
                let state2 = Arc::clone(&state);
                let wl2 = Arc::clone(&wishlist);
                let fetch_result = tauri::async_runtime::spawn_blocking(move || {
                    let raw = fetch_storefront_inner(&state2)?;
                    let candidates = collect_candidates(&raw, &wl2);
                    Ok::<(String, Vec<WishlistHit>), String>((raw, candidates))
                })
                .await;

                match fetch_result {
                    Ok(Ok((raw, candidates))) => {
                        if day_key != last_fetched_day {
                            seen.clear();
                            last_fetched_day = day_key.clone();
                        }
                        let mut fresh = Vec::new();
                        for h in candidates {
                            let key = dedup_key(&day_key, h.kind, &h.offer_id);
                            if seen.insert(key) {
                                fresh.push(h);
                            }
                        }
                        emit_and_notify(&app2, &raw, &fresh);
                        save_storefront_to_disk(&app2, &raw);
                        riot::logging::log_info(&format!(
                            "[Store] Fetched storefront for {} ({} fresh hits)",
                            day_key,
                            fresh.len()
                        ));
                    }
                    Ok(Err(e)) => {
                        riot::logging::log_error(&format!("[Store] Fetch failed: {}", e));
                    }
                    Err(e) => {
                        riot::logging::log_error(&format!("[Store] Task join failed: {}", e));
                    }
                }
            }

            tokio::time::sleep(Duration::from_secs(300)).await;
        }
    });
}

#[tauri::command]
pub async fn get_storefront(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<ConnectionState>>>,
) -> Result<StorefrontResult, String> {
    let state_clone = Arc::clone(&state);
    let app_for_save = app.clone();
    let fresh = tauri::async_runtime::spawn_blocking(move || fetch_storefront_inner(&state_clone))
        .await
        .map_err(|e| format!("Task failed: {}", e))?;
    match fresh {
        Ok(raw) => {
            save_storefront_to_disk(&app_for_save, &raw);
            Ok(StorefrontResult {
                raw,
                fetched_at_ms: now_ms(),
                stale_since_ms: None,
            })
        }
        Err(live_err) => {
            // Phase A of #18: fall back to the on-disk cache so the user sees
            // *something* when Valorant isn't running. The frontend shows a
            // stale banner based on the stale_since_ms field.
            match load_storefront_from_disk(&app) {
                Some(c) => Ok(StorefrontResult {
                    raw: c.raw,
                    fetched_at_ms: c.fetched_at_ms,
                    stale_since_ms: Some(c.fetched_at_ms),
                }),
                None => Err(live_err),
            }
        }
    }
}

#[tauri::command]
pub fn set_wishlist(
    wishlist: tauri::State<'_, WishlistShared>,
    items: Vec<String>,
) -> Result<(), String> {
    let normalized: Vec<String> = items.into_iter().map(|s| s.to_lowercase()).collect();
    let mut g = wishlist.lock().map_err(|e| e.to_string())?;
    *g = normalized;
    Ok(())
}

#[tauri::command]
pub async fn force_refresh_storefront(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<ConnectionState>>>,
    wishlist: tauri::State<'_, WishlistShared>,
) -> Result<String, String> {
    let state = Arc::clone(&state);
    let wishlist = Arc::clone(&wishlist);
    let raw = tauri::async_runtime::spawn_blocking(move || {
        let raw = fetch_storefront_inner(&state)?;
        let candidates = collect_candidates(&raw, &wishlist);
        Ok::<(String, Vec<WishlistHit>), String>((raw, candidates))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;
    let (raw, hits) = raw;
    emit_and_notify(&app, &raw, &hits);
    save_storefront_to_disk(&app, &raw);
    Ok(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_day_key_rolls_over_at_midnight() {
        let just_before = utc_day_key(86_399);
        let at_midnight = utc_day_key(86_400);
        let one_into = utc_day_key(86_401);
        assert_ne!(just_before, at_midnight);
        assert_eq!(at_midnight, one_into);
    }

    #[test]
    fn utc_day_key_consistent_within_a_day() {
        // Two timestamps within the same UTC day should hash to same key.
        // 1700000000 (2023-11-14 22:13:20 UTC) and a few hours later same day
        let a = utc_day_key(1_700_000_000);
        let b = utc_day_key(1_700_000_000 + 3600); // +1h
        assert_eq!(a, b);
    }

    #[test]
    fn dedup_keys_are_unique_per_kind_and_id() {
        let a = dedup_key("d100", "daily", "abc");
        let b = dedup_key("d100", "night-market", "abc");
        let c = dedup_key("d100", "daily", "def");
        let d = dedup_key("d101", "daily", "abc");
        let e = dedup_key("d100", "daily", "abc");
        assert_ne!(a, b);
        assert_ne!(a, c);
        assert_ne!(a, d);
        assert_eq!(a, e);
    }

    #[test]
    fn extract_daily_offers_basic() {
        let raw = r#"{
            "SkinsPanelLayout": {
                "SingleItemStoreOffers": [
                    {"OfferID": "AAA", "Cost": {}},
                    {"OfferID": "BBB", "Cost": {}},
                    {"OfferID": "CCC", "Cost": {}},
                    {"OfferID": "DDD", "Cost": {}}
                ]
            }
        }"#;
        let (daily, nm) = extract_offer_ids(raw);
        assert_eq!(daily.len(), 4);
        assert!(daily.iter().all(|s| s == &s.to_lowercase()));
        assert!(daily.contains(&"aaa".to_string()));
        assert_eq!(nm.len(), 0);
    }

    #[test]
    fn extract_daily_offers_falls_back_to_single_item_offers() {
        // Some response variants only have SingleItemOffers (UUID strings).
        let raw = r#"{
            "SkinsPanelLayout": {
                "SingleItemOffers": ["AAA", "BBB", "CCC", "DDD"]
            }
        }"#;
        let (daily, _nm) = extract_offer_ids(raw);
        assert_eq!(daily.len(), 4);
        assert!(daily.contains(&"aaa".to_string()));
    }

    #[test]
    fn extract_offers_does_not_double_count() {
        // If both fields present, the same UUID in both should appear once.
        let raw = r#"{
            "SkinsPanelLayout": {
                "SingleItemStoreOffers": [{"OfferID": "AAA"}],
                "SingleItemOffers": ["AAA", "BBB"]
            }
        }"#;
        let (daily, _) = extract_offer_ids(raw);
        assert_eq!(daily.iter().filter(|s| s == &"aaa").count(), 1);
        assert!(daily.contains(&"bbb".to_string()));
    }

    #[test]
    fn extract_night_market_offers() {
        let raw = r#"{
            "BonusStore": {
                "BonusStoreOffers": [
                    {"Offer": {"OfferID": "NM1"}},
                    {"Offer": {"OfferID": "NM2"}}
                ]
            }
        }"#;
        let (daily, nm) = extract_offer_ids(raw);
        assert_eq!(daily.len(), 0);
        assert_eq!(nm.len(), 2);
        assert!(nm.contains(&"nm1".to_string()));
        assert!(nm.contains(&"nm2".to_string()));
    }

    #[test]
    fn extract_offers_handles_malformed_json() {
        let (daily, nm) = extract_offer_ids("not json at all");
        assert_eq!(daily.len(), 0);
        assert_eq!(nm.len(), 0);
    }

    #[test]
    fn extract_offers_handles_empty_object() {
        let (daily, nm) = extract_offer_ids("{}");
        assert_eq!(daily.len(), 0);
        assert_eq!(nm.len(), 0);
    }

    #[test]
    fn collect_candidates_empty_wishlist_returns_empty() {
        let raw = r#"{"SkinsPanelLayout":{"SingleItemStoreOffers":[{"OfferID":"AAA"}]}}"#;
        let wl = Mutex::new(Vec::<String>::new());
        let hits = collect_candidates(raw, &wl);
        assert_eq!(hits.len(), 0);
    }

    #[test]
    fn collect_candidates_matches_daily_hit() {
        let raw = r#"{"SkinsPanelLayout":{"SingleItemStoreOffers":[{"OfferID":"AAA"},{"OfferID":"BBB"}]}}"#;
        let wl = Mutex::new(vec!["aaa".to_string()]);
        let hits = collect_candidates(raw, &wl);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].offer_id, "aaa");
        assert_eq!(hits[0].kind, "daily");
    }

    #[test]
    fn collect_candidates_matches_night_market_hit() {
        let raw = r#"{"BonusStore":{"BonusStoreOffers":[{"Offer":{"OfferID":"NM1"}}]}}"#;
        let wl = Mutex::new(vec!["nm1".to_string()]);
        let hits = collect_candidates(raw, &wl);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, "night-market");
    }

    #[test]
    fn collect_candidates_is_case_insensitive() {
        let raw =
            r#"{"SkinsPanelLayout":{"SingleItemStoreOffers":[{"OfferID":"ABC-Mixed-Case"}]}}"#;
        // Wishlist stored upper-case
        let wl = Mutex::new(vec!["ABC-MIXED-CASE".to_string()]);
        let hits = collect_candidates(raw, &wl);
        assert_eq!(hits.len(), 1);
    }
}
