import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { RARITY_COLORS } from "../../utils/rarity";
import { HeartToggle } from "../../icons";

export function SkinCard({ offer, meta, wishlisted, onToggleWishlist, nightMarket, portrait }) {
  const tierColor = meta?.tier
    ? RARITY_COLORS[meta.tier] || "rgb(var(--text-muted))"
    : "rgb(var(--text-muted))";
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
          <HeartToggle
            filled={wishlisted}
            style={{ color: wishlisted ? "rgb(var(--val-red))" : "rgb(var(--text-muted))" }}
          />
        </button>
      </div>
      <div
        className={`${aspectClass} w-full flex items-center justify-center p-3`}
        style={{ background: `linear-gradient(135deg, ${tierColor}22 0%, transparent 60%)` }}
      >
        {meta?.icon ? (
          <img
            src={meta.icon}
            alt={meta.name}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="text-text-muted text-xs">No preview</div>
        )}
      </div>
      <div className="p-3 border-t border-border" style={{ borderTopColor: tierColor + "40" }}>
        <p className="text-sm font-display font-semibold text-text-primary truncate">
          {meta?.name || "Unknown skin"}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {meta?.weapon || ""}
          </span>
          {offer.cost && (
            <span className="text-sm font-display font-semibold tabular-nums text-text-primary">
              {offer.cost.amount.toLocaleString()}{" "}
              <span className="text-[10px] text-text-muted">{offer.cost.currency}</span>
            </span>
          )}
        </div>
        {nightMarket && offer.baseCost && offer.discountPct != null && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] line-through text-text-muted tabular-nums">
              {offer.baseCost.amount.toLocaleString()}
            </span>
            <span className="text-[10px] font-semibold" style={{ color: "rgb(var(--val-red))" }}>
              -{offer.discountPct}%
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
