# Architecture

The map of how Valorant-Thing is layered, where new things belong, and which boundary they must cross. This is prescriptive — read it before adding code that spans more than one file. For long-form reference (every file, every command, every localStorage key), read [ABOUT.md](ABOUT.md). For working rules, read [CLAUDE.md](CLAUDE.md).

---

## The three layers

```
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — React (src/)                                              │
│                                                                      │
│   App.jsx (shell: TitleBar + Sidebar + PageRouter + global hooks)    │
│       │                                                              │
│       ▼                                                              │
│   Pages (src/components/*.jsx)  — compose primitives, own page state │
│       │                                                              │
│       ▼                                                              │
│   Primitives (src/components/ui/)   Hooks (src/hooks/)               │
│   Icons (src/icons/)                Normalizers (src/riotShapes.js)  │
│   Utils (src/utils/)                Themes (src/themes.js)           │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  invoke("cmd_name", { args })
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Tauri bridge                                              │
│                                                                      │
│   #[tauri::command] async fn foo(...) -> Result<T, String>           │
│   Lives in src-tauri/src/commands/<domain>.rs                        │
│   Wraps a riot::* function via spawn_blocking.                       │
│   NO business logic here — only argument shaping + state access.     │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  fn riot::do_thing(state) -> Result<…>
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Rust (src-tauri/src/)                                     │
│                                                                      │
│   riot/                            Caches (value_cache::Cache<T>)    │
│     auth.rs    (get_*_creds)         identity_cache.rs               │
│     http.rs    (node-shelled HTTP)   token_store.rs                  │
│     connection.rs                    match_details_cache.rs          │
│     agent_select.rs                  rr_cache.rs                     │
│     party.rs                         premier_cache.rs                │
│     queue.rs                         spend_tracker.rs                │
│     match_history.rs                 loadout_presets.rs              │
│     match_live.rs                    match_db.rs (SQLite)            │
│     stats.rs                                                         │
│     chat.rs                        oauth.rs (webview OAuth)          │
│     xmpp.rs   (fake presence)      discord.rs (Discord RPC)          │
│     process.rs (lockfile, region)  bomb_tracker.rs                   │
│     logging.rs                     cloud.rs (VT Cloud reqwest)       │
│     types.rs   (ConnectionState)   store.rs (Riot storefront)        │
│                                    coach.rs (LLM)                    │
└──────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
                  External: Riot local API,
                  PD/GLZ, valorant-api.com,
                  XMPP, Discord IPC, VT Cloud
```

---

## Rules per layer

### Layer 1 (Rust)

- **`riot/<domain>.rs`** owns a domain of API calls. Functions take `&Mutex<ConnectionState>` and return `Result<T, String>`. They use `get_local_creds` / `get_glz_creds` from `riot/auth.rs` — never lock the mutex directly.
- **`riot/http.rs`** is the only file that knows how Node-shelled HTTP requests are constructed. Everyone else calls `pd_get`, `glz_post`, etc. If a new endpoint family appears (e.g., `affinity-*`), add a helper here.
- **Persistent state** = a `value_cache::Cache<T>` in `src-tauri/src/<name>_cache.rs`. T is a `#[derive(Default, Serialize, Deserialize)]` struct. Each cache owns its own filename; the cache module handles concurrent writes, lazy load, and corruption rescue.
- **Cross-cutting Rust state** (Discord RPC, XMPP) is `Arc<Mutex<…>>` stored via `app.manage()` in `lib.rs::run()`.
- **Long-lived background work** (XMPP socket, OAuth webview, identity cache writes) lives in its own dedicated module. Don't bury it inside `connection.rs`.
- **No HTTP outside `riot/`** except `cloud.rs` (VT Cloud uses `reqwest` directly, not Node — distinct concern, distinct dependency).

### Layer 2 (Tauri bridge)

- **One command per Riot operation.** `connect`, `get_match_history`, `lock_agent`, etc.
- **Commands live in `src-tauri/src/commands/<domain>.rs`** — never in `lib.rs`. `lib.rs` only declares modules and runs `tauri::generate_handler![...]`.
- **Commands are thin.** They unwrap `tauri::State`, call into `riot::*`, return the result. Business logic belongs in the riot module.
- **Pattern for async blocking work:**

  ```rust
  #[tauri::command]
  async fn cmd(state: tauri::State<'_, SharedState>) -> Result<T, String> {
      let s = Arc::clone(&state);
      tauri::async_runtime::spawn_blocking(move || riot::do_thing(&s))
          .await
          .map_err(|e| format!("Task failed: {}", e))?
  }
  ```

  Node-shelled HTTP is blocking I/O. `spawn_blocking` is mandatory.

### Layer 3 (React)

- **`App.jsx` is a shell.** It wires global event listeners (via hooks), owns the connection/identity state shared across pages, holds the page router. It does **not** contain page-specific logic. Target ≤350 lines.
- **Pages compose primitives.** A page is the orchestrator for one screen — it fetches data, holds page state, renders sub-components from `src/components/<page-name>/` and primitives from `src/components/ui/`.
- **No page imports another page.** ESLint enforces this. If two pages need the same widget, lift it into `ui/` or into a co-located sub-component directory.
- **Effects use hooks.**
  - Async effect → `useAsyncEffect`.
  - Singleton-memoized async lookup → `useApiLookup`.
  - Anything else custom and reusable → add to `src/hooks/`.
- **Boundary normalization is mandatory.** Component code reads `entry.rrAfter`, not `entry.RankedRatingAfterUpdate`. Add a normalizer in `src/riotShapes.js` the first time a component reads a raw Riot field.
- **No business logic in `valApiSkins.js`.** That module is a singleton-memoized fetcher for static valorant-api.com assets. Lookups (e.g., "convert URL fragment to map metadata") are utility functions in `src/utils/maps.js`.
- **Persistent client-side state** lives in `localStorage` via the existing `cloud.js` helpers or direct `localStorage.getItem`. Sensitive material (API keys, OAuth tokens) belongs in the OS keychain via Rust — see issue [#15](https://github.com/TheKfcBandit/Valorant-Thing/issues/15).

---

## The boundary contract

There is exactly one channel between layers 3 and 1: the Tauri `invoke` call. **No exceptions.**

- The frontend never sees the lockfile, the access token, the entitlements JWT, the puuid, the region/shard, or the client version.
- The frontend receives **shaped** data — already-camelCased, already-defaulted, already-normalized. Either the Rust side serializes a clean shape, or `riotShapes.js` translates immediately on receipt.
- The frontend never spawns child processes, never reads game files, never opens network sockets directly. Anything that needs OS-level capability is a Tauri command.

---

## "If you're tempted to add something here, ask…"

| If you're about to add…                               | Ask first…                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| A constant to a page component                        | Does this belong in `src/utils/`?                               |
| An async IIFE inside `useEffect`                      | Does `useAsyncEffect` solve this?                               |
| A raw `.PascalCaseField` access on Riot data          | Should this go through `riotShapes.js`?                         |
| A `fetch` or `reqwest` call in React                  | This goes in Rust. No exceptions for "just a public API".       |
| Another file-IO module in `src-tauri/src/`            | Could this be a `value_cache::Cache<T>` instance?               |
| A new `#[tauri::command]` in `lib.rs`                 | It belongs in `src-tauri/src/commands/<domain>.rs`.             |
| A new section to a page that's already over 400 lines | Extract the existing biggest section first.                     |
| An `<svg>` literal inside a JSX file                  | This is an icon. It goes in `src/icons/`.                       |
| A new state-management library                        | App.jsx hooks are the agreed approach. Open an issue first.     |
| A new external SDK                                    | Get explicit user approval. The dependency surface stays small. |

---

## What lives outside this architecture (intentional)

- **`generate-icons.mjs`** — build-time script that produces app icons from a single source. Standalone, not part of the runtime.
- **`src/live/`** — a small plugin registry (`LiveModule` contract) for `MatchInfoPage`'s live cards. Modules don't reach into the page's state; they expose `fetch`, `CardSlot`, `DialogSection`. New live widgets register here.
- **`ABOUT.md`** — descriptive long-form codebase reference, written _by_ an AI agent _for_ future AI agents. It documents the historical shape of the codebase. As pages get decomposed, ABOUT.md may drift — refresh it after each major refactor.
- **VT Cloud (`vt-cloud.ajaxfnc.com`)** — anonymous share-code blob store. No auth, no user accounts. The codebase makes no assumptions about the cloud beyond `POST /share`, `GET /share/:code`.
