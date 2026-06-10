import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAsyncEffect } from "../../hooks/useAsyncEffect";
import { normalizeWallet } from "../../riotShapes";
import { groupPurchasesByMonth, sumPurchases } from "../../utils/purchases";
import { RARITY_COLORS } from "../../utils/rarity";
import { InfoCircle } from "../../icons";

const COLLECTION_PREVIEW = 48;

function fmtCosts({ vp, rp, kc }) {
  const parts = [];
  if (vp > 0) parts.push(`${vp.toLocaleString()} VP`);
  if (rp > 0) parts.push(`${rp.toLocaleString()} RP`);
  if (kc > 0) parts.push(`${kc.toLocaleString()} KC`);
  return parts;
}

function ItemRow({ meta, right, subRight }) {
  const tierColor = meta?.tier ? RARITY_COLORS[meta.tier] : null;
  return (
    <li
      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-base-700/40"
      style={tierColor ? { borderLeftColor: tierColor, borderLeftWidth: 2 } : undefined}
    >
      <div className="w-16 h-9 shrink-0 flex items-center justify-center bg-base-800/40 rounded">
        {meta?.icon ? (
          <img
            src={meta.icon}
            alt=""
            className="max-h-full max-w-full object-contain"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="text-[9px] text-text-muted">—</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-display font-semibold text-text-primary truncate">
          {meta?.name || "Unknown skin"}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-text-muted">{meta?.weapon || ""}</p>
      </div>
      <div className="text-right shrink-0">
        {right}
        {subRight}
      </div>
    </li>
  );
}

// #41: "what have I bought and what did it cost". Riot exposes no purchase
// ledger, so the primary answer is the COLLECTION view — every owned,
// store-priced skin from the entitlements list, totalled at catalog
// prices. The dated tracker below it records purchases detected while the
// app runs (the only way to get dates at all).
export function PurchaseHistoryPanel({ levelLookup, connected }) {
  const [collection, setCollection] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useAsyncEffect(
    async (isCancelled) => {
      if (connected) {
        // Summary first: it carries the ledger migration + price backfill.
        try {
          await invoke("get_spend_summary");
        } catch {
          // Token hiccup — the reads below still serve cached data.
        }
        if (isCancelled()) return;
        try {
          const col = await invoke("get_owned_collection");
          if (!isCancelled()) setCollection(col);
        } catch (e) {
          if (!isCancelled())
            setError(typeof e === "string" ? e : e?.message || "Collection load failed");
        }
        try {
          const raw = await invoke("get_wallet");
          if (!isCancelled()) setWallet(normalizeWallet(JSON.parse(raw)));
        } catch {
          // Balances are a bonus, not a requirement.
        }
      }
      if (isCancelled()) return;
      try {
        const res = await invoke("list_purchases");
        if (!isCancelled()) setLedger(res);
      } catch (e) {
        if (!isCancelled()) setError(typeof e === "string" ? e : e?.message || "Failed to load");
      }
    },
    [connected]
  );

  // Owned items sorted most-expensive-first, names resolved client-side.
  const collectionRows = useMemo(() => {
    const items = collection?.items || [];
    return [...items]
      .sort((a, b) => b.vp - a.vp || b.rp - a.rp || b.kc - a.kc)
      .map((it) => ({ ...it, meta: levelLookup[(it.uuid || "").toLowerCase()] }));
  }, [collection, levelLookup]);

  const purchases = Array.isArray(ledger?.purchases) ? ledger.purchases : [];
  const trackingSince = ledger?.trackingSinceMs
    ? new Date(ledger.trackingSinceMs).toLocaleDateString()
    : null;
  const trackedTotals = sumPurchases(purchases);
  const groups = groupPurchasesByMonth(purchases);
  const shownRows = showAll ? collectionRows : collectionRows.slice(0, COLLECTION_PREVIEW);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-base-700/50 p-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
            Collection value
          </p>
          <p className="text-xl font-display font-bold tabular-nums text-text-primary mt-1">
            {collection
              ? fmtCosts(
                  collection.vpTotal !== undefined
                    ? { vp: collection.vpTotal, rp: collection.rpTotal, kc: collection.kcTotal }
                    : { vp: 0, rp: 0, kc: 0 }
                ).join(" · ") || "0 VP"
              : connected
                ? "Calculating…"
                : "—"}
          </p>
          <p className="text-[10px] font-body text-text-muted mt-0.5">
            {collection
              ? `${collection.items.length} priced skins owned${
                  collection.unpriced > 0
                    ? ` · ${collection.unpriced} unpriced (battlepass / upgrades / bundle-only)`
                    : ""
                }`
              : connected
                ? "Reading your entitlements…"
                : "Connect (Valorant or Riot sign-in) to compute your collection"}
          </p>
        </div>
        {wallet && (
          <div className="text-right shrink-0">
            <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
              Wallet balance
            </p>
            <p className="text-sm font-display font-semibold tabular-nums text-text-primary mt-1">
              {wallet.vp.toLocaleString()} <span className="text-[10px] text-text-muted">VP</span>
            </p>
            <p className="text-[11px] font-mono tabular-nums text-text-secondary">
              {wallet.rp.toLocaleString()} RP · {wallet.kc.toLocaleString()} KC
            </p>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-base-700/30 text-[11px] font-body text-text-muted">
        <InfoCircle size={14} className="shrink-0 mt-0.5" />
        <span>
          Riot doesn't expose real purchase records, so the total is estimated from the current
          store price of every skin you own. Gifts count as spend, bundle discounts aren't
          reflected, and battlepass/upgrade items can't be priced. Purchase dates only exist for
          items detected while the app was running — those appear in the dated list below.
        </span>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md border border-val-red/40 bg-val-red/10 text-sm text-val-red">
          {error}
        </div>
      )}

      {collectionRows.length > 0 && (
        <section>
          <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-1.5">
            Your skins ({collectionRows.length})
          </h2>
          <ul className="space-y-1">
            {shownRows.map((it) => (
              <ItemRow
                key={it.uuid}
                meta={it.meta}
                right={
                  <p className="text-xs font-display font-semibold tabular-nums text-text-primary">
                    {fmtCosts(it).join(" · ")}
                  </p>
                }
              />
            ))}
          </ul>
          {!showAll && collectionRows.length > COLLECTION_PREVIEW && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-2 w-full py-1.5 rounded-md border border-border bg-base-700 hover:bg-base-600 text-[11px] font-display font-semibold text-text-secondary hover:text-text-primary transition-colors"
            >
              Show all {collectionRows.length.toLocaleString()} skins
            </button>
          )}
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-1.5">
          <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
            Dated purchases{trackingSince ? ` — tracked since ${trackingSince}` : ""}
          </h2>
          {purchases.length > 0 && (
            <span className="text-[10px] font-mono tabular-nums text-text-muted">
              {fmtCosts(trackedTotals).join(" · ")}
            </span>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="text-[11px] font-body text-text-muted px-1">
            Nothing dated yet — skins bought while the app is running show up here with the date and
            price.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="mb-2">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-[10px] font-display font-bold text-text-muted/80 uppercase tracking-wider">
                  {g.label}
                </h3>
                <span className="text-[10px] font-mono tabular-nums text-text-muted">
                  {fmtCosts(g.totals).join(" · ")}
                </span>
              </div>
              <ul className="space-y-1">
                {g.purchases.map((p) => (
                  <ItemRow
                    key={`${p.skin_level_uuid}-${p.date_ms}`}
                    meta={levelLookup[(p.skin_level_uuid || "").toLowerCase()]}
                    right={
                      fmtCosts(p).length > 0 ? (
                        <p className="text-xs font-display font-semibold tabular-nums text-text-primary">
                          {fmtCosts(p).join(" · ")}
                        </p>
                      ) : (
                        <p
                          className="text-xs font-body text-text-muted"
                          title="No store offer for this item — likely a battlepass reward, a radianite level upgrade, or a bundle-only skin"
                        >
                          No store price
                        </p>
                      )
                    }
                    subRight={
                      <p className="text-[10px] font-body text-text-muted tabular-nums">
                        seen {new Date(p.date_ms).toLocaleDateString()}
                      </p>
                    }
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
