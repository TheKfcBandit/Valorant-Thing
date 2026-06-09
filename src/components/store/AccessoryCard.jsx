export function AccessoryCard({ offer, lookup }) {
  // Use the first reward as the visual representative. Multi-reward offers
  // get a "+N more" badge so the user knows to expect more than one item.
  const primary = offer.rewards[0];
  const meta = primary ? lookup[primary.itemId] : null;
  const extra = Math.max(0, offer.rewards.length - 1);
  return (
    <div className="rounded-lg border border-border bg-base-700/50 overflow-hidden flex flex-col">
      <div className="aspect-square w-full flex items-center justify-center p-3 bg-base-800/40 relative">
        {meta?.image ? (
          <img
            src={meta.image}
            alt={meta.name}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
            draggable={false}
          />
        ) : meta?.kind === "title" && meta?.name ? (
          <p className="text-center text-sm font-display text-text-primary px-2">"{meta.name}"</p>
        ) : (
          <div className="text-text-muted text-xs">No preview</div>
        )}
        {extra > 0 && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-base-900/80 text-[10px] font-mono text-text-secondary">
            +{extra}
          </span>
        )}
      </div>
      <div className="p-2.5 border-t border-border space-y-0.5">
        <p className="text-xs font-display font-semibold text-text-primary truncate">
          {meta?.name || "Unknown"}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {meta?.kind || ""}
          </span>
          {offer.cost && (
            <span className="text-xs font-display font-semibold tabular-nums text-text-primary">
              {offer.cost.amount.toLocaleString()}{" "}
              <span className="text-[9px] text-text-muted">{offer.cost.currency}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
