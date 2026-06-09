// Thin #[tauri::command] wrappers, grouped by domain. Bodies follow the
// async-over-spawn_blocking pattern; business logic lives in riot/<domain>.rs
// or the domain module the wrapper delegates to. lib.rs only wires these
// into generate_handler![].

pub mod app;
pub mod chat;
pub mod connection;
pub mod live_match;
pub mod loadout;
pub mod party;
pub mod premier;
pub mod presence;
pub mod process;
pub mod stats;
