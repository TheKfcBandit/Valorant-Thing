import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { MODE_NAMES } from "../../utils/gameMode";
import { formatTimeRemaining, getPenaltyLabel } from "../../utils/penalties";
import { AlertTriangle } from "../../icons";
import { Label } from "../ui/Label";

export function SpendCard({ spend }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl border border-border bg-base-700/60 p-3"
      title={
        spend.trackingSinceMs
          ? `Tracking since ${new Date(spend.trackingSinceMs).toLocaleDateString()}`
          : ""
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <Label>Spent (last 30 days)</Label>
          <p className="text-base font-display font-bold text-text-primary tabular-nums mt-0.5">
            {Number(spend.thisMonthVp || 0).toLocaleString()}{" "}
            <span className="text-xs text-text-muted">VP</span>
            {spend.thisMonthRp > 0 && (
              <span className="ml-2">
                {Number(spend.thisMonthRp).toLocaleString()}{" "}
                <span className="text-xs text-text-muted">RP</span>
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-display text-text-muted uppercase tracking-wider">
            All-time
          </p>
          <p className="text-xs font-mono text-text-secondary tabular-nums mt-0.5">
            {Number(spend.vpSpent || 0).toLocaleString()} VP
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export function AccountStatusBanner({ penalties }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 space-y-2"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-yellow-400" />
        <p className="text-xs font-display font-bold text-yellow-400 uppercase tracking-wider">
          Account Status
        </p>
      </div>
      <div className="space-y-1">
        {penalties.map((p, idx) => {
          const remainingText = formatTimeRemaining(p.expiryMs);
          const label = getPenaltyLabel(p.type);
          const queueLabel = p.queueId ? MODE_NAMES[p.queueId] || p.queueId : "";
          const meta = [queueLabel, p.rrPenalty > 0 ? `${p.rrPenalty} RR` : null].filter(Boolean);
          return (
            <div
              key={p.id || idx}
              className="flex items-center justify-between gap-2 text-[11px] font-body"
            >
              <div className="min-w-0 flex-1">
                <span className="text-text-primary">{label}</span>
                {meta.length > 0 && <span className="text-text-muted"> · {meta.join(" · ")}</span>}
              </div>
              {remainingText && (
                <span className="text-yellow-400 tabular-nums shrink-0">{remainingText}</span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
