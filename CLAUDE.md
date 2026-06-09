# CLAUDE.md — Rules for AI sessions on Valorant-Thing

You are working on a Tauri v2 + Rust + React 19 desktop app. This file is the **leash**: rules that exist because past sessions ignored them and created chaos that took weeks to undo. Read this _before_ writing code. If a rule conflicts with your instinct, the rule wins — the instinct is what produced the chaos.

For long-form context, read [ARCHITECTURE.md](ARCHITECTURE.md) (the map) and [ABOUT.md](ABOUT.md) (the museum). This file is short on purpose.

---

## Reuse before adding

Every one of these already exists. If your task could be done by using one, **use it**. Don't reinvent.

### React primitives — `src/components/ui/`

See [src/components/ui/CATALOG.md](src/components/ui/CATALOG.md) for the full prop API of each.

- `Label` — uppercase section heading. Replaces inline `text-[10px] font-display font-bold text-text-muted uppercase tracking-wider`.

### Hooks — `src/hooks/`

- `useAsyncEffect(effect, deps)` — async effects with `let cancelled = false` correctly handled. Closure gets `isCancelled()`. Use this instead of writing the IIFE pattern by hand.
- `useApiLookup(getter)` — bridges a singleton-memoized async getter (e.g., `getAgentLookup`, `getMaps` from `src/valApiSkins.js`) to React state. Returns `{}` not `null` so `lookup[id]?.foo` is safe.

### Boundary normalizers — `src/riotShapes.js`

External Riot blobs use mixed case conventions; this file maps them to stable camelCase shapes. **Add a normalizer here when you start reading raw Riot fields in a new component.** Never sprinkle PascalCase access through component code.

### Rust cache — `src-tauri/src/value_cache.rs`

`Cache<T>` (where T: Default + Serialize + DeserializeOwned). `.read(app, |v| ...)` for reads, `.write(app, |v| (result, should_persist))` for mutations. Lazy-load, corrupt-file rescue, concurrent-safe.

All six file-backed stores use it: `match_details_cache`, `rr_cache`, `premier_cache`, `identity_cache`, `spend_tracker`, `loadout_presets`. (`token_store` and `secret_store` are deliberate exceptions — OS keychain primary with a JSON fallback; `match_db` is SQLite.) **A new persistent store MUST be another `Cache<T>` instance**, not a hand-rolled file IO module.

### Plugin registry — `src/live/registry.js`

A `LiveModule` contract (id, label, fetch?, CardSlot?, DialogSection?). New live-data widgets should register here, not hard-code into `MatchInfoPage`.

---

## Where things go

| If you're adding…                          | Put it in…                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| SVG icon                                   | `src/icons/<name>.jsx` + re-export from `src/icons/index.js`. **No inline SVG consts at module scope in pages.** |
| Theme preset                               | `src/themes.js`                                                                                                  |
| Constant lookup (`MODE_NAMES`, `ROLES`, …) | `src/utils/<domain>.js`. One file per domain — `maps.js`, `agents.js`, `gameMode.js`, `queues.js`.               |
| Helper function                            | `src/utils/<domain>.js` if pure; `src/hooks/use<Name>.js` if it touches React state                              |
| Riot API call                              | `src-tauri/src/riot/<domain>.rs` (function) + `#[tauri::command]` in `src-tauri/src/commands/<domain>.rs`        |
| Persistent state on disk                   | New `value_cache::Cache<T>` instance in `src-tauri/src/<name>_cache.rs`                                          |
| UI primitive                               | `src/components/ui/<Name>.jsx` + add entry to `src/components/ui/CATALOG.md`                                     |
| Page-specific sub-component                | `src/components/<page-name>/<Name>.jsx`. The page composes them; it does not embed them inline.                  |

---

## File-size budget

| Target | Ceiling | Files                                   |
| ------ | ------- | --------------------------------------- |
| 400    | 500     | `.jsx` / `.js` page components          |
| 400    | 500     | `.rs` Rust modules                      |
| 300    | —       | `lib.rs` (only `run()` + plugin wiring) |

ESLint warns at 500 lines. If a file is approaching the budget, **decompose before adding to it**. Don't append "just one more section." That's how we got to 2,490 lines.

---

## Style rules

1. **No comments unless explaining a non-obvious _why_.** A comment that re-describes what the code already says is noise. Comments that document a hidden constraint (Riot returns max 20 entries, this UUID is a Vyse re-skin, etc.) are good. A comment tagging an issue number is fine _if_ it explains _why_ the code is shaped that way.
2. **Self-documenting names.** `fetchHomeStats` not `getData`. `normalizeRrEntry` not `parseRr`.
3. **Early-out on invalid data.** Don't nest happy-path inside `if (data) { if (data.foo) { ... } }`. Use `if (!data?.foo) return null;`.
4. **No new dependencies** without explicit user approval. The project deliberately keeps the dependency surface small.
5. **Tailwind only** for styling. No CSS modules, no styled-components.
6. **Inline SVGs** for icons (no icon library), **but only in `src/icons/`**.
7. **Functional React only.** Hooks, no class components.
8. **Credentials never cross the Tauri bridge.** Frontend calls `#[tauri::command]`s; the Rust side owns tokens.

---

## Definition of done (every feature PR)

Before you mark a task complete, verify:

- [ ] File-size budget respected. Any new file ≤ 500 lines. Any modified file did not _grow past_ 500 lines.
- [ ] No inline SVG declarations outside `src/icons/`.
- [ ] No duplicated constants — checked `src/utils/` and `src/themes.js` before declaring a new one.
- [ ] Boundary normalizers in `src/riotShapes.js` are used; raw PascalCase field access does not appear in component code.
- [ ] Async effects use `useAsyncEffect` from `src/hooks/`.
- [ ] Persistent Rust state uses `value_cache::Cache<T>`.
- [ ] New UI primitive (if any) has a CATALOG.md entry.
- [ ] `npm run lint` is clean (warnings are allowed; errors are not).
- [ ] `npm run format:check` passes.
- [ ] `npm test` passes; new pure utilities have at least one smoke test.
- [ ] `cargo fmt --check && cargo clippy -- -D warnings && cargo test` from `src-tauri/`.
- [ ] App launched via `npx tauri dev`; the changed surface was exercised by hand.

---

## Anti-patterns (with examples from real recent violations)

### ❌ Re-declaring a constant that already exists

```jsx
// src/components/PartyPage.jsx — DON'T
const MODE_NAMES = {
  BombGameMode: "Standard",
  DeathmatchGameMode: "Deathmatch",
  // …
};
```

```jsx
// DO
import { MODE_NAMES } from "../utils/gameMode";
```

### ❌ Inline SVG as a module-scoped const

```jsx
// src/components/InstalockPage.jsx — DON'T
const GLOBE_ICON = (<svg width="16" height="16" viewBox="0 0 24 24" ...>...</svg>);
```

```jsx
// DO — src/icons/Globe.jsx
export function Globe({ size = 16, className = "" }) {
  return <svg width={size} height={size} className={className} ...>...</svg>;
}

// then in the page
import { Globe } from "../icons";
```

### ❌ Hand-rolling async effect cleanup

```jsx
// DON'T
useEffect(() => {
  let cancelled = false;
  (async () => {
    const data = await invoke("foo");
    if (!cancelled) setData(data);
  })();
  return () => {
    cancelled = true;
  };
}, [deps]);
```

```jsx
// DO
useAsyncEffect(
  async (isCancelled) => {
    const data = await invoke("foo");
    if (!isCancelled()) setData(data);
  },
  [deps]
);
```

### ❌ Reading raw PascalCase from a Riot response

```jsx
// DON'T
const rr = entry.RankedRatingAfterUpdate;
```

```jsx
// DO — src/riotShapes.js owns the case translation
const { rrAfter } = normalizeRrEntry(entry);
```

### ❌ Letting a page grow past budget

If `HomePage.jsx` is at 480 lines and you want to add a section, **don't add it inline**. Extract the existing biggest section into `src/components/home/<Section>.jsx` first, then add your section.

---

## What this file is not

- Not a feature spec. Roadmap lives in GitHub issues (label: `roadmap`, milestone: `v2.x Roadmap (User Wishlist)`).
- Not architecture documentation. That's [ARCHITECTURE.md](ARCHITECTURE.md).
- Not historical. That's [ABOUT.md](ABOUT.md).
- Not exhaustive. It's the minimum rules to prevent re-creating the chaos. If you're unsure, ask.
