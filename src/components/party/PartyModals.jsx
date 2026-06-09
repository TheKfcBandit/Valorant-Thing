import { motion, AnimatePresence } from "framer-motion";
import { InfoCircle } from "../../icons";

export function QueueErrorModal({ queueError, onClose }) {
  return (
    <AnimatePresence>
      {queueError && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={onClose}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-base-700 border border-border rounded-2xl p-5 w-80 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <InfoCircle size={18} strokeWidth="2" className="text-status-red shrink-0" />
              <h3 className="text-sm font-display font-bold text-text-primary">Queue Error</h3>
            </div>
            <p className="text-xs font-body text-text-secondary mb-4">{queueError}</p>
            <button
              onClick={onClose}
              className="w-full py-1.5 rounded-lg bg-val-red/20 border border-val-red/40 text-xs font-display font-semibold text-val-red hover:bg-val-red/30 transition-colors"
            >
              OK
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function JoinPartyModal({ open, joinCode, onJoinCodeChange, onJoin, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-base-700 border border-border rounded-xl p-5 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-display font-semibold text-text-primary mb-3">
              Join Party
            </h3>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => onJoinCodeChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onJoin()}
              placeholder="Enter party code"
              autoFocus
              className="w-full px-3 py-2 bg-base-600 border border-border rounded-lg text-sm font-body text-text-primary placeholder:text-text-muted/50 outline-none focus:border-val-red/60 transition-colors tracking-wider"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={onClose}
                className="flex-1 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-secondary hover:bg-base-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onJoin}
                className="flex-1 py-1.5 rounded-lg bg-val-red/20 border border-val-red/40 text-xs font-display font-semibold text-val-red hover:bg-val-red/30 transition-colors"
              >
                Join
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
