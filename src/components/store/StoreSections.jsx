import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { fmtRemaining } from "../../utils/store";

export function NightMarketSubtitle({ remaining }) {
  if (remaining == null) return null;
  return <span className="tabular-nums">Closes in {fmtRemaining(remaining)}</span>;
}

export function Section({ title, subtitle, accentColor, children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2
          className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {title}
        </h2>
        {subtitle && <span className="text-[10px] text-text-muted tabular-nums">{subtitle}</span>}
      </div>
      {children}
    </motion.section>
  );
}
