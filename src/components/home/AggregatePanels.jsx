import { customAgentIconByUuid } from "../../utils/agents";
import { Label } from "../ui/Label";

// Tracker.gg-style rollup panels. Renders three sections collapsed inside
// a <details> so the page layout doesn't change for users who don't care:
// overall stats for the current queue filter, top agents, top maps.
//
// Data shape (from `match_history_aggregate`):
//   { byAgent: [{agentId, games, wins, kills, deaths, assists}, ...],
//     byMap:   [{mapId,   games, wins}, ...],
//     overall: {games, wins, kills, deaths, assists}, limit, queueId }
export function AggregatePanels({ aggregate, maps, agentNames }) {
  const { overall, byAgent, byMap } = aggregate;
  const winPct = overall.games > 0 ? Math.round((overall.wins / overall.games) * 100) : 0;
  const kdRatio = overall.deaths > 0 ? (overall.kills / overall.deaths).toFixed(2) : "—";
  const avgK = overall.games > 0 ? (overall.kills / overall.games).toFixed(1) : "—";
  const avgD = overall.games > 0 ? (overall.deaths / overall.games).toFixed(1) : "—";
  const avgA = overall.games > 0 ? (overall.assists / overall.games).toFixed(1) : "—";

  return (
    <details className="rounded-xl border border-border bg-base-700/60 group" open>
      <summary className="cursor-pointer list-none p-3 flex items-center justify-between hover:bg-base-700/80 rounded-xl">
        <div className="flex items-baseline gap-3">
          <Label>Stats</Label>
          <span className="text-[11px] font-mono tabular-nums text-text-muted">
            {overall.games} games · {winPct}% WR · {kdRatio} K/D · {avgK}/{avgD}/{avgA}
          </span>
        </div>
        <span className="text-text-muted text-[10px] group-open:rotate-90 transition-transform">
          ▶
        </span>
      </summary>
      <div className="px-3 pb-3 grid grid-cols-2 gap-3">
        <AggregateList
          title="Top Agents"
          rows={byAgent.slice(0, 5)}
          renderRow={(r) => {
            const iconUrl = r.agentId
              ? customAgentIconByUuid(r.agentId) ||
                `https://media.valorant-api.com/agents/${r.agentId}/displayicon.png`
              : null;
            const wr = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
            const kd = r.deaths > 0 ? (r.kills / r.deaths).toFixed(2) : "—";
            return (
              <>
                {iconUrl && <img src={iconUrl} alt="" className="w-5 h-5 rounded-full shrink-0" />}
                <span className="flex-1 truncate text-text-primary">
                  {agentNames[r.agentId?.toLowerCase()] || r.agentId?.slice(0, 8) || "Unknown"}
                </span>
                <span className="text-text-muted tabular-nums">{r.games}g</span>
                <span className={`tabular-nums ${wr >= 50 ? "text-green-400" : "text-red-400"}`}>
                  {wr}%
                </span>
                <span className="text-text-muted tabular-nums">{kd}</span>
              </>
            );
          }}
        />
        <AggregateList
          title="Top Maps"
          rows={byMap.slice(0, 5)}
          renderRow={(r) => {
            const key = r.mapId?.split("/").pop();
            const mapData = key ? maps[key] : null;
            const name = mapData?.name || key || "Unknown";
            const wr = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
            return (
              <>
                <span className="flex-1 truncate text-text-primary">{name}</span>
                <span className="text-text-muted tabular-nums">{r.games}g</span>
                <span className={`tabular-nums ${wr >= 50 ? "text-green-400" : "text-red-400"}`}>
                  {wr}%
                </span>
              </>
            );
          }}
        />
      </div>
    </details>
  );
}

function AggregateList({ title, rows, renderRow }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-display font-bold text-text-muted uppercase tracking-wider mb-1">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-[10px] font-body text-text-muted italic">No data</p>
      ) : (
        rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-[10px] font-mono px-1.5 py-1 rounded hover:bg-base-600/40"
          >
            {renderRow(r)}
          </div>
        ))
      )}
    </div>
  );
}
