import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { trackerScoreTier } from "../../utils/trackerScore";
import { Person } from "../../icons";

export function FriendInviteCard({
  friend,
  fitness,
  tracker,
  onInvite,
  inviting,
  invited,
  index,
  actionLabel = "Invite",
  doneLabel = "Sent",
}) {
  const showFitness = fitness && fitness.games >= 2;
  const fitColor = !showFitness
    ? "text-text-muted/40"
    : fitness.fitness >= 60
      ? "text-green-400"
      : fitness.fitness <= 40
        ? "text-red-400"
        : "text-text-muted";
  // #11: solo TRN score next to the co-play fitness number. Same color
  // bands; null score means we don't have enough cached matches with
  // this friend in them yet.
  const trackerTier = trackerScoreTier(tracker?.score);
  const trackerColor =
    trackerTier === "high"
      ? "text-green-400"
      : trackerTier === "low"
        ? "text-red-400"
        : trackerTier === "mid"
          ? "text-text-muted"
          : "text-text-muted/40";
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={noAnim() ? T0 : { duration: 0.12, delay: index * 0.015 }}
      className="flex items-center gap-2 mx-1 px-2.5 py-1.5 rounded-lg hover:bg-base-600/60 transition-colors group"
    >
      <div className="w-6 h-6 rounded-full bg-base-500/60 shrink-0 flex items-center justify-center">
        <Person size={12} className="text-text-muted/60" />
      </div>
      <p className="text-[11px] font-display font-medium text-text-primary truncate flex-1 min-w-0">
        {friend.game_name}
        <span className="text-text-muted font-body font-normal ml-0.5">#{friend.game_tag}</span>
      </p>
      {tracker?.score != null && (
        <span
          className={`shrink-0 text-[9px] font-mono ${trackerColor}`}
          title={`Tracker: ${tracker.score}/100 · ${tracker.breakdown.kd} K/D · ${tracker.breakdown.winrate}% WR · ${tracker.games}g${tracker.confidence < 1 ? " (low confidence)" : ""}`}
        >
          {tracker.score}
        </span>
      )}
      {showFitness && (
        <span
          className={`shrink-0 text-[9px] font-mono ${fitColor}`}
          title={`Fitness: ${fitness.fitness}/100 · ${fitness.wins}-${fitness.games - fitness.wins} together · ${fitness.soloDelta > 0 ? "+" : ""}${fitness.soloDelta}pp vs solo`}
        >
          {fitness.fitness}
        </span>
      )}
      <button
        onClick={onInvite}
        disabled={inviting || invited}
        className={`shrink-0 text-[10px] font-display font-semibold px-2 py-0.5 rounded transition-all ${
          invited
            ? "text-status-green"
            : inviting
              ? "text-text-muted"
              : "text-text-muted/40 group-hover:text-val-red"
        }`}
      >
        {invited ? `✓ ${doneLabel}` : inviting ? "..." : actionLabel}
      </button>
    </motion.div>
  );
}
