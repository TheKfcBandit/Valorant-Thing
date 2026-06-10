import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getLevelLookup, getBundleLookup, getAccessoryLookup } from "../valApiSkins";
import { useWishlist } from "../hooks/useWishlist";
import { fmtCost, fmtRemaining } from "../utils/store";
import { HeartFilled, StoreTab } from "../icons";
import { Section, NightMarketSubtitle } from "./store/StoreSections";
import { SkinCard } from "./store/SkinCard";
import { BundleCarousel } from "./store/BundleCarousel";
import { AccessoryCard } from "./store/AccessoryCard";
import { WishlistModal } from "./store/WishlistModal";

export default function StorePage({ connected }) {
  const [storeRaw, setStoreRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [levelLookup, setLevelLookup] = useState({});
  const [bundleLookup, setBundleLookup] = useState({});
  const [accessoryLookup, setAccessoryLookup] = useState({});
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [bundleIndex, setBundleIndex] = useState(0);
  const { wishlist, toggleWishlist } = useWishlist();
  const [now, setNow] = useState(Date.now());
  const fetchedAtRef = useRef(0);

  useEffect(() => {
    getLevelLookup()
      .then(setLevelLookup)
      .catch((e) => console.warn("[Store] Skin lookup load failed:", e));
    getBundleLookup()
      .then(setBundleLookup)
      .catch((e) => console.warn("[Store] Bundle lookup load failed:", e));
    getAccessoryLookup()
      .then(setAccessoryLookup)
      .catch((e) => console.warn("[Store] Accessory lookup load failed:", e));
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
    return () => {
      unsub.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Reset the bundle carousel index whenever the storefront changes
  // so stale UI state can't bleed across days.
  useEffect(() => {
    setBundleIndex(0);
  }, [storeRaw]);

  const dailyOffers = useMemo(() => {
    if (!storeRaw) return [];
    const panel = storeRaw.SkinsPanelLayout || {};
    const offers = panel.SingleItemStoreOffers || [];
    const ids = panel.SingleItemOffers || [];
    if (offers.length) {
      return offers.map((o) => ({
        offerId: (o.OfferID || "").toLowerCase(),
        cost: fmtCost(o.Cost),
      }));
    }
    return ids.map((id) => ({ offerId: (id || "").toLowerCase(), cost: null }));
  }, [storeRaw]);

  const accessoryOffers = useMemo(() => {
    if (!storeRaw) return [];
    const accs = storeRaw.AccessoryStore || {};
    const list = accs.AccessoryStoreOffers || [];
    return list.map((a) => {
      const offer = a.Offer || a;
      const rewards = offer.Rewards || [];
      return {
        offerId: (offer.OfferID || "").toLowerCase(),
        cost: fmtCost(offer.Cost),
        rewards: rewards.map((r) => ({
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
    if (fb.Bundle && !arr.some((b) => b.ID === fb.Bundle.ID)) arr.unshift(fb.Bundle);
    return arr.map((b) => ({
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
      offers: offers.map((o) => ({
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
          <StoreTab size={32} className="text-text-muted mx-auto" />
          <p className="text-sm font-display text-text-muted">No store data yet</p>
          <p className="text-[11px] font-body text-text-muted/60">
            Open Valorant once and reopen this page
          </p>
        </div>
      </div>
    );
  }

  // Stale derivation. The cached snapshot was taken at `staleSinceMs`;
  // we just show how old it is and that Valorant isn't running. The
  // previous "yesterday's reset" wording was misleading because Riot
  // could have reset N days ago — the check only said "before last
  // midnight," not how many midnights had passed.
  const staleAgeText = (() => {
    if (!staleSinceMs) return null;
    const m = Math.max(0, Math.floor((Date.now() - staleSinceMs) / 60000));
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
            <HeartFilled />
            Wishlist
            {wishlist.size > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-val-red/20 text-val-red text-[10px] tabular-nums">
                {wishlist.size}
              </span>
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
        <div className="px-3 py-2 rounded-md border text-xs font-body border-yellow-500/40 bg-yellow-500/10 text-yellow-400">
          Last updated {staleAgeText} · cached (Valorant not running)
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
        subtitle={
          dailyCountdown != null
            ? `Resets in ${fmtRemaining(dailyCountdown)}`
            : "Resets every 24 hours"
        }
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
          subtitle={
            accessoryCountdown != null
              ? `Resets in ${fmtRemaining(accessoryCountdown)}`
              : "Resets weekly"
          }
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
          subtitle={<NightMarketSubtitle remaining={nightMarket.remaining} />}
          accentColor="rgb(var(--val-red))"
        >
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, nightMarket.offers.length)}, minmax(0, 1fr))`,
            }}
          >
            {nightMarket.offers.map((o) => (
              <SkinCard
                key={o.offerId}
                offer={{
                  offerId: o.offerId,
                  cost: o.discountedCost,
                  baseCost: o.baseCost,
                  discountPct: o.discountPct,
                }}
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
        accessoryLookup={accessoryLookup}
        onClose={() => setWishlistOpen(false)}
        onRemove={toggleWishlist}
      />
    </div>
  );
}
