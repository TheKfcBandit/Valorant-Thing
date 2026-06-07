import { Label } from "../ui/Label";

// One scoreboard column — team-vs-team layout or flat-list for DM. Moved
// verbatim from HomePage.jsx in commit (#36 pure-move); rendered by
// MatchDetailsModal. `badges` is the Map produced by computeScoreboardBadges
// (matchHighlights.js), keyed by player.subject.
export function MatchScoreboardColumn({ label, players, roundsPlayed, selfPuuid, badges }) {
  return (
    <div>
      <Label className="mb-2">{label}</Label>
      <ul className="space-y-1">
        {players.map((p) => {
          const isSelf = p.subject === selfPuuid;
          const k = p.stats?.kills || 0;
          const d = p.stats?.deaths || 0;
          const a = p.stats?.assists || 0;
          const acs = Math.round((p.stats?.score || 0) / roundsPlayed);
          const agentIcon = p.characterId
            ? `https://media.valorant-api.com/agents/${p.characterId}/displayicon.png`
            : null;
          const name = p.gameName
            ? `${p.gameName}#${p.tagLine || ""}`
            : p.subject
              ? p.subject.slice(0, 8)
              : "Unknown";
          const rowBadges = badges?.get?.(p.subject) || [];
          return (
            <li
              key={p.subject}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded ${isSelf ? "bg-val-red/15 border border-val-red/30" : "bg-base-700/40 border border-border"}`}
            >
              {agentIcon && (
                <img
                  src={agentIcon}
                  alt=""
                  className="w-7 h-7 rounded-full border border-white/10 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p
                    className={`text-xs font-display ${isSelf ? "text-val-red font-semibold" : "text-text-primary"} truncate`}
                  >
                    {name}
                  </p>
                  {rowBadges.map((b) => (
                    <span
                      key={b.id}
                      title={b.hint}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-display font-bold uppercase tracking-wider border border-current/30 bg-base-700/40 ${b.color}`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-text-muted tabular-nums">{acs} ACS</p>
              </div>
              <div className="text-right shrink-0 font-mono tabular-nums text-xs">
                <span className="text-text-primary">{k}</span>
                <span className="text-text-muted">/</span>
                <span className="text-red-400">{d}</span>
                <span className="text-text-muted">/</span>
                <span className="text-text-muted">{a}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
