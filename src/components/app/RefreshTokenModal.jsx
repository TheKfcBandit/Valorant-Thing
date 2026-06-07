import { motion } from "framer-motion";
import { Clock, Refresh } from "../../icons";
import { formatTimeLeft } from "../../utils/format";

// Confirmation modal for the "refresh tokens" action. The token age is
// passed in pre-counted (seconds since fetch) and rendered via
// formatTimeLeft. App.jsx ticks the age every second while the modal
// is open so the displayed countdown is live.
export default function RefreshTokenModal({ tokenAge, onCancel, onConfirm }) {
  return (
    <motion.div
      key="refresh-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="bg-base-700 border border-border rounded-xl p-5 w-72 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-val-red/15 flex items-center justify-center">
            <Refresh size={16} strokeWidth="2" className="text-val-red" />
          </div>
          <h3 className="text-sm font-display font-semibold text-text-primary">Refresh Token</h3>
        </div>
        <p className="text-xs font-body text-text-secondary leading-relaxed mb-1">
          This will re-fetch your entitlement tokens from the Riot Client.
        </p>
        <div className="flex items-center gap-1.5 mb-4 px-2 py-1.5 rounded-lg bg-base-600/50">
          <Clock className="text-text-muted shrink-0" />
          <span className="text-[11px] font-mono text-text-muted">
            Token has{" "}
            <span className="text-text-primary font-semibold">{formatTimeLeft(tokenAge)}</span>{" "}
            remaining
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-lg bg-base-600 hover:bg-base-500 text-text-secondary text-xs font-display font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-1.5 rounded-lg bg-val-red hover:bg-val-red/80 text-white text-xs font-display font-semibold transition-colors"
          >
            Refresh
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
