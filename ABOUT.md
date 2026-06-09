# ABOUT — Codebase Reference

A descriptive map of what exists in this repository, written for future
sessions (human or AI). [ARCHITECTURE.md](ARCHITECTURE.md) says where new
things _belong_; this file says what is actually _here_. Regenerated after
the June 2026 health pass (lib.rs → `commands/` decomposition, page
decomposition sweep); if a major refactor lands, regenerate this file again
rather than patching it line by line.

Stack: **Tauri v2 + Rust** backend, **React 19 + Tailwind CSS 4 + Vite**
frontend, **vitest** for JS tests, `cargo test` for Rust. CI
(`.github/workflows/tauri.yml`) gates prettier, eslint, vitest,
`cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` on
every push.

---

## Frontend (src/)

### Shell

- `App.jsx` — title bar + sidebar + page router + global hooks. Owns
  connection/identity state shared across pages.
- `main.jsx` — React root.

### Pages (`src/components/*.jsx`)

Pages that grew past the 500-line budget have been decomposed into
co-located sub-component directories (`src/components/<page>/`).

| Page                           | Purpose                                                   | Sub-components                                                                                                              |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `HomePage.jsx`                 | Profile hero, rank/tracker cards, RR chart, match history | `home/` — StatCards, RRChart, AggregatePanels, MatchHistorySection, StatusBanners, MatchDetailsModal, MatchRoundDetailPanel |
| `MatchInfoPage.jsx`            | Live pregame/core-game roster with ranks                  | `match-info/` — MatchHeader, PlayerCard, PlayerDetailDialog (+ `hooks/useLiveMatchPlayers`)                                 |
| `PartyPage.jsx`                | Party roster, queue control, custom games, invites        | `party/` — PartyControls, CustomGameSetup, MemberCard, FriendInviteCard, InviteFriendsModal, PartyModals                    |
| `SettingsPage.jsx`             | All app settings                                          | `settings/` — AccountSection, TimingSection, NotificationSettings, ThemeSection, ConfigSection, SettingsModals, …           |
| `LoadoutPage.jsx`              | Collection editor + loadout presets                       | `loadout/` — SkinPicker, GridPicker, PresetsPanel, CollectionCards, Img                                                     |
| `StorePage.jsx`                | Daily/accessory/night-market storefront + wishlist        | `store/` — SkinCard, BundleCarousel, AccessoryCard, WishlistModal, StoreSections                                            |
| `FakeStatusPage.jsx`           | XMPP fake-presence editor                                 | `fake-status/` — PresenceForm, FormControls, ApiSearch, XmppLogPanel                                                        |
| `DevPage.jsx`                  | Developer console                                         | `dev/` — LogsTab, GameLogTab, NotifsTab, CloudTab, StateTab                                                                 |
| `InstalockPage.jsx`            | Agent instalock profiles                                  | `instalock/`                                                                                                                |
| `CrosshairPage.jsx`            | Crosshair editor + share-code import + presets            | `crosshair/`                                                                                                                |
| `HeatmapPage.jsx`              | Death heatmap per map (Insights)                          | —                                                                                                                           |
| `CoachPage.jsx`                | LLM per-match coaching                                    | —                                                                                                                           |
| `PremierPage.jsx`              | Premier roster + standings                                | —                                                                                                                           |
| `WrappedPage.jsx`              | Local stat-card gallery                                   | —                                                                                                                           |
| `ChatPage.jsx`                 | Game chat conversations                                   | —                                                                                                                           |
| `MapDodgePage.jsx`             | Map blacklist auto-dodge                                  | —                                                                                                                           |
| `MiscPage.jsx`                 | Menu-video swap, leader-gated extras                      | —                                                                                                                           |
| `LineupsPage.jsx`              | Lineups (stub — see issue #29)                            | —                                                                                                                           |
| `LivePage.jsx`, `LogsPage.jsx` | Live overview / log viewer                                | —                                                                                                                           |

Support components: `Sidebar`, `TitleBar`, `Tooltip`, `NotificationToast`,
`NotificationOverlayWindow`, `PlayerInfo`.

### UI primitives (`src/components/ui/`)

`Label`, `Toggle` — see [CATALOG.md](src/components/ui/CATALOG.md) for the
prop contracts and the list of planned-but-not-yet-extracted primitives.

### Hooks (`src/hooks/`)

| Hook                                                            | Role                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `useAsyncEffect`                                                | Async effects with cancellation (`isCancelled()` closure)      |
| `useApiLookup`                                                  | Bridge a singleton-memoized valorant-api getter to React state |
| `useConnectionLifecycle`                                        | Connect/poll/reconnect state machine; feeds App.jsx            |
| `useLiveMatchPlayers`                                           | Live-roster name/level/MMR resolution pipeline (MatchInfoPage) |
| `useMatchPoller`                                                | Pregame/core-game polling + instalock + dodge orchestration    |
| `useDiscordRPC`                                                 | Presence → Discord RPC sync                                    |
| `useDodgeKeybind`                                               | Global dodge hotkey                                            |
| `useNotificationOverlay`                                        | Overlay-window notification routing                            |
| `usePlayerPrefetch`                                             | Warm matchCache for likely-viewed players                      |
| `useSharedRefs`, `useSpikeTimer`, `useTheme`, `useWishlistSync` | What they say                                                  |

### Data boundary

- `src/riotShapes.js` — **all** raw-Riot-field normalization:
  `normalizeRrEntry/Response`, `normalizePenalty/PenaltiesResponse`,
  `normalizeLiveMatch/LivePlayer` (pregame + core-game),
  `normalizeSeasonalPeak`. Components read camelCase only.
- `src/valApiSkins.js` — singleton-memoized valorant-api.com asset lookups.
- `src/matchCache.js` — in-memory per-puuid account/MMR cache.
- `src/live/registry.js` — `LiveModule` plugin contract for MatchInfoPage
  cards (id, label, fetch?, cachedFor?, CardSlot?, DialogSection?).
- `src/matchHighlights.js`, `src/squadAnalytics.js` — pure analytics
  (badges, co-play fitness), both unit-tested.

### Utils (`src/utils/`)

One file per domain: `agents`, `animation`, `authError`, `color`,
`crosshair`, `customTheme`, `fakeStatus`, `format`, `gameMode`, `gamePod`,
`instalockConfig`, `loadout`, `maps`, `matchRounds`, `menuVideo`,
`penalties`, `queues`, `rank`, `rarity`, `roundResult`, `store`,
`trackerScore`.

### Tests (`src/__tests__/`)

vitest, node environment. Covered: `authError`, `color`, `crosshair`,
`gameMode`, `matchHighlights`, `matchRounds`, `penalties`, `queues`,
`riotShapes`, `squadAnalytics`, `trackerScore`.

---

## Backend (src-tauri/src/)

### Entry

- `main.rs` — calls `lib.rs::run()`.
- `lib.rs` (~210 lines) — module declarations, panic hook,
  AppUserModelID, the `.manage()` chain, plugins, a slim `.setup()`
  (logging init + `background::*` spawns + `tray::setup`), and
  `generate_handler![]`.
- `background.rs` — boot OAuth hydration + 60s silent-refresh loop,
  one-shot legacy match-cache → SQLite migration, storefront poller spawn.
- `tray.rs` — system-tray menu + icon wiring.

### Command wrappers (`commands/`)

Thin `#[tauri::command]` fns (async-over-`spawn_blocking`), grouped by
domain. Invoke names equal the fn names.

| Module                   | Commands                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands/connection.rs` | connect, disconnect, get_status, get_player, get_oauth_state, health_check, get_token_age                                                                                                                                                                                                      |
| `commands/live_match.rs` | check_current_game, get_match_loadouts, select_agent, lock_agent, pregame_quit, coregame_quit, get_owned_agents                                                                                                                                                                                |
| `commands/stats.rs`      | get_home_stats, get_player_mmr, get_rr_history, get_match_details, get_match_page, resolve_player_names, get_player_level_from_history, splooshima_lookup                                                                                                                                      |
| `commands/party.rs`      | get_party, get_friends, get_penalties, set_party_accessibility, disable_party_code, kick_from_party, invite_to_party, request_to_join_party, generate_party_code, join_party_by_code, change_queue, enter_queue, leave_queue, get_custom_configs, set_custom_settings, start_custom_game_match |
| `commands/chat.rs`       | get_chat_conversations, get_chat_messages, send_chat_message, get_chat_participants                                                                                                                                                                                                            |
| `commands/loadout.rs`    | get_loadout, set_loadout, get_owned_items, check_loadout                                                                                                                                                                                                                                       |
| `commands/premier.rs`    | get_premier_player, get_premier_division, get_premier_conference, cache_premier_bundle                                                                                                                                                                                                         |
| `commands/presence.rs`   | xmpp_connect, xmpp_disconnect, xmpp_poll, xmpp_get_status, xmpp_get_logs, xmpp_send_fake_presence, start_discord_rpc, stop_discord_rpc, update_discord_rpc                                                                                                                                     |
| `commands/process.rs`    | is_valorant_running, is_valorant_foreground, get_valorant_monitor, list_monitors, find_valorant_path, compute_file_hash, force_copy_file, remove_file, list_dir, read_game_log                                                                                                                 |
| `commands/app.rs`        | show_window_no_focus, toggle_devtools, exit_app, get_app_version, check_node_installed, check_for_update, download_and_install_update                                                                                                                                                          |

Domain modules export their own commands directly (already
module-qualified in `generate_handler!`): `cloud` (cloud*save/load),
`store` (get_storefront, set_wishlist, force_refresh_storefront),
`match_db` (match_history*_), `rr_cache` (rr*history*_),
`spend_tracker` (get_spend_summary), `coach` (coach_analyze),
`identity_cache` (get_cached_identity), `oauth` (oauth_signin/signout),
`loadout_presets` (list/save/apply/delete_loadout_preset),
`bomb_tracker` (start/stop/is_bomb_tracker_running),
`premier_cache` (get_cached_premier), `secret_store`
(get/set/delete_secret), `match_details_cache` (get_death_locations,
get_player_match_summaries).

### Riot API layer (`riot/`)

`auth` (creds extraction), `http` (Node-shelled HTTP: local/PD/GLZ),
`pd_raw` + `pd_session` (#14 refresh-aware PD wrappers), `connection`,
`agent_select`, `chat`, `loadout`, `match_history`, `party`, `premier`,
`process` (lockfile, monitors, Win32), `queue`, `stats`, `xmpp` (fake
presence), `logging`, `types` (`ConnectionState`, `PlayerInfo`,
`OAuthState`).

Note: `PlayerInfo.rso_debug` / `loadout_debug` carry raw response bodies
for the dev log and are only populated when the frontend passes
`includeDebug: true` to `connect` (dev tab enabled).

### Persistence

All file-backed stores ride `value_cache::Cache<T>` (lazy load, atomic
tmp-rename writes, corrupt-file quarantine to `.corrupt-{ts}`):
`match_details_cache`, `rr_cache`, `premier_cache`, `identity_cache`,
`loadout_presets`, `spend_tracker`. Exceptions, each deliberate:

- `match_db.rs` — SQLite (rusqlite) match history with idempotent JSON
  migration.
- `token_store.rs` — OAuth blob in the OS keychain with an atomic JSON
  fallback; at most one store holds a value at a time.
- `secret_store.rs` — LLM/API keys in the OS keychain (#15).

### Other backend modules

`oauth.rs` (webview OAuth + three-rung silent refresh, #26/#14),
`discord.rs` (Discord RPC), `bomb_tracker.rs` (spike timer source),
`coach.rs` (LLM calls), `cloud.rs` (VT Cloud share codes via reqwest),
`util.rs` (cache_path, now_ms).

---

## External surfaces

- **Riot local API** (lockfile port) — entitlements, local data.
- **PD / GLZ** — stats, store, party, pregame/core-game, premier.
- **auth.riotgames.com** — userinfo + webview OAuth.
- **valorant-api.com** — static asset metadata (frontend, memoized).
- **XMPP** — fake presence + chat.
- **Discord IPC** — rich presence.
- **VT Cloud** (`vt-cloud.ajaxfnc.com`) — anonymous share-code blobs.
- **Splooshima** — fallback player name/level/MMR lookups (user API key).

## Where process docs live

- Rules / leash: [CLAUDE.md](CLAUDE.md)
- Layering / boundaries: [ARCHITECTURE.md](ARCHITECTURE.md)
- UI primitive contracts: [src/components/ui/CATALOG.md](src/components/ui/CATALOG.md)
- Roadmap: GitHub issues (label `roadmap`, milestone "v2.x Roadmap (User Wishlist)")
