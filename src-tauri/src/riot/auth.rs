use std::sync::Mutex;

use super::types::ConnectionState;

// Credential helpers used by every Riot API call. Locks the connection
// state, verifies we're connected, and returns the bag of values the
// caller needs. Two flavors:
//   - get_local_creds: just (port, local_auth) for the Riot Client API
//     served on 127.0.0.1.
//   - get_glz_creds: the full kit for PD / GLZ remote calls — access
//     token, entitlements JWT, puuid, region, shard, client version.

pub fn get_local_creds(state: &Mutex<ConnectionState>) -> Result<(u16, String), String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    if !s.connected {
        return Err("Not connected".to_string());
    }
    Ok((
        s.port.ok_or("No port")?,
        s.local_auth.clone().ok_or("No local_auth")?,
    ))
}

pub fn get_glz_creds(
    state: &Mutex<ConnectionState>,
) -> Result<(String, String, String, String, String, String), String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    if !s.connected {
        return Err("Not connected".to_string());
    }
    Ok((
        s.access_token.clone().ok_or("No access_token")?,
        s.entitlements.clone().ok_or("No entitlements")?,
        s.puuid.clone().ok_or("No puuid")?,
        s.region.clone().ok_or("No region")?,
        s.shard.clone().ok_or("No shard")?,
        s.client_version.clone().ok_or("No client_version")?,
    ))
}
