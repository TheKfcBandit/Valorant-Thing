import { motion } from "framer-motion";
import { AlertTriangle } from "../../icons";

// Prompt shown when the user tries to navigate away from FakeStatus
// with unsaved presence changes. Discard / Save & Apply both forward
// to FakeStatusPage's exposed action ref before completing the tab
// switch — see App.jsx for the wiring.
export default function UnsavedChangesModal({ onDiscard, onSave, onClose }) {
  return (
    <motion.div
      key="unsaved-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="bg-base-700 border border-border rounded-xl p-5 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-val-red/15 flex items-center justify-center">
            <AlertTriangle className="text-val-red" />
          </div>
          <h3 className="text-sm font-display font-semibold text-text-primary">Unsaved Changes</h3>
        </div>
        <p className="text-xs font-body text-text-secondary leading-relaxed mb-4">
          You have unsaved changes in Fake Status. What would you like to do?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onDiscard}
            className="flex-1 py-1.5 rounded-lg bg-base-600 hover:bg-base-500 text-text-secondary text-xs font-display font-medium transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="flex-1 py-1.5 rounded-lg bg-val-red hover:bg-val-red/80 text-white text-xs font-display font-semibold transition-colors"
          >
            Save &amp; Apply
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
