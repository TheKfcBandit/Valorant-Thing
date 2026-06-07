use std::sync::Mutex;

use super::auth::get_glz_creds;
use super::logging::log_info;
use super::pd_session::{pd_get_authed, pd_put_authed};
use super::types::ConnectionState;

pub fn check_loadout(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (_, _, puuid, _, _, _) = get_glz_creds(state)?;
    let path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    pd_get_authed(state, &path)?;
    Ok("ok".to_string())
}

pub fn get_loadout(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (_, _, puuid, _, _, _) = get_glz_creds(state)?;
    let path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    pd_get_authed(state, &path)
}

pub fn set_loadout(state: &Mutex<ConnectionState>, loadout_json: &str) -> Result<String, String> {
    let (_, _, puuid, _, _, _) = get_glz_creds(state)?;
    let path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    log_info("[Loadout] Updating player loadout");
    pd_put_authed(state, &path, loadout_json)
}

pub fn get_owned_items(
    state: &Mutex<ConnectionState>,
    item_type_id: &str,
) -> Result<String, String> {
    let (_, _, puuid, _, _, _) = get_glz_creds(state)?;
    let path = format!("/store/v1/entitlements/{}/{}", puuid, item_type_id);
    pd_get_authed(state, &path)
}
