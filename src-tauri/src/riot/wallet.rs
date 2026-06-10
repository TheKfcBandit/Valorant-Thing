use std::sync::Mutex;

use super::auth::get_glz_creds;
use super::pd_session::pd_get_authed;
use super::types::ConnectionState;

// GET /store/v1/wallet/{puuid} — current VP/RP/KC balances, keyed by
// currency UUID. Riot exposes no purchase/order ledger anywhere on PD
// (#41 investigation: storefront, prices, wallet and owned-items are the
// entire store surface), so live balances are the only "real" money data
// the Purchase History view can show next to the heuristic ledger.
pub fn get_wallet(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (_, _, puuid, _, _, _) = get_glz_creds(state)?;
    let path = format!("/store/v1/wallet/{}", puuid);
    pd_get_authed(state, &path)
}
