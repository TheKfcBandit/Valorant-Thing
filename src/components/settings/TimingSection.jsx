import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { Label } from "../ui/Label";
import { DelaySlider } from "./DelaySlider";

export function TimingSection({
  selectDelay,
  onSelectDelayChange,
  lockDelay,
  onLockDelayChange,
  lockMode,
  onLockModeChange,
}) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl bg-base-700 border border-border divide-y divide-border"
    >
      <div className="px-4 pt-3 pb-1">
        <Label as="h2">Timing</Label>
      </div>
      <div className="p-4 space-y-4">
        <DelaySlider
          label="Select Delay"
          desc="Delay before selecting agent"
          value={selectDelay}
          onChange={onSelectDelayChange}
        />
        <DelaySlider
          label="Lock Delay"
          desc="Delay between select and lock (instant mode only)"
          value={lockDelay}
          onChange={onLockDelayChange}
        />
        <div>
          <p className="text-sm font-display font-medium text-text-primary">Lock Mode</p>
          <p className="text-xs font-body text-text-muted mt-0.5 mb-2">
            When to lock in after selecting
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "instant", label: "Instant", desc: "Lock right after select" },
              { id: "last-second", label: "Last Second", desc: "Lock at ~2s remaining" },
              { id: "select-only", label: "Select Only", desc: "Never auto-lock" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => onLockModeChange(opt.id)}
                className={`px-2 py-2 rounded-lg border text-left transition-colors ${lockMode === opt.id ? "border-val-red bg-val-red/10" : "border-border bg-base-600 hover:bg-base-500"}`}
              >
                <p
                  className={`text-xs font-display font-semibold ${lockMode === opt.id ? "text-val-red" : "text-text-primary"}`}
                >
                  {opt.label}
                </p>
                <p className="text-[10px] font-body text-text-muted mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
