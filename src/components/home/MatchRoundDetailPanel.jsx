import { useMemo } from "react";
import { Label } from "../ui/Label";
import { useApiLookup } from "../../hooks/useApiLookup";
import { getWeaponLookup } from "../../valApiSkins";
import { aggregateRoundDamage, getRoundKills, getRoundMultiKills } from "../../utils/matchRounds";
import { ROUND_GLYPH } from "../../utils/roundResult";

// Drill-down for one round of a match (#36). Mounted by MatchDetailsModal
// when the user clicks a round pill. Shows per-player kills with weapon
// icons, damage given for the round, and plant/defuse summary.
//
// Weapon-icon fetch is best-effort — `useApiLookup` returns `{}` while the
// network call resolves, so a freshly-opened modal will render names only
// for the first ~tick. Offline (cache hasn't been hit), it falls back to
// "Unknown weapon" rather than rendering the raw UUID hex.

export function MatchRoundDetailPanel({ round, players, selfPuuid, onClose }) {
  const weapons = useApiLookup(getWeaponLookup);

  const nameByPuuid = useMemo(() => {
    const m = new Map();
    for (const p of players || []) {
      if (!p?.subject) continue;
      const tag = p.tagLine ? `#${p.tagLine}` : "";
      m.set(p.subject, p.gameName ? `${p.gameName}${tag}` : p.subject.slice(0, 8));
    }
    return m;
  }, [players]);

  const teamByPuuid = useMemo(() => {
    const m = new Map();
    for (const p of players || []) {
      if (!p?.subject) continue;
      m.set(p.subject, String(p.teamId || "").toLowerCase());
    }
    return m;
  }, [players]);

  const multiKillByPuuid = useMemo(() => {
    const m = new Map();
    for (const { puuid, killCount } of getRoundMultiKills(round)) m.set(puuid, killCount);
    return m;
  }, [round]);

  // Split players into self-team / enemy-team based on the modal's notion
  // of self. When `selfPuuid` is unknown (offline cached identity) fall
  // back to grouping by raw teamId — better than nothing.
  const selfTeam = selfPuuid ? teamByPuuid.get(selfPuuid) || "" : "";
  const sortedPlayers = useMemo(() => {
    // Pre-roll damage given per puuid so the sort comparator is a Map
    // lookup, not a fresh aggregateRoundDamage() walk per comparison.
    const givenByPuuid = new Map();
    for (const stats of round?.playerStats || []) {
      if (stats?.subject)
        givenByPuuid.set(stats.subject, aggregateRoundDamage(round, stats.subject).given);
    }
    const list = [...(players || [])];
    list.sort((a, b) => {
      const aSelf = String(a.teamId || "").toLowerCase() === selfTeam ? 0 : 1;
      const bSelf = String(b.teamId || "").toLowerCase() === selfTeam ? 0 : 1;
      if (aSelf !== bSelf) return aSelf - bSelf;
      return (givenByPuuid.get(b.subject) || 0) - (givenByPuuid.get(a.subject) || 0);
    });
    return list;
  }, [players, round, selfTeam]);

  if (!round) return null;

  const roundNum = (round.roundNum ?? 0) + 1;
  const winningTeam = String(round.winningTeam || "").toLowerCase();
  const outcomeCode = round.roundResultCode || "";
  const outcomeGlyph = ROUND_GLYPH[outcomeCode];
  const ceremony = String(round.roundCeremony || "").replace(/^Ceremony/, "");

  const planterName = round.bombPlanter ? nameByPuuid.get(round.bombPlanter) : null;
  const defuserName = round.bombDefuser ? nameByPuuid.get(round.bombDefuser) : null;
  const plantSite = round.plantSite ? String(round.plantSite).toUpperCase() : "";

  return (
    <div className="mb-4 rounded-xl border border-border bg-base-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label className="mb-1">Round {roundNum}</Label>
          <p className="text-[11px] font-body text-text-muted">
            <span className={winningTeam === selfTeam ? "text-green-400" : "text-red-400"}>
              {winningTeam === selfTeam ? "Won" : "Lost"}
            </span>
            {outcomeGlyph && (
              <>
                {" "}
                <span className="text-text-muted">·</span> {outcomeCode}
              </>
            )}
            {ceremony && ceremony !== "Default" && (
              <>
                {" "}
                <span className="text-text-muted">·</span>{" "}
                <span className="text-yellow-300">{ceremony}</span>
              </>
            )}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] font-display font-bold text-text-muted hover:text-text-primary uppercase tracking-wider shrink-0"
            aria-label="Close round detail"
          >
            Close
          </button>
        )}
      </div>

      {(planterName || defuserName) && (
        <p className="text-[11px] font-body text-text-muted">
          {planterName && (
            <>
              <span className="text-text-primary">{planterName}</span> planted
              {plantSite && (
                <>
                  {" "}
                  on <span className="text-text-primary">{plantSite}</span>
                </>
              )}
            </>
          )}
          {planterName && defuserName && <span className="text-text-muted"> · </span>}
          {defuserName && (
            <>
              <span className="text-text-primary">{defuserName}</span> defused
            </>
          )}
        </p>
      )}

      <ul className="space-y-1">
        {sortedPlayers.map((p) => (
          <PlayerRoundRow
            key={p.subject}
            player={p}
            round={round}
            weapons={weapons}
            nameByPuuid={nameByPuuid}
            multiKillCount={multiKillByPuuid.get(p.subject) || 0}
            isSelf={p.subject === selfPuuid}
            isSelfTeam={String(p.teamId || "").toLowerCase() === selfTeam}
          />
        ))}
      </ul>
    </div>
  );
}

function PlayerRoundRow({
  player,
  round,
  weapons,
  nameByPuuid,
  multiKillCount,
  isSelf,
  isSelfTeam,
}) {
  const kills = useMemo(() => getRoundKills(round, player.subject), [round, player.subject]);
  const damage = useMemo(
    () => aggregateRoundDamage(round, player.subject),
    [round, player.subject]
  );
  const name = nameByPuuid.get(player.subject) || (player.subject || "").slice(0, 8);

  const rowTone = isSelf
    ? "bg-val-red/15 border-val-red/30"
    : isSelfTeam
      ? "bg-base-600/40 border-border"
      : "bg-base-700/40 border-border";

  return (
    <li className={`px-2 py-1.5 rounded border ${rowTone}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs font-display ${isSelf ? "text-val-red font-semibold" : "text-text-primary"} truncate min-w-[120px]`}
        >
          {name}
        </span>
        {multiKillCount >= 3 && (
          <span className="px-1.5 py-0.5 rounded text-[8px] font-display font-bold uppercase tracking-wider border border-yellow-500/40 bg-yellow-500/10 text-yellow-300">
            {multiKillCount === 5 ? "Ace" : multiKillCount === 4 ? "4K" : `${multiKillCount}K`}
          </span>
        )}
        {damage.given > 0 && (
          <span className="text-[10px] font-mono tabular-nums text-text-muted">
            {damage.given} dmg
            {damage.headshots > 0 && (
              <span className="text-yellow-300"> · {damage.headshots} hs</span>
            )}
          </span>
        )}
      </div>
      {kills.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {kills.map((k, i) => {
            const w = weapons[k.weaponId];
            const wName = w?.displayName || (k.damageType === "Ability" ? "Ability" : "Unknown");
            const victimName = nameByPuuid.get(k.victim) || (k.victim || "").slice(0, 8);
            return (
              <span
                key={i}
                title={`${wName} kill on ${victimName}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-base-800/60 border border-border text-[10px] font-mono"
              >
                {w?.displayIcon && (
                  <img src={w.displayIcon} alt="" className="h-3 w-auto object-contain" />
                )}
                <span className="text-text-secondary">{victimName}</span>
              </span>
            );
          })}
        </div>
      )}
    </li>
  );
}
