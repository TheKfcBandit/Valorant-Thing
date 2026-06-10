import { useEffect } from "react";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { X } from "../../icons";

export function WishlistModal({
  open,
  wishlistedIds,
  levelLookup,
  accessoryLookup = {},
  onClose,
  onRemove,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Skins resolve via the level lookup; buddies/sprays/cards/titles
  // wishlisted from the Assets browser resolve via the accessory lookup
  // (shape: { kind, name, image } — adapted to the row's icon/weapon).
  const resolve = (id) => {
    const lvl = levelLookup[id];
    if (lvl) return lvl;
    const acc = accessoryLookup[id];
    if (acc) return { name: acc.name, icon: acc.image, weapon: acc.kind };
    return null;
  };
  const rows = wishlistedIds
    .map((id) => ({ id: id.toLowerCase(), meta: resolve(id.toLowerCase()) }))
    .sort((a, b) => (a.meta?.name || "").localeCompare(b.meta?.name || ""));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-900/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={noAnim() ? T0 : { duration: 0.15 }}
        className="w-[480px] max-w-[90vw] max-h-[80vh] rounded-xl border border-border bg-base-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-display font-bold text-text-primary">
            Wishlist ({rows.length})
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            <X />
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
                <li
                  key={id}
                  className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-base-700"
                >
                  <div className="w-12 h-8 shrink-0 bg-base-900/50 rounded flex items-center justify-center">
                    {meta?.icon ? (
                      <img
                        src={meta.icon}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[9px] text-text-muted">—</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-semibold text-text-primary truncate">
                      {meta?.name || "Unknown item"}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-text-muted">
                      {meta?.weapon || ""}
                    </p>
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
