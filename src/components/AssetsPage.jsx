import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../utils/animation";
import { useAsyncEffect } from "../hooks/useAsyncEffect";
import { useWishlist } from "../hooks/useWishlist";
import { getSkinCatalog, getAccessoryCatalog } from "../valApiSkins";
import { ASSET_KINDS, filterAssets, weaponOptions } from "../utils/assets";
import { RARITY_TIERS } from "../utils/rarity";
import { HeartFilled } from "../icons";
import { AssetCard } from "./assets/AssetCard";

// #28: browse the full catalog (skins, buddies, sprays, cards, titles) and
// wishlist anything before it ever appears in a store rotation. The grid is
// incrementally rendered (IntersectionObserver sentinel) instead of pulling
// in a virtualization dependency — the catalog is ~1500 skins, and 96-at-a-
// time keeps the DOM small while feeling instant.

const PAGE = 96;

export default function AssetsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState("skin");
  const [query, setQuery] = useState("");
  const [weapon, setWeapon] = useState("all");
  const [tier, setTier] = useState("all");
  const [visible, setVisible] = useState(PAGE);
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const sentinelRef = useRef(null);
  const { wishlist, toggleWishlist } = useWishlist();

  useAsyncEffect(async (isCancelled) => {
    try {
      const [skins, accessories] = await Promise.all([getSkinCatalog(), getAccessoryCatalog()]);
      if (!isCancelled()) setItems([...skins, ...accessories]);
    } catch (e) {
      if (!isCancelled()) setError(typeof e === "string" ? e : e?.message || "Catalog load failed");
    }
  }, []);

  const weapons = useMemo(() => weaponOptions(items), [items]);

  const filtered = useMemo(() => {
    const base = filterAssets(items, { query, kind, weapon, tier });
    return wishlistOnly ? base.filter((it) => wishlist.has(it.id)) : base;
  }, [items, query, kind, weapon, tier, wishlistOnly, wishlist]);

  // Any filter change rewinds the window so the sentinel maths stay simple.
  useEffect(() => {
    setVisible(PAGE);
  }, [query, kind, weapon, tier, wishlistOnly]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => v + PAGE);
        }
      },
      { rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length]);

  const shown = filtered.slice(0, visible);
  const selectClass =
    "text-[11px] font-body bg-base-700 border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-text-muted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-3"
    >
      <header>
        <h1 className="text-2xl font-display font-bold text-text-primary">Assets</h1>
        <p className="text-xs text-text-muted">
          Browse the full catalog and wishlist items before they ever hit your store rotation.
        </p>
      </header>

      <div className="flex items-center gap-1.5 flex-wrap">
        {ASSET_KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold border transition-colors ${
              kind === k.id
                ? "bg-val-red/20 border-val-red/40 text-val-red"
                : "bg-base-700 border-border text-text-muted hover:text-text-primary"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${ASSET_KINDS.find((k) => k.id === kind)?.label.toLowerCase()}…`}
          className="flex-1 min-w-44 px-3 py-1.5 bg-base-700 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted/50 outline-none focus:border-val-red/60 transition-colors"
        />
        {kind === "skin" && (
          <>
            <select
              value={weapon}
              onChange={(e) => setWeapon(e.target.value)}
              className={selectClass}
            >
              <option value="all">All weapons</option>
              {weapons.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <select value={tier} onChange={(e) => setTier(e.target.value)} className={selectClass}>
              <option value="all">All rarities</option>
              {RARITY_TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          onClick={() => setWishlistOnly((v) => !v)}
          title="Show only wishlisted items"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-display font-semibold border transition-colors ${
            wishlistOnly
              ? "bg-val-red/20 border-val-red/40 text-val-red"
              : "bg-base-700 border-border text-text-muted hover:text-text-primary"
          }`}
        >
          <HeartFilled />
          {wishlist.size}
        </button>
        <span className="text-[11px] font-body text-text-muted tabular-nums">
          {filtered.length.toLocaleString()} item{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md border border-val-red/40 bg-val-red/10 text-sm text-val-red">
          {error}
        </div>
      )}

      {!items && !error && (
        <p className="text-xs font-body text-text-muted py-8 text-center">Loading catalog…</p>
      )}

      {items && filtered.length === 0 && (
        <p className="text-xs font-body text-text-muted py-8 text-center">
          {wishlistOnly ? "Nothing wishlisted in this category yet." : "No matches."}
        </p>
      )}

      <div className="grid grid-cols-4 xl:grid-cols-5 gap-2">
        {shown.map((item) => (
          <AssetCard
            key={item.id}
            item={item}
            wishlisted={wishlist.has(item.id)}
            onToggleWishlist={() => toggleWishlist(item.id)}
          />
        ))}
      </div>

      {shown.length < filtered.length && (
        <div ref={sentinelRef} className="py-3 text-center text-[11px] font-body text-text-muted">
          Loading more… ({shown.length.toLocaleString()} of {filtered.length.toLocaleString()})
        </div>
      )}
    </motion.div>
  );
}
