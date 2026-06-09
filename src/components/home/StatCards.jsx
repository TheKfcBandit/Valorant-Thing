import { motion } from "framer-motion";
import { trackerScoreTier } from "../../utils/trackerScore";

export function StatCard({ label, children, loading }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.2 }}
      className={`p-3 rounded-xl bg-base-700 border border-border space-y-1.5 ${loading ? "opacity-60" : ""}`}
    >
      <p className="text-[10px] font-display font-medium text-text-muted uppercase tracking-wider">
        {label}
      </p>
      {children}
    </motion.div>
  );
}

// #11: TRN-style 0-100 score. Replaces the old Total Games card — that
// number now lives in the Win Rate card's subtext, freeing a slot for a
// more interesting at-a-glance metric. Color tier matches the fitness
// score convention used in PartyPage's invite list.
export function TrackerScoreCard({ score, loading }) {
  const tier = trackerScoreTier(score?.score);
  const colorClass =
    tier === "high"
      ? "text-green-400"
      : tier === "low"
        ? "text-red-400"
        : tier === "mid"
          ? "text-text-primary"
          : "text-text-muted/50";
  const display = score?.score == null ? "—" : score.score;
  const hint = score
    ? score.score == null
      ? `Need ${10 - score.games} more competitive game${10 - score.games === 1 ? "" : "s"}`
      : `${score.breakdown.kd} K/D · ${score.breakdown.winrate}% WR · ${score.games}g${
          score.confidence < 1 ? ` (low confidence)` : ""
        }`
    : "";
  return (
    <StatCard label="Tracker Score" loading={loading}>
      <p className={`text-xl font-display font-bold tabular-nums ${colorClass}`} title={hint}>
        {display}
        {score?.score != null && (
          <span className="text-xs text-text-muted font-body font-normal">/100</span>
        )}
      </p>
      <p className="text-xs font-body text-text-muted">
        {score?.score != null
          ? `${score.breakdown.kd} K/D · ${score.breakdown.winrate}% WR`
          : score?.games
            ? `${score.games}g · keep going`
            : "Competitive"}
      </p>
    </StatCard>
  );
}
