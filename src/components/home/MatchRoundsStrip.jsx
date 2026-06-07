import { Fragment, useMemo } from "react";
import { Label } from "../ui/Label";
import { ROUND_GLYPH, formatRoundTooltip, getRoundOutcome } from "../../utils/roundResult";
import { classifyEconomy, getRoundMultiKills, teamRoundEconomy } from "../../utils/matchRounds";

// Per-round W/L pill strip, plus (#36) a per-team economy strip below it
// and multi-kill markers overlaid on rounds where any player got ≥ 3K.
// Each round pill is clickable when `onSelectRound` is provided; clicking
// the active round again collapses (parent passes null).
//
// State ownership: `expandedRound` lives in the parent modal — the strip
// just visualizes "which round is active" and reports clicks upward. The
// detail panel is rendered by the modal, not by the strip.

const ECONOMY_TONE = {
  pistol: "bg-yellow-500/15 border-yellow-500/40 text-yellow-300",
  eco: "bg-red-500/10 border-red-500/30 text-red-300",
  "half-buy": "bg-sky-500/10 border-sky-500/30 text-sky-300",
  "full-buy": "bg-green-500/10 border-green-500/30 text-green-300",
};

const ECONOMY_LETTER = {
  pistol: "P",
  eco: "$",
  "half-buy": "½",
  "full-buy": "$$",
};

const ECONOMY_HINT = {
  pistol: "Pistol round",
  eco: "Eco",
  "half-buy": "Half-buy / force",
  "full-buy": "Full-buy",
};

export function MatchRoundsStrip({
  rounds,
  selfTeam,
  players,
  queueId,
  expandedRound,
  onSelectRound,
}) {
  const nameByPuuid = useMemo(() => {
    const m = new Map();
    for (const p of players || []) {
      if (!p?.subject) continue;
      const tag = p.tagLine ? `#${p.tagLine}` : "";
      m.set(p.subject, p.gameName ? `${p.gameName}${tag}` : p.subject.slice(0, 8));
    }
    return m;
  }, [players]);

  // Side swap after round 12 for the standard 13-round-half modes only.
  const showHalfSpacer =
    (queueId === "competitive" || queueId === "unrated") && rounds.length >= 13;

  // Resolve "enemy team" once — `selfTeam` is lowercase; the team objects
  // on round.playerStats are reached via the players array's `teamId`.
  const enemyTeam = useMemo(() => {
    for (const p of players || []) {
      const t = String(p?.teamId || "").toLowerCase();
      if (t && t !== selfTeam) return t;
    }
    return "";
  }, [players, selfTeam]);

  // Pre-compute per-round multi-kills so the marker doesn't iterate
  // playerStats twice per render.
  const multiKillsByRound = useMemo(() => {
    const m = new Map();
    for (const r of rounds || []) {
      const mks = getRoundMultiKills(r);
      if (mks.length > 0) m.set(r?.roundNum, mks);
    }
    return m;
  }, [rounds]);

  const interactive = typeof onSelectRound === "function";
  const handleRoundClick = (roundNum) => {
    if (!interactive) return;
    onSelectRound(expandedRound === roundNum ? null : roundNum);
  };

  return (
    <div className="mb-4 space-y-2">
      <div>
        <Label className="mb-2">Rounds</Label>
        <div className="flex flex-wrap gap-0.5 items-center">
          {rounds.map((r, idx) => {
            const outcome = getRoundOutcome(r, selfTeam);
            const tone =
              outcome === "won"
                ? "bg-green-500/15 border-green-500/40 text-green-300"
                : outcome === "lost"
                  ? "bg-red-500/15 border-red-500/40 text-red-300"
                  : "bg-base-700/40 border-border text-text-muted";
            const code = r?.roundResultCode;
            const glyph = code && ROUND_GLYPH[code];
            const mks = multiKillsByRound.get(r?.roundNum);
            const mkHint = mks
              ? mks
                  .map(
                    ({ puuid, killCount }) =>
                      `${nameByPuuid.get(puuid) || puuid.slice(0, 8)} — ${killCount}K`
                  )
                  .join(", ")
              : "";
            const isExpanded = interactive && expandedRound === r?.roundNum;
            const title = mkHint
              ? `${formatRoundTooltip(r, nameByPuuid)} · Multi-kill: ${mkHint}`
              : formatRoundTooltip(r, nameByPuuid);
            const ringClass = isExpanded ? "ring-2 ring-val-red/70 ring-offset-0" : "";
            const cursorClass = interactive ? "cursor-pointer hover:brightness-125" : "";
            return (
              <Fragment key={idx}>
                {showHalfSpacer && idx === 12 && (
                  <div className="w-1.5 h-7 shrink-0" aria-hidden="true" />
                )}
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => handleRoundClick(r?.roundNum)}
                    title={title}
                    aria-pressed={isExpanded}
                    className={`relative w-7 h-7 rounded border flex items-center justify-center text-[10px] font-mono font-semibold tabular-nums shrink-0 transition-shadow ${tone} ${ringClass} ${cursorClass}`}
                  >
                    {idx + 1}
                    {glyph && (
                      <span className="absolute bottom-0 right-0.5 text-[7px] font-display leading-none opacity-70">
                        {glyph}
                      </span>
                    )}
                    {mks && (
                      <span
                        className="absolute top-0 left-0.5 text-[7px] leading-none text-yellow-300"
                        aria-hidden="true"
                      >
                        ★
                      </span>
                    )}
                  </button>
                ) : (
                  <div
                    title={title}
                    className={`relative w-7 h-7 rounded border flex items-center justify-center text-[10px] font-mono font-semibold tabular-nums shrink-0 ${tone}`}
                  >
                    {idx + 1}
                    {glyph && (
                      <span className="absolute bottom-0 right-0.5 text-[7px] font-display leading-none opacity-70">
                        {glyph}
                      </span>
                    )}
                    {mks && (
                      <span
                        className="absolute top-0 left-0.5 text-[7px] leading-none text-yellow-300"
                        aria-hidden="true"
                      >
                        ★
                      </span>
                    )}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Economy strip — gated on having identified an enemy team (i.e. we're
          in a proper team mode). DM / escalation / 2v2 fall through. */}
      {selfTeam && enemyTeam && (
        <div className="space-y-1">
          <EconomyRow
            label="You"
            rounds={rounds}
            teamId={selfTeam}
            players={players}
            showHalfSpacer={showHalfSpacer}
          />
          <EconomyRow
            label="Enemy"
            rounds={rounds}
            teamId={enemyTeam}
            players={players}
            showHalfSpacer={showHalfSpacer}
          />
        </div>
      )}
    </div>
  );
}

function EconomyRow({ label, rounds, teamId, players, showHalfSpacer }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-12 text-[9px] font-display font-bold uppercase tracking-wider text-text-muted shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-0.5 items-center">
        {rounds.map((r, idx) => {
          const avg = teamRoundEconomy(r, teamId, players);
          const cls = classifyEconomy(avg, r?.roundNum ?? idx);
          const tone = ECONOMY_TONE[cls] || ECONOMY_TONE["eco"];
          const letter = ECONOMY_LETTER[cls] || "·";
          const hint = `Round ${idx + 1}: ${ECONOMY_HINT[cls]}${
            cls !== "pistol" ? ` (avg ${avg.toLocaleString()})` : ""
          }`;
          return (
            <Fragment key={idx}>
              {showHalfSpacer && idx === 12 && (
                <div className="w-1.5 h-4 shrink-0" aria-hidden="true" />
              )}
              <div
                title={hint}
                className={`w-7 h-4 rounded border flex items-center justify-center text-[8px] font-mono font-semibold shrink-0 ${tone}`}
              >
                {letter}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
