import { Fragment, useMemo } from "react";
import { Label } from "../ui/Label";
import { ROUND_GLYPH, formatRoundTooltip, getRoundOutcome } from "../../utils/roundResult";

// Per-round win/loss pill strip with side-swap spacer at round 12 (the
// standard 13-rounds-per-half competitive/unrated convention). Moved
// verbatim from HomePage.jsx in commit (#36 pure-move).
export function MatchRoundsStrip({ rounds, selfTeam, players, queueId }) {
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

  return (
    <div className="mb-4">
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
          return (
            <Fragment key={idx}>
              {showHalfSpacer && idx === 12 && (
                <div className="w-1.5 h-7 shrink-0" aria-hidden="true" />
              )}
              <div
                title={formatRoundTooltip(r, nameByPuuid)}
                className={`relative w-7 h-7 rounded border flex items-center justify-center text-[10px] font-mono font-semibold tabular-nums shrink-0 ${tone}`}
              >
                {idx + 1}
                {glyph && (
                  <span className="absolute bottom-0 right-0.5 text-[7px] font-display leading-none opacity-70">
                    {glyph}
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
