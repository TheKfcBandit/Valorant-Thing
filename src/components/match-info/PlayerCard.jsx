import { LIVE_MODULES } from "../../live/registry";
import { EyeOff } from "../../icons";

function hasAnyDialogContent(player, moduleData) {
  for (const mod of LIVE_MODULES) {
    if (!mod.DialogSection) continue;
    if (moduleData?.[mod.id]?.[player.puuid] != null) return true;
  }
  return false;
}

export function PlayerCard({ player, agents, tiers, moduleData, isSelf, onOpen }) {
  const agent = agents[player.characterId?.toLowerCase()];
  const acct = player.account;
  const mmr = player.mmr;
  const tierInfo = tiers[mmr?.currenttier] || null;
  const peakTierInfo = tiers[mmr?.peaktier] || null;
  const isLoading = player._loading;
  const displayName = acct?.name || agent?.displayName || player.puuid.slice(0, 8);
  const displayLevel = acct?.account_level || player.accountLevel || 0;

  const slots = [];
  for (const mod of LIVE_MODULES) {
    if (!mod.CardSlot) continue;
    const data = moduleData?.[mod.id]?.[player.puuid];
    if (data == null) continue;
    slots.push({ mod, data });
  }
  const hasModuleData = slots.length > 0 || hasAnyDialogContent(player, moduleData);

  return (
    <div
      role={hasModuleData ? "button" : undefined}
      tabIndex={hasModuleData ? 0 : undefined}
      onClick={hasModuleData ? onOpen : undefined}
      onKeyDown={
        hasModuleData
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
        isSelf ? "bg-val-red/10 border-val-red/30" : "bg-base-700 border-border"
      } ${hasModuleData ? "cursor-pointer hover:border-val-red/40" : ""}`}
    >
      <div className="w-10 h-10 rounded-lg bg-base-600 overflow-hidden shrink-0 flex items-center justify-center">
        {agent?.displayIconSmall ? (
          <img src={agent.displayIconSmall} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-text-muted text-[10px]">?</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {isLoading ? (
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 rounded bg-base-500 animate-pulse" />
            <div className="h-3 w-12 rounded bg-base-500/60 animate-pulse" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <p
                className={`text-sm font-display font-bold truncate ${isSelf ? "text-val-red" : "text-text-primary"}`}
              >
                {displayName}
              </p>
              {acct?.tag && <span className="text-xs font-body text-text-muted">#{acct.tag}</span>}
              {(player.incognito || player.hideLevel) && (
                <EyeOff className="text-text-muted/50 shrink-0" title="Hidden identity" />
              )}
              {isSelf && (
                <span className="text-[9px] font-display font-bold text-val-red/70 uppercase tracking-wider ml-0.5">
                  you
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="text-[11px] font-body text-text-primary shrink-0">
                {displayLevel > 0 ? `Level ${displayLevel}` : "Level ?"}
              </span>
              <span className="text-[11px] text-text-primary/50 shrink-0">·</span>
              <img
                src={
                  tierInfo?.icon ||
                  "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png"
                }
                alt=""
                className="w-3.5 h-3.5 shrink-0"
              />
              <span className="text-[11px] font-display font-semibold text-text-primary">
                {tierInfo?.name || "Unranked"}
              </span>
              <span className="text-[11px] font-body text-text-primary/70 shrink-0">
                {mmr?.ranking_in_tier ?? 0}RR
              </span>
              {peakTierInfo && mmr?.peaktier > 0 && (
                <>
                  <span className="text-[11px] text-text-primary/50 shrink-0">·</span>
                  <span className="text-[11px] font-body text-text-primary shrink-0">Peak:</span>
                  <img src={peakTierInfo.icon} alt="" className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-display font-semibold text-text-primary">
                    {peakTierInfo.name}
                  </span>
                  <span className="text-[11px] font-body text-text-primary/70">
                    {mmr?.peak_rr ?? 0}RR
                  </span>
                </>
              )}
            </div>
            {slots.map(({ mod, data }) => (
              <mod.CardSlot key={mod.id} player={player} data={data} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
