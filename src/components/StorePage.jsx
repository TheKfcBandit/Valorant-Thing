import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion } from "framer-motion";
import { getLevelLookup, getBundleLookup, getAccessoryLookup } from "../valApiSkins";
import { noAnim, T0 } from "../utils/animation";

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
  const [bundleLookup, setBundleLookup] = useState({});
  const [accessoryLookup, setAccessoryLookup] = useState({});
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [spendSummary, setSpendSummary] = useState(null); // populated when user clicks "Show spend history"
  const [spendLoading, setSpendLoading] = useState(false);
  const [bundleIndex, setBundleIndex] = useState(0);
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
    getBundleLookup()
      .then(setBundleLookup)
      .catch(e => console.warn("[Store] Bundle lookup load failed:", e));
    getAccessoryLookup()
      .then(setAccessoryLookup)
      .catch(e => console.warn("[Store] Accessory lookup load failed:", e));
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
          // Fresh data from the background poller — drop the stale banner.
          setStaleSinceMs(null);
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

  // Reset NM total + bundle carousel index whenever the storefront changes
  // so stale UI state can't bleed across days.
  useEffect(() => { setSpendSummary(null); setBundleIndex(0); }, [storeRaw]);

  const loadSpendSummary = useCallback(async () => {
    setSpendLoading(true);
    try {
      const summary = await invoke("get_spend_summary");
      setSpendSummary(summary);
    } catch (e) {
      console.warn("[Store] spend summary failed:", e);
      setSpendSummary({ error: typeof e === "string" ? e : e?.message || "Failed" });
    } finally {
      setSpendLoading(false);
    }
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
        rewards: rewards.map(r => ({
          itemTypeId: r.ItemTypeID,
          itemId: (r.ItemID || "").toLowerCase(),
        })),
      };
    });
  }, [storeRaw]);

  // Riot returns the active bundle as `FeaturedBundle.Bundle` (singular) AND
  // a `FeaturedBundle.Bundles` array. On multi-bundle weeks the array carries
  // entries the singular field doesn't, so we union them and dedupe by ID.
  const featuredBundles = useMemo(() => {
    if (!storeRaw) return [];
    const fb = storeRaw.FeaturedBundle || {};
    const arr = Array.isArray(fb.Bundles) ? [...fb.Bundles] : [];
    if (fb.Bundle && !arr.some(b => b.ID === fb.Bundle.ID)) arr.unshift(fb.Bundle);
    return arr.map(b => ({
      id: b.ID,
      dataAssetId: (b.DataAssetID || "").toLowerCase(),
      cost: fmtCost(b.TotalDiscountedCost || b.TotalBaseCost),
      remaining: b.DurationRemainingInSeconds,
    }));
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
        <h1 className="text-2xl font-display font-bold text-text-primary">Store</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWishlistOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-border bg-base-700 hover:bg-base-600 text-text-primary"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-val-red">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            Wishlist
            {wishlist.size > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-val-red/20 text-val-red text-[10px] tabular-nums">{wishlist.size}</span>
            )}
          </button>
          <button
            onClick={fetchStore}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-border bg-base-700 hover:bg-base-600 disabled:opacity-50 text-text-primary"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
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

      {featuredBundles.length > 0 && (
        <BundleCarousel
          bundles={featuredBundles}
          index={bundleIndex}
          onIndex={setBundleIndex}
          lookup={bundleLookup}
        />
      )}

      <Section
        title="Daily Offers"
        subtitle={dailyCountdown != null ? `Resets in ${fmtRemaining(dailyCountdown)}` : "Resets every 24 hours"}
      >
        <div className="grid grid-cols-4 gap-3">
          {dailyOffers.map((offer) => (
            <SkinCard
              key={offer.offerId}
              offer={offer}
              meta={levelLookup[offer.offerId]}
              wishlisted={wishlist.has(offer.offerId)}
              onToggleWishlist={() => toggleWishlist(offer.offerId)}
            />
          ))}
        </div>
      </Section>

      {accessoryOffers.length > 0 && (
        <Section
          title="Accessory Store"
          subtitle={accessoryCountdown != null ? `Resets in ${fmtRemaining(accessoryCountdown)}` : "Resets weekly"}
        >
          <div className="grid grid-cols-4 gap-3">
            {accessoryOffers.map((a) => (
              <AccessoryCard key={a.offerId} offer={a} lookup={accessoryLookup} />
            ))}
          </div>
        </Section>
      )}

      {nightMarket && nightMarket.offers.length > 0 && (
        <Section
          title="Night Market"
          subtitle={
            <NightMarketSubtitle
              remaining={nightMarket.remaining}
              summary={spendSummary}
              loading={spendLoading}
              onShow={loadSpendSummary}
            />
          }
          accentColor="rgb(var(--val-red))"
        >
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, nightMarket.offers.length)}, minmax(0, 1fr))` }}
          >
            {nightMarket.offers.map((o) => (
              <SkinCard
                key={o.offerId}
                offer={{ offerId: o.offerId, cost: o.discountedCost, baseCost: o.baseCost, discountPct: o.discountPct }}
                meta={levelLookup[o.offerId]}
                wishlisted={wishlist.has(o.offerId)}
                onToggleWishlist={() => toggleWishlist(o.offerId)}
                nightMarket
                portrait
              />
            ))}
          </div>
        </Section>
      )}

      <WishlistModal
        open={wishlistOpen}
        wishlistedIds={Array.from(wishlist)}
        levelLookup={levelLookup}
        onClose={() => setWishlistOpen(false)}
        onRemove={toggleWishlist}
      />
    </div>
  );
}

function NightMarketSubtitle({ remaining, summary, loading, onShow }) {
  const closes = remaining != null ? `Closes in ${fmtRemaining(remaining)}` : null;
  return (
    <span className="inline-flex items-center gap-3">
      {closes && <span className="tabular-nums">{closes}</span>}
      {summary == null ? (
        <button
          onClick={onShow}
          disabled={loading}
          className="px-2 py-0.5 rounded text-[10px] font-display font-semibold border border-val-red/40 bg-val-red/10 text-val-red hover:bg-val-red/20 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Show spend history"}
        </button>
      ) : summary.error ? (
        <span className="text-[10px] text-val-red">Spend: {summary.error}</span>
      ) : (
        <span className="text-[10px] text-val-red tabular-nums">
          {formatSpendSummary(summary)}
        </span>
      )}
    </span>
  );
}

function formatSpendSummary(s) {
  const parts = [];
  if (s.vpSpent) parts.push(`${Number(s.vpSpent).toLocaleString()} VP`);
  if (s.rpSpent) parts.push(`${Number(s.rpSpent).toLocaleString()} RP`);
  if (s.kcSpent) parts.push(`${Number(s.kcSpent).toLocaleString()} KC`);
  if (parts.length === 0) return "No purchases tracked yet";
  const count = Array.isArray(s.purchases) ? s.purchases.length : 0;
  const totals = parts.join(" · ");
  return `Spent in store: ${totals}${count ? ` across ${count} skin${count === 1 ? "" : "s"}` : ""}`;
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

function SkinCard({ offer, meta, wishlisted, onToggleWishlist, nightMarket, portrait }) {
  const tierColor = meta?.tier ? RARITY_COLORS[meta.tier] || "rgb(var(--text-muted))" : "rgb(var(--text-muted))";
  const aspectClass = portrait ? "aspect-[3/4]" : "aspect-[2/1]";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="relative rounded-lg border border-border bg-base-700/50 overflow-hidden flex flex-col h-full"
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
      <div className={`${aspectClass} w-full flex items-center justify-center p-3`} style={{ background: `linear-gradient(135deg, ${tierColor}22 0%, transparent 60%)` }}>
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

function BundleCarousel({ bundles, index, onIndex, lookup }) {
  const safeIndex = Math.min(Math.max(0, index), bundles.length - 1);
  const bundle = bundles[safeIndex];
  if (!bundle) return null;
  const meta = lookup[bundle.dataAssetId] || {};
  const hero = meta.verticalPromoImage || meta.displayIcon || null;
  // No hero image → use the compact info row regardless of whether the name
  // is known, so we never render <img src={null}>. The compact row still
  // shows the real name if we have one.
  const useCompactRow = !hero;
  const hasMultiple = bundles.length > 1;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
          Featured Bundle{hasMultiple ? `s (${safeIndex + 1}/${bundles.length})` : ""}
        </h2>
        {bundle.remaining != null && (
          <span className="text-[10px] text-text-muted tabular-nums">Closes in {fmtRemaining(bundle.remaining)}</span>
        )}
      </div>
      {useCompactRow ? (
        <div className="relative rounded-lg border border-border bg-base-700/50 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-display font-semibold text-text-primary">{meta.displayName || "New bundle"}</p>
            <p className="text-[11px] font-body italic text-text-muted mt-0.5">Image not yet available</p>
          </div>
          {bundle.cost && (
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Total</p>
              <p className="text-base font-display font-bold tabular-nums text-text-primary">
                {bundle.cost.amount.toLocaleString()} <span className="text-xs text-text-muted">{bundle.cost.currency}</span>
              </p>
            </div>
          )}
          {hasMultiple && (
            <BundleCarouselControls bundles={bundles} safeIndex={safeIndex} onIndex={onIndex} compact />
          )}
        </div>
      ) : (
        <div className="relative rounded-lg border border-border bg-base-700/50 overflow-hidden">
          <div className="relative aspect-[16/6] w-full">
            <img src={hero} alt={meta.displayName || "Featured bundle"} className="absolute inset-0 w-full h-full object-cover" loading="lazy" draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-t from-base-900/95 via-base-900/40 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
              <p className="text-xl font-display font-bold text-white drop-shadow-md truncate">
                {meta.displayName || "Featured bundle"}
              </p>
              {bundle.cost && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-white/70">Total</p>
                  <p className="text-lg font-display font-bold tabular-nums text-white">
                    {bundle.cost.amount.toLocaleString()} <span className="text-xs text-white/70">{bundle.cost.currency}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
          {hasMultiple && (
            <BundleCarouselControls bundles={bundles} safeIndex={safeIndex} onIndex={onIndex} />
          )}
        </div>
      )}
    </motion.section>
  );
}

function BundleCarouselControls({ bundles, safeIndex, onIndex, compact }) {
  const arrowClass = compact
    ? "absolute top-1/2 -translate-y-1/2 p-1 rounded-full bg-base-900/70 hover:bg-base-900 text-text-primary"
    : "absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-base-900/70 hover:bg-base-900 text-white";
  const dotClass = (active) =>
    `w-1.5 h-1.5 rounded-full transition-colors ${active ? (compact ? "bg-text-primary" : "bg-white") : "bg-white/30 hover:bg-white/60"}`;
  return (
    <>
      <button
        onClick={() => onIndex((safeIndex - 1 + bundles.length) % bundles.length)}
        className={`${arrowClass} ${compact ? "left-1" : "left-2"}`}
        aria-label="Previous bundle"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <button
        onClick={() => onIndex((safeIndex + 1) % bundles.length)}
        className={`${arrowClass} ${compact ? "right-1" : "right-2"}`}
        aria-label="Next bundle"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
      {!compact && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {bundles.map((_, i) => (
            <button
              key={i}
              onClick={() => onIndex(i)}
              aria-label={`Bundle ${i + 1}`}
              className={dotClass(i === safeIndex)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AccessoryCard({ offer, lookup }) {
  // Use the first reward as the visual representative. Multi-reward offers
  // get a "+N more" badge so the user knows to expect more than one item.
  const primary = offer.rewards[0];
  const meta = primary ? lookup[primary.itemId] : null;
  const extra = Math.max(0, offer.rewards.length - 1);
  return (
    <div className="rounded-lg border border-border bg-base-700/50 overflow-hidden flex flex-col">
      <div className="aspect-square w-full flex items-center justify-center p-3 bg-base-800/40 relative">
        {meta?.image ? (
          <img src={meta.image} alt={meta.name} className="max-h-full max-w-full object-contain" loading="lazy" draggable={false} />
        ) : meta?.kind === "title" && meta?.name ? (
          <p className="text-center text-sm font-display text-text-primary px-2">"{meta.name}"</p>
        ) : (
          <div className="text-text-muted text-xs">No preview</div>
        )}
        {extra > 0 && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-base-900/80 text-[10px] font-mono text-text-secondary">+{extra}</span>
        )}
      </div>
      <div className="p-2.5 border-t border-border space-y-0.5">
        <p className="text-xs font-display font-semibold text-text-primary truncate">{meta?.name || "Unknown"}</p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">{meta?.kind || ""}</span>
          {offer.cost && (
            <span className="text-xs font-display font-semibold tabular-nums text-text-primary">
              {offer.cost.amount.toLocaleString()} <span className="text-[9px] text-text-muted">{offer.cost.currency}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function WishlistModal({ open, wishlistedIds, levelLookup, onClose, onRemove }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const rows = wishlistedIds
    .map(id => ({ id: id.toLowerCase(), meta: levelLookup[id.toLowerCase()] }))
    .sort((a, b) => (a.meta?.name || "").localeCompare(b.meta?.name || ""));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-900/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={noAnim() ? T0 : { duration: 0.15 }}
        className="w-[480px] max-w-[90vw] max-h-[80vh] rounded-xl border border-border bg-base-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-display font-bold text-text-primary">Wishlist ({rows.length})</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-2">
          {rows.length === 0 ? (
            <p className="text-center text-xs font-body text-text-muted py-8">
              No wishlist yet — heart any skin in the Store to add it.
            </p>
          ) : (
            <ul className="space-y-1">
              {rows.map(({ id, meta }) => (
                <li key={id} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-base-700">
                  <div className="w-12 h-8 shrink-0 bg-base-900/50 rounded flex items-center justify-center">
                    {meta?.icon ? (
                      <img src={meta.icon} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                    ) : (
                      <span className="text-[9px] text-text-muted">—</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-semibold text-text-primary truncate">{meta?.name || "Unknown skin"}</p>
                    <p className="text-[10px] uppercase tracking-wider text-text-muted">{meta?.weapon || ""}</p>
                  </div>
                  <button
                    onClick={() => onRemove(id)}
                    className="px-2 py-1 rounded text-[10px] font-display font-semibold border border-border bg-base-700 hover:bg-base-600 text-text-secondary"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
