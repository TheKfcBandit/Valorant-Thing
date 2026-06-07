# UI Primitives Catalog

The shared, low-level components that pages and sub-components compose from. **Reuse before adding.** If you're about to write JSX that matches a pattern in this catalog, import the primitive instead.

If you add a new primitive, **add an entry here in the same commit**. Catalog entries describe the contract, not the implementation — when in doubt, read the file.

---

## `Label`

[`./Label.jsx`](./Label.jsx)

Uppercase section heading. Replaces the inline class soup `text-[10px] font-display font-bold text-text-muted uppercase tracking-wider` that used to appear in 30+ places.

```jsx
import { Label } from "./ui/Label";

<Label>Match history</Label>
<Label as="h2" className="mb-3">Aggregate stats</Label>
```

**Props**

| Prop        | Default | Notes                                                    |
| ----------- | ------- | -------------------------------------------------------- |
| `as`        | `"p"`   | Polymorphic tag — `"h2"`, `"span"`, etc.                 |
| `className` | `""`    | Appended after the base classes; use for spacing tweaks. |
| `children`  | —       | The label text.                                          |
| `...rest`   | —       | Forwarded to the underlying element.                     |

**When to use**: any small uppercase label above a section, card, or form group.
**When NOT to use**: as a page title (use a real heading), as inline body text.

---

## Planned primitives (extract on second use)

These don't exist yet. As the page decomposition sweep (PR 3 in the leash plan) finds the same pattern in two places, extract it into `ui/` and add a catalog entry. **Don't pre-extract** — let the second use case justify the lift.

### `Button` (variants: `primary`, `secondary`, `danger`, `ghost`)

Targets: the dozens of inline `<button className="bg-val-red hover:bg-val-red-dark ...">` declarations across pages. One source of truth for hover/disabled/focus states.

### `IconButton`

Square button with only an icon inside; common pattern for toolbars and inline actions.

### `Card` / `Panel`

The `bg-base-700 border border-border rounded-lg p-4` pattern. Pages declare this dozens of times with subtle variations.

### `Section`

`Label` + content wrapper. Common pattern: a label above a card or form group with consistent spacing between.

### `Modal`

The overlay + escape-handling + click-outside pattern. Currently re-implemented inconsistently in `SettingsPage`, `MatchInfoPage`, `LoadoutPage`, `StorePage`. Should be one primitive.

### `Toggle`

The on/off switch UI. At least three different implementations exist today (`MapDodgePage`, `MiscPage`, `SettingsPage`, `InstalockPage`).

### `Tabs`

The tab-row + active-indicator pattern. Lives inline in several pages.

---

## Conventions for new primitives

1. **One file per primitive.** `src/components/ui/<Name>.jsx`.
2. **Named export**, not default. Makes refactors greppable.
3. **Polymorphic `as` prop** when the tag matters semantically (`Label`, `Button`-as-link).
4. **`className` is appended**, not replaced — let callers tweak spacing without copying the base classes.
5. **Forward `...rest`** to the underlying element so callers can add `onClick`, `aria-*`, `data-*`, etc.
6. **Variants via prop, not class.** `<Button variant="danger">` not `<Button className="bg-red-500">`.
7. **Catalog entry in the same commit.** No primitive lands without an entry here.
8. **No data-fetching, no business logic.** Primitives are presentational. State and effects live in pages and hooks.
