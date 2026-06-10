import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAsyncEffect } from "../../hooks/useAsyncEffect";
import { normalizeWallet } from "../../riotShapes";
import { groupPurchasesByMonth, sumPurchases } from "../../utils/purchases";
import { RARITY_COLORS } from "../../utils/rarity";
import { InfoCircle } from "../../icons";

function fmtCosts({ vp, rp, kc }) {
  const parts = [];
  if (vp > 0) parts.push(`${vp.toLocaleString()} VP`);
  if (rp > 0) parts.push(`${rp.toLocaleString()} RP`);
  if (kc > 0) parts.push(`${kc.toLocaleString()} KC`);
  return parts;
}

// #41: itemized view over the spend-tracker ledger. Riot exposes no real
// purchase/order endpoint (the PD store surface is storefront, prices,
// wallet, owned-items — verified June 2026), so this renders the honest
// version of the diff heuristic: items first seen while the app was
// running, priced from the offers catalog at detection time. The wallet
// chips are the one piece of genuinely live data.
export function PurchaseHistoryPanel({ levelLookup }) {
  const [ledger, setLedger] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState(null);

  useAsyncEffect(async (isCancelled) => {
    try {
      const res = await invoke("list_purchases");
      if (!isCancelled()) setLedger(res);
    } catch (e) {
      if (!isCancelled()) setError(typeof e === "string" ? e : e?.message || "Failed to load");
    }
    try {
      const raw = await invoke("get_wallet");
      if (!isCancelled()) setWallet(normalizeWallet(JSON.parse(raw)));
    } catch {
      // No live session — balances are a bonus, not a requirement.
    }
  }, []);

  if (error) {
    return (
      <div className="px-3 py-2 rounded-md border border-val-red/40 bg-val-red/10 text-sm text-val-red">
        {error}
      </div>
    );
  }
  if (!ledger) {
    return <p className="text-xs font-body text-text-muted py-8 text-center">Loading…</p>;
  }

  const purchases = Array.isArray(ledger.purchases) ? ledger.purchases : [];
  const trackingSince = ledger.trackingSinceMs
    ? new Date(ledger.trackingSinceMs).toLocaleDateString()
    : null;
  const allTime = sumPurchases(purchases);
  const groups = groupPurchasesByMonth(purchases);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-base-700/50 p-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
            Total tracked spend{trackingSince ? ` since ${trackingSince}` : ""}
          </p>
          <p className="text-xl font-display font-bold tabular-nums text-text-primary mt-1">
            {fmtCosts(allTime).join(" · ") || "0 VP"}
          </p>
          <p className="text-[10px] font-body text-text-muted mt-0.5">
            {purchases.length} item{purchases.length === 1 ? "" : "s"}
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
          Riot doesn't expose a real purchase ledger, so this list only contains skins first seen
          while the app was running{trackingSince ? ` (tracking since ${trackingSince})` : ""}.
          Dates are detection dates, prices come from the store catalog, and VP top-ups,
          battlepasses and accessories aren't counted.
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-10 space-y-1">
          <p className="text-sm font-display text-text-muted">No purchases recorded yet</p>
          <p className="text-[11px] font-body text-text-muted/60">
            {trackingSince
              ? "Buy a skin while the app is running and it'll show up here."
              : "Open the app while Valorant runs to take the first baseline snapshot."}
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <div className="flex items-baseline justify-between mb-1.5">
              <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
                {g.label}
              </h2>
              <span className="text-[10px] font-mono tabular-nums text-text-muted">
                {fmtCosts(g.totals).join(" · ")}
              </span>
            </div>
            <ul className="space-y-1">
              {g.purchases.map((p) => {
                const meta = levelLookup[(p.skin_level_uuid || "").toLowerCase()];
                const tierColor = meta?.tier ? RARITY_COLORS[meta.tier] : null;
                return (
                  <li
                    key={`${p.skin_level_uuid}-${p.date_ms}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-base-700/40"
                    style={
                      tierColor ? { borderLeftColor: tierColor, borderLeftWidth: 2 } : undefined
                    }
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
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">
                        {meta?.weapon || ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {fmtCosts(p).length > 0 ? (
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
                      )}
                      <p className="text-[10px] font-body text-text-muted tabular-nums">
                        seen {new Date(p.date_ms).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
