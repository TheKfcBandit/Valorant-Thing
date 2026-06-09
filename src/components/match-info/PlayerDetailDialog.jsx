import { useEffect } from "react";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { LIVE_MODULES } from "../../live/registry";
import { X } from "../../icons";

export function PlayerDetailDialog({ player, agents, tiers, moduleData, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!player) return null;

  const agent = agents[player.characterId?.toLowerCase()];
  const acct = player.account;
  const mmr = player.mmr;
  const tierInfo = tiers[mmr?.currenttier] || null;
  const displayName = acct?.name || agent?.displayName || player.puuid.slice(0, 8);

  const sections = [];
  for (const mod of LIVE_MODULES) {
    if (!mod.DialogSection) continue;
    const data = moduleData?.[mod.id]?.[player.puuid];
    if (data == null) continue;
    sections.push({ mod, data });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={noAnim() ? T0 : { duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={noAnim() ? T0 : { type: "spring", stiffness: 400, damping: 28 }}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-border bg-base-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-base-700/60">
          <div className="w-10 h-10 rounded-lg bg-base-600 overflow-hidden shrink-0 flex items-center justify-center">
            {agent?.displayIconSmall ? (
              <img src={agent.displayIconSmall} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-text-muted text-[10px]">?</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p className="text-base font-display font-bold text-text-primary truncate">
                {displayName}
              </p>
              {acct?.tag && <span className="text-xs font-body text-text-muted">#{acct.tag}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {tierInfo?.icon && <img src={tierInfo.icon} alt="" className="w-3.5 h-3.5" />}
              <span className="text-[11px] font-display font-semibold text-text-secondary">
                {tierInfo?.name || "Unranked"}
              </span>
              <span className="text-[11px] font-body text-text-muted">
                {mmr?.ranking_in_tier ?? 0}RR
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded-md text-text-muted hover:text-text-primary hover:bg-base-600 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X size={14} strokeLinecap="round" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {sections.length === 0 ? (
            <p className="text-xs font-body text-text-muted italic text-center py-8">
              No additional info available for this player.
            </p>
          ) : (
            sections.map(({ mod, data }) => (
              <mod.DialogSection key={mod.id} player={player} data={data} />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
