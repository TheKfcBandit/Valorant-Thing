import { InstalockTab } from "../../icons";
import { getAbilityIconsForAgent } from "../../utils/instalockConfig";

// Agent grid tile. Shows the agent portrait, name, and the kit icons
// (or the single skirmish-allowed ability when the parent passes a
// skirmish map). Unowned agents render at 40% opacity with the
// padlock overlay and are pointer-disabled.
export default function AgentCard({ agent, map = null, selected, onClick, owned = true }) {
  const abilityIcons = getAbilityIconsForAgent(agent, map);
  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={!owned}
        className={`group flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all duration-150 w-full ${
          !owned
            ? "border-transparent opacity-40 cursor-not-allowed"
            : selected
              ? "bg-accent-blue/10 border-accent-blue/60"
              : "border-transparent hover:bg-base-600/50"
        }`}
      >
        <div
          className={`relative w-14 h-14 rounded-md overflow-hidden bg-base-600 ${!owned ? "grayscale" : ""}`}
        >
          <img
            src={agent.displayIcon}
            alt={agent.displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {!owned && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <InstalockTab size={16} strokeWidth="2" className="text-white/70" />
            </div>
          )}
        </div>
        <span
          className={`text-[11px] font-body leading-tight truncate max-w-[72px] ${
            !owned
              ? "text-text-muted"
              : selected
                ? "text-accent-blue font-medium"
                : "text-text-secondary group-hover:text-text-primary"
          }`}
        >
          {agent.displayName}
        </span>
        {abilityIcons.length > 0 && (
          <div className="flex items-center justify-center gap-1 mt-0.5 flex-nowrap px-1 overflow-hidden">
            {abilityIcons.map((ability) => (
              <div key={ability.slot} className="w-3.5 h-3.5 shrink-0" title={ability.displayName}>
                <img
                  src={ability.displayIcon}
                  alt={ability.displayName}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}
