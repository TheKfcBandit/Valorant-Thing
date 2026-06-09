import { motion } from "framer-motion";
import { computeHighlights } from "../../matchHighlights";
import { noAnim, T0 } from "../../utils/animation";
import { MODE_NAMES } from "../../utils/gameMode";
import { customAgentIconByUuid } from "../../utils/agents";

export function MatchHistorySection({
  matches,
  matchLoading,
  maps,
  queueFilter,
  availableQueues,
  onQueueFilterChange,
  loadingMore,
  hasMoreInRiot,
  loadError,
  visibleCount,
  onLoadMore,
  onOpenMatch,
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-display font-semibold text-text-primary uppercase tracking-wider">
          Match History
        </h3>
        {availableQueues.length > 1 && (
          <select
            value={queueFilter}
            onChange={(e) => onQueueFilterChange(e.target.value)}
            className="text-[11px] font-body bg-base-700 border border-border rounded px-2 py-1 text-text-secondary focus:outline-none focus:border-text-muted"
            aria-label="Filter by queue"
          >
            <option value="all">All queues</option>
            {availableQueues.map((q) => (
              <option key={q} value={q}>
                {MODE_NAMES[q] || (q ? q.charAt(0).toUpperCase() + q.slice(1) : "Custom")}
              </option>
            ))}
          </select>
        )}
      </div>

      {matchLoading && !matches && (
        <div className="space-y-1.5 animate-pulse">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-base-700 border border-border flex items-center px-3 gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-base-600 shrink-0" />
              <div className="w-14 space-y-1">
                <div className="h-2.5 w-12 rounded bg-base-600" />
                <div className="h-3 w-8 rounded bg-base-600" />
              </div>
              <div className="h-3 w-16 rounded bg-base-600" />
              <div className="ml-auto space-y-1 text-right">
                <div className="h-3 w-20 rounded bg-base-600" />
                <div className="h-2.5 w-12 rounded bg-base-600 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`space-y-1.5 ${matchLoading ? "opacity-60 pointer-events-none" : ""}`}>
        {(matches || []).map((m, i) => (
          <MatchRow key={m.matchId || `idx-${i}`} m={m} i={i} maps={maps} onOpen={onOpenMatch} />
        ))}
        {matches && matches.length > 0 && (
          <div className="pt-2 flex items-center justify-center">
            <button
              onClick={onLoadMore}
              disabled={loadingMore || (!hasMoreInRiot && (matches?.length || 0) < visibleCount)}
              className={`text-[11px] font-display font-semibold tracking-wider uppercase px-3 py-1.5 rounded-md bg-base-700 hover:bg-base-600 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${loadError ? "border-red-500/40 text-red-400 hover:text-red-300" : "border-border text-text-secondary hover:text-text-primary"}`}
            >
              {loadingMore
                ? "Loading…"
                : loadError
                  ? "Load failed — click to retry"
                  : !hasMoreInRiot && (matches?.length || 0) < visibleCount
                    ? "End of history"
                    : `Load more (${matches?.length || 0} shown)`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function MatchRow({ m, i, maps, onOpen }) {
  const delay = Math.min(i * 0.03, 0.5);
  const mapData = maps[m.map];
  const mapName = mapData?.name || m.map;
  const mapImg = mapData?.listIcon || mapData?.splash;
  const agentIcon = m.agent
    ? customAgentIconByUuid(m.agent) ||
      `https://media.valorant-api.com/agents/${m.agent}/displayicon.png`
    : null;
  const kdaVal = m.deaths > 0 ? ((m.kills + m.assists) / m.deaths).toFixed(1) : null;
  const kdaText = kdaVal ? `${kdaVal} KDA` : "Perfect KDA";

  const q = m.queueId || "";
  const modeName = MODE_NAMES[q] || (q ? q.charAt(0).toUpperCase() + q.slice(1) : "Custom");
  const isDeathmatch = q === "deathmatch";
  const isEscalation = q === "ggteam" || q === "dodgeball";

  let resultText, resultColor, borderColor;
  if (isDeathmatch) {
    const dmWon = m.kills >= 40;
    resultText = dmWon ? "VICTORY" : "DEFEAT";
    resultColor = dmWon ? "text-green-400" : "text-red-400";
    borderColor = dmWon ? "border-green-500/20" : "border-red-500/20";
  } else if (isEscalation) {
    resultText = m.won ? "VICTORY" : "DEFEAT";
    resultColor = m.won ? "text-green-400" : "text-red-400";
    borderColor = m.won ? "border-green-500/20" : "border-red-500/20";
  } else {
    const draw = m.roundsWon === m.roundsLost && m.roundsWon === 0;
    const realDraw = !draw && m.roundsWon === m.roundsLost;
    if (draw) {
      resultText = "REMAKE";
      resultColor = "text-text-muted";
      borderColor = "border-text-muted/20";
    } else if (realDraw) {
      resultText = "DRAW";
      resultColor = "text-text-muted";
      borderColor = "border-text-muted/20";
    } else if (m.won) {
      resultText = "VICTORY";
      resultColor = "text-green-400";
      borderColor = "border-green-500/20";
    } else {
      resultText = "DEFEAT";
      resultColor = "text-red-400";
      borderColor = "border-red-500/20";
    }
  }

  const clickable = !!m.matchId;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2, delay }}
      onClick={clickable ? () => onOpen(m) : undefined}
      className={`relative rounded-lg overflow-hidden border ${borderColor} h-14 group ${clickable ? "cursor-pointer hover:border-text-muted/40 transition-colors" : ""}`}
    >
      {mapImg && (
        <img
          src={mapImg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-base-900/90 via-base-900/70 to-base-900/50" />

      <div className="relative h-full flex items-center px-3 gap-3">
        {agentIcon && (
          <img
            src={agentIcon}
            alt=""
            className="w-8 h-8 rounded-full border border-white/10 shrink-0"
          />
        )}

        <div className="w-16 shrink-0">
          <p
            className={`text-[10px] font-display font-bold uppercase tracking-wide ${resultColor}`}
          >
            {resultText}
          </p>
          <p className="text-xs font-mono text-text-muted">
            {isDeathmatch || isEscalation ? `${m.kills} kills` : `${m.roundsWon}-${m.roundsLost}`}
          </p>
        </div>

        <div className="w-20 shrink-0">
          <p className="text-xs font-display font-medium text-text-primary">{mapName}</p>
          <p className="text-[9px] font-body text-text-muted/60">{modeName}</p>
        </div>

        <div className="flex items-center gap-1 flex-wrap min-w-0">
          {computeHighlights(m).map((b) => (
            <span
              key={b.id}
              title={b.hint}
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-display font-bold uppercase tracking-wider border border-current/30 bg-base-700/40 ${b.color}`}
            >
              {b.label}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div className="text-right">
            <div className="flex items-center justify-end gap-0.5 text-xs font-mono">
              <span className="text-text-primary font-semibold">{m.kills}</span>
              <span className="text-text-muted">/</span>
              <span className="text-red-400 font-semibold">{m.deaths}</span>
              <span className="text-text-muted">/</span>
              <span className="text-text-muted">{m.assists}</span>
            </div>
            <p className="text-[10px] font-mono text-text-muted">{kdaText}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
