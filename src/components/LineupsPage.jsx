import { motion } from "framer-motion";
import { noAnim, T0 } from "../utils/animation";
import { LineupsTab } from "../icons";

// Placeholder. Real content (per-agent lineup videos, smoke/molly maps,
// dart spots, etc.) is tracked in the roadmap — this surface gives the
// sidebar entry something to land on while the data source is settled.
export default function LineupsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="flex-1 flex items-center justify-center p-5"
    >
      <div className="max-w-md text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-val-red/10 border border-val-red/20 flex items-center justify-center">
          <LineupsTab size={22} className="text-val-red" />
        </div>
        <h1 className="text-xl font-display font-bold text-text-primary">Lineups</h1>
        <p className="text-sm font-body text-text-muted">
          Per-agent lineup videos, smoke / molly setups, dart spots, postplant defaults.
        </p>
        <p className="text-xs font-body text-text-muted/70 italic">
          Hooking up the data source next. Tracked in the roadmap.
        </p>
      </div>
    </motion.div>
  );
}
