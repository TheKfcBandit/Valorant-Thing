import { RARITY_COLORS } from "../../utils/rarity";
import { HeartToggle } from "../../icons";

export function AssetCard({ item, wishlisted, onToggleWishlist }) {
  const tierColor = item.tier ? RARITY_COLORS[item.tier] : null;
  return (
    <div className="relative rounded-lg border border-border bg-base-700/50 overflow-hidden flex flex-col">
      {tierColor && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ backgroundColor: tierColor }}
        />
      )}
      <button
        onClick={onToggleWishlist}
        title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-base-800/70 hover:bg-base-800 transition-colors"
      >
        <HeartToggle
          filled={wishlisted}
          style={{ color: wishlisted ? "rgb(var(--val-red))" : "rgb(var(--text-muted))" }}
        />
      </button>
      <div className="h-20 flex items-center justify-center p-2 bg-base-800/30">
        {item.image ? (
          <img
            src={item.image}
            alt=""
            className="max-h-full max-w-full object-contain"
            loading="lazy"
            draggable={false}
          />
        ) : item.kind === "title" ? (
          <p className="text-center text-[11px] font-display text-text-primary px-1 leading-tight">
            {item.name}
          </p>
        ) : (
          <span className="text-[10px] text-text-muted">No preview</span>
        )}
      </div>
      <div className="px-2 py-1.5 border-t border-border/60">
        <p className="text-[11px] font-display font-semibold text-text-primary truncate">
          {item.name || "Unnamed"}
        </p>
        <p className="text-[9px] uppercase tracking-wider text-text-muted truncate">
          {item.weapon || item.kind}
        </p>
      </div>
    </div>
  );
}
