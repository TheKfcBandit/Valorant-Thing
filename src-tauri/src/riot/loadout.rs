use std::sync::Mutex;

use super::auth::get_glz_creds;
use super::http::{pd_get, pd_put};
use super::logging::log_info;
use super::types::ConnectionState;

pub fn check_loadout(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, _region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    pd_get(&shard, &path, &access_token, &entitlements, &client_version)?;
    Ok("ok".to_string())
}

pub fn get_loadout(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, _region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    pd_get(&shard, &path, &access_token, &entitlements, &client_version)
}

pub fn set_loadout(state: &Mutex<ConnectionState>, loadout_json: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, _region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    log_info("[Loadout] Updating player loadout");
    pd_put(
        &shard,
        &path,
        loadout_json,
        &access_token,
        &entitlements,
        &client_version,
    )
}

pub fn get_owned_items(
    state: &Mutex<ConnectionState>,
    item_type_id: &str,
) -> Result<String, String> {
    let (access_token, entitlements, puuid, _region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/store/v1/entitlements/{}/{}", puuid, item_type_id);
    pd_get(&shard, &path, &access_token, &entitlements, &client_version)
}
