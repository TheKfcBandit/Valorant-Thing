import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { fmtRemaining } from "../../utils/store";
import { ChevronLeft, ChevronRight } from "../../icons";

export function BundleCarousel({ bundles, index, onIndex, lookup }) {
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
          Featured Bundle{hasMultiple ? `s (${safeIndex + 1}/${bundles.length})` : ""}
        </h2>
        {bundle.remaining != null && (
          <span className="text-[10px] text-text-muted tabular-nums">
            Closes in {fmtRemaining(bundle.remaining)}
          </span>
        )}
      </div>
      {useCompactRow ? (
        <div className="relative rounded-lg border border-border bg-base-700/50 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-display font-semibold text-text-primary">
              {meta.displayName || "New bundle"}
            </p>
            <p className="text-[11px] font-body italic text-text-muted mt-0.5">
              Image not yet available
            </p>
          </div>
          {bundle.cost && (
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Total</p>
              <p className="text-base font-display font-bold tabular-nums text-text-primary">
                {bundle.cost.amount.toLocaleString()}{" "}
                <span className="text-xs text-text-muted">{bundle.cost.currency}</span>
              </p>
            </div>
          )}
          {hasMultiple && (
            <BundleCarouselControls
              bundles={bundles}
              safeIndex={safeIndex}
              onIndex={onIndex}
              compact
            />
          )}
        </div>
      ) : (
        <div className="relative rounded-lg border border-border bg-base-700/50 overflow-hidden">
          <div className="relative aspect-[16/6] w-full">
            <img
              src={hero}
              alt={meta.displayName || "Featured bundle"}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-base-900/95 via-base-900/40 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
              <p className="text-xl font-display font-bold text-white drop-shadow-md truncate">
                {meta.displayName || "Featured bundle"}
              </p>
              {bundle.cost && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-white/70">Total</p>
                  <p className="text-lg font-display font-bold tabular-nums text-white">
                    {bundle.cost.amount.toLocaleString()}{" "}
                    <span className="text-xs text-white/70">{bundle.cost.currency}</span>
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
        <ChevronLeft />
      </button>
      <button
        onClick={() => onIndex((safeIndex + 1) % bundles.length)}
        className={`${arrowClass} ${compact ? "right-1" : "right-2"}`}
        aria-label="Next bundle"
      >
        <ChevronRight />
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
