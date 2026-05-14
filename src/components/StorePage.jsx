import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { getLevelLookup } from "../valApiSkins";

const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };

const COST_VP = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
const COST_RP = "e59aa87c-4cbf-517a-5983-6e81511be9b7";
const COST_KC = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d";

const RARITY_COLORS = {
  "0cebb8be-46d7-c12a-d306-e9907bfc5a25": "#5a9fe2",
  "60bca009-4182-7998-dee7-b8a2558dc369": "#009587",
  "12683d76-48d7-84a3-4e09-6985794f0445": "#d1548d",
  "411e4a55-4e59-7757-41f0-86a53f101bb5": "#f5955b",
  "e046854e-406c-37f4-6607-19a9ba8426fc": "#fad663",
};

function fmtCost(cost) {
  if (!cost || typeof cost !== "object") return null;
  const vp = cost[COST_VP];
  const rp = cost[COST_RP];
  const kc = cost[COST_KC];
  if (vp != null) return { amount: vp, currency: "VP" };
  if (rp != null) return { amount: rp, currency: "RP" };
  if (kc != null) return { amount: kc, currency: "KC" };
  const first = Object.values(cost)[0];
  return first != null ? { amount: first, currency: "" } : null;
}

function fmtRemaining(seconds) {
  if (seconds == null || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function StorePage({ connected }) {
  const [storeRaw, setStoreRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [levelLookup, setLevelLookup] = useState({});
  const [wishlist, setWishlist] = useState(() => {
    try {
      const raw = localStorage.getItem("wishlist_skins");
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(
        (Array.isArray(parsed) ? parsed : [])
          .filter(s => s != null)
          .map(s => String(s).toLowerCase())
      );
    } catch { return new Set(); }
  });
  const [now, setNow] = useState(Date.now());
  const fetchedAtRef = useRef(0);

  useEffect(() => {
    getLevelLookup()
      .then(setLevelLookup)
      .catch(e => console.warn("[Store] Skin lookup load failed:", e));
  }, []);

  const [staleSinceMs, setStaleSinceMs] = useState(null);

  const fetchStore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Phase A of #18: get_storefront returns { raw, fetched_at_ms, stale_since_ms }.
      // stale_since_ms is non-null when the live fetch failed and we're serving
      // the on-disk cached snapshot from a prior session.
      const res = await invoke("get_storefront");
      setStoreRaw(JSON.parse(res.raw));
      fetchedAtRef.current = res.fetched_at_ms || Date.now();
      setStaleSinceMs(res.stale_since_ms || null);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!storeRaw) fetchStore();
  }, [connected, storeRaw, fetchStore]);

  useEffect(() => {
    const unsub = listen("store-update", (event) => {
      try {
        const payload = event.payload;
        const raw = typeof payload === "string" ? payload : payload.raw;
        if (raw) {
          setStoreRaw(JSON.parse(raw));
          fetchedAtRef.current = Date.now();
        }
      } catch (e) {
        console.warn("[Store] store-update payload parse failed:", e);
      }
    });
    return () => { unsub.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const persistWishlist = useCallback((set) => {
    const arr = Array.from(set);
    localStorage.setItem("wishlist_skins", JSON.stringify(arr));
    invoke("set_wishlist", { items: arr })
      .catch(e => console.warn("[Store] set_wishlist failed:", e));
  }, []);

  const toggleWishlist = useCallback((levelUuid) => {
    if (!levelUuid) return;
    setWishlist(prev => {
      const next = new Set(prev);
      const k = levelUuid.toLowerCase();
      if (next.has(k)) next.delete(k); else next.add(k);
      persistWishlist(next);
      return next;
    });
  }, [persistWishlist]);

  const dailyOffers = useMemo(() => {
    if (!storeRaw) return [];
    const panel = storeRaw.SkinsPanelLayout || {};
    const offers = panel.SingleItemStoreOffers || [];
    const ids = panel.SingleItemOffers || [];
    if (offers.length) {
      return offers.map(o => ({
        offerId: (o.OfferID || "").toLowerCase(),
        cost: fmtCost(o.Cost),
      }));
    }
    return ids.map(id => ({ offerId: (id || "").toLowerCase(), cost: null }));
  }, [storeRaw]);

  const accessoryOffers = useMemo(() => {
    if (!storeRaw) return [];
    const accs = storeRaw.AccessoryStore || {};
    const list = accs.AccessoryStoreOffers || [];
    return list.map(a => {
      const offer = a.Offer || a;
      const rewards = offer.Rewards || [];
      return {
        offerId: (offer.OfferID || "").toLowerCase(),
        cost: fmtCost(offer.Cost),
        rewards: rewards.map(r => ({ itemTypeId: r.ItemTypeID, itemId: r.ItemID })),
      };
    });
  }, [storeRaw]);

  const featuredBundle = useMemo(() => {
    if (!storeRaw) return null;
    const fb = storeRaw.FeaturedBundle?.Bundle;
    if (!fb) return null;
    return {
      id: fb.ID,
      dataAssetId: fb.DataAssetID,
      cost: fmtCost(fb.TotalDiscountedCost || fb.TotalBaseCost),
      remaining: fb.DurationRemainingInSeconds,
      items: (fb.Items || []).length,
    };
  }, [storeRaw]);

  const nightMarket = useMemo(() => {
    if (!storeRaw) return null;
    const nm = storeRaw.BonusStore;
    if (!nm) return null;
    const offers = nm.BonusStoreOffers || [];
    return {
      remaining: nm.BonusStoreRemainingDurationInSeconds,
      offers: offers.map(o => ({
        offerId: (o.Offer?.OfferID || o.BonusOfferID || "").toLowerCase(),
        baseCost: fmtCost(o.Offer?.Cost),
        discountedCost: fmtCost(o.DiscountCosts),
        discountPct: o.DiscountPercent,
        seen: o.IsSeen,
      })),
    };
  }, [storeRaw]);

  const dailyResetSecs = storeRaw?.SkinsPanelLayout?.SingleItemOffersRemainingDurationInSeconds;
  const accessoryResetSecs = storeRaw?.AccessoryStore?.AccessoryStoreRemainingDurationInSeconds;

  // Tick the displayed countdowns from local time, but anchor to the value
  // at fetch time so we don't drift.
  const dailyCountdown = useMemo(() => {
    if (dailyResetSecs == null) return null;
    const elapsed = Math.floor((now - fetchedAtRef.current) / 1000);
    return Math.max(0, dailyResetSecs - elapsed);
  }, [dailyResetSecs, now]);

  const accessoryCountdown = useMemo(() => {
    if (accessoryResetSecs == null) return null;
    const elapsed = Math.floor((now - fetchedAtRef.current) / 1000);
    return Math.max(0, accessoryResetSecs - elapsed);
  }, [accessoryResetSecs, now]);

  // Phase A of #18: we render even when not connected — the backend falls back
  // to the on-disk cached storefront and tells us via `staleSinceMs`. The only
  // not-rendering case is "no cache + no connection", which falls through the
  // error banner below.
  if (!connected && !storeRaw && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted mx-auto">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
          <p className="text-sm font-display text-text-muted">No store data yet</p>
          <p className="text-[11px] font-body text-text-muted/60">Open Valorant once and reopen this page</p>
        </div>
      </div>
    );
  }

  // Stale derivation. crossesMidnight is true when the cached snapshot was
  // taken before the most recent UTC midnight — i.e. it's last reset's data
  // and the offers shown are NOT today's. That's a strong wording change.
  const staleAgeMs = staleSinceMs ? Date.now() - staleSinceMs : 0;
  const lastUtcMidnight = (() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  })();
  const crossesMidnight = staleSinceMs != null && staleSinceMs < lastUtcMidnight;
  const staleAgeText = (() => {
    if (!staleSinceMs) return null;
    const m = Math.max(0, Math.floor(staleAgeMs / 60000));
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Store</h1>
          <p className="text-xs text-text-muted">
            {dailyCountdown != null && <>Daily resets in <span className="tabular-nums">{fmtRemaining(dailyCountdown)}</span></>}
            {accessoryCountdown != null && dailyCountdown != null && " · "}
            {accessoryCountdown != null && <>Accessories reset in <span className="tabular-nums">{fmtRemaining(accessoryCountdown)}</span></>}
          </p>
        </div>
        <button
          onClick={fetchStore}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-border bg-base-700 hover:bg-base-600 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="px-3 py-2 rounded-md border border-val-red/40 bg-val-red/10 text-sm text-val-red">
          {error}
        </div>
      )}

      {staleSinceMs && (
        <div className={`px-3 py-2 rounded-md border text-xs font-body ${crossesMidnight ? "border-val-red/40 bg-val-red/10 text-val-red" : "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"}`}>
          {crossesMidnight
            ? <>⚠️ Showing yesterday's reset (last updated {staleAgeText}). Today's offers are different — open Valorant to refresh.</>
            : <>Last updated {staleAgeText} · cached (Valorant not running)</>}
        </div>
      )}

      <Section title="Daily Offers" subtitle="Resets every 24 hours">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AnimatePresence>
            {dailyOffers.map((offer) => (
              <SkinCard
                key={offer.offerId}
                offer={offer}
                meta={levelLookup[offer.offerId]}
                wishlisted={wishlist.has(offer.offerId)}
                onToggleWishlist={() => toggleWishlist(offer.offerId)}
              />
            ))}
          </AnimatePresence>
        </div>
      </Section>

      {nightMarket && nightMarket.offers.length > 0 && (
        <Section
          title="Night Market"
          subtitle={nightMarket.remaining != null ? `Closes in ${fmtRemaining(nightMarket.remaining)}` : null}
          accentColor="rgb(var(--val-red))"
        >
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {nightMarket.offers.map((o) => (
              <SkinCard
                key={o.offerId}
                offer={{ offerId: o.offerId, cost: o.discountedCost, baseCost: o.baseCost, discountPct: o.discountPct }}
                meta={levelLookup[o.offerId]}
                wishlisted={wishlist.has(o.offerId)}
                onToggleWishlist={() => toggleWishlist(o.offerId)}
                nightMarket
              />
            ))}
          </div>
        </Section>
      )}

      {featuredBundle && (
        <Section title="Featured Bundle" subtitle={featuredBundle.remaining != null ? `Closes in ${fmtRemaining(featuredBundle.remaining)}` : null}>
          <div className="rounded-lg border border-border bg-base-700/50 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">Bundle ID</p>
              <p className="text-xs font-mono text-text-muted truncate max-w-[420px]">{featuredBundle.dataAssetId || featuredBundle.id}</p>
              <p className="text-xs text-text-muted mt-1">{featuredBundle.items} items</p>
            </div>
            {featuredBundle.cost && (
              <div className="text-right">
                <p className="text-xs text-text-muted">Total</p>
                <p className="text-lg font-display font-bold tabular-nums text-text-primary">
                  {featuredBundle.cost.amount.toLocaleString()} <span className="text-xs text-text-muted">{featuredBundle.cost.currency}</span>
                </p>
              </div>
            )}
          </div>
        </Section>
      )}

      {accessoryOffers.length > 0 && (
        <Section title="Accessory Store" subtitle="Resets weekly">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {accessoryOffers.map((a) => (
              <div key={a.offerId} className="rounded-lg border border-border bg-base-700/50 p-3">
                <p className="text-xs text-text-muted">{a.rewards.length} reward{a.rewards.length === 1 ? "" : "s"}</p>
                {a.cost && (
                  <p className="text-sm font-display font-semibold text-text-primary mt-1 tabular-nums">
                    {a.cost.amount.toLocaleString()} <span className="text-xs text-text-muted">{a.cost.currency}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {storeRaw && dailyOffers.length === 0 && (
        <p className="text-text-muted text-sm">No daily offers in response.</p>
      )}
    </div>
  );
}

function Section({ title, subtitle, accentColor, children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2
          className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {title}
        </h2>
        {subtitle && <span className="text-[10px] text-text-muted tabular-nums">{subtitle}</span>}
      </div>
      {children}
    </motion.section>
  );
}

function SkinCard({ offer, meta, wishlisted, onToggleWishlist, nightMarket }) {
  const tierColor = meta?.tier ? RARITY_COLORS[meta.tier] || "rgb(var(--text-muted))" : "rgb(var(--text-muted))";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="relative rounded-lg border border-border bg-base-700/50 overflow-hidden flex flex-col"
    >
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={onToggleWishlist}
          className="p-1.5 rounded-full bg-base-800/70 hover:bg-base-800 transition-colors"
          title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={wishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" style={{ color: wishlisted ? "rgb(var(--val-red))" : "rgb(var(--text-muted))" }}>
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </button>
      </div>
      <div className="aspect-[2/1] w-full flex items-center justify-center p-3" style={{ background: `linear-gradient(135deg, ${tierColor}22 0%, transparent 60%)` }}>
        {meta?.icon ? (
          <img src={meta.icon} alt={meta.name} className="max-h-full max-w-full object-contain" loading="lazy" draggable={false} />
        ) : (
          <div className="text-text-muted text-xs">No preview</div>
        )}
      </div>
      <div className="p-3 border-t border-border" style={{ borderTopColor: tierColor + "40" }}>
        <p className="text-sm font-display font-semibold text-text-primary truncate">{meta?.name || "Unknown skin"}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">{meta?.weapon || ""}</span>
          {offer.cost && (
            <span className="text-sm font-display font-semibold tabular-nums text-text-primary">
              {offer.cost.amount.toLocaleString()} <span className="text-[10px] text-text-muted">{offer.cost.currency}</span>
            </span>
          )}
        </div>
        {nightMarket && offer.baseCost && offer.discountPct != null && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] line-through text-text-muted tabular-nums">{offer.baseCost.amount.toLocaleString()}</span>
            <span className="text-[10px] font-semibold" style={{ color: "rgb(var(--val-red))" }}>-{offer.discountPct}%</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
