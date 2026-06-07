import { AgentSilhouette, NoEntry } from "../../icons";
import { getAbilityIconsForAgent } from "../../utils/instalockConfig";

// Map row in the per-map view. Renders the map's list-view art behind
// a dimming overlay, the resolved agent (with override/default badge)
// or a NoEntry sentinel if "none" is pinned, and the agent's ability
// icons (skirmish maps show only the allowed one).
export default function MapCard({ map, selectedAgent, isDefault, onClick }) {
  const abilityIcons = getAbilityIconsForAgent(selectedAgent, map);
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg border border-border hover:border-border-light transition-all duration-150 text-left min-h-16 w-full"
    >
      <div className="absolute inset-0 bg-base-600 overflow-hidden">
        {map.listViewIcon && (
          <img
            src={map.listViewIcon}
            alt=""
            className="w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-opacity duration-150"
            loading="lazy"
          />
        )}
      </div>
      <div className="absolute inset-0 bg-base-900/50" />
      <div className="relative h-full flex items-start gap-3 px-3 py-2">
        {selectedAgent && selectedAgent.uuid !== "none" ? (
          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-base-600 mt-0.5">
            <img
              src={selectedAgent.displayIcon}
              alt={selectedAgent.displayName}
              className="w-full h-full object-cover"
            />
          </div>
        ) : selectedAgent?.uuid === "none" ? (
          <div className="w-9 h-9 rounded-lg shrink-0 bg-base-500/30 flex items-center justify-center mt-0.5">
            <NoEntry className="text-text-muted/50" />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg shrink-0 bg-base-500/30 flex items-center justify-center text-text-muted/20 mt-0.5">
            <AgentSilhouette />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-display font-semibold text-text-primary leading-tight truncate">
              {map.displayName}
            </p>
            {selectedAgent && selectedAgent.uuid !== "none" && abilityIcons.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                {abilityIcons.map((ability) => (
                  <img
                    key={ability.slot}
                    src={ability.displayIcon}
                    alt={ability.displayName}
                    title={ability.displayName}
                    className="w-4 h-4 object-contain"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
          </div>
          {selectedAgent ? (
            <p className="text-xs font-body text-text-muted leading-tight mt-0.5">
              {selectedAgent.displayName}
              {!isDefault && <span className="text-text-muted/50"> (override)</span>}
              {isDefault && <span className="text-text-muted/50"> (default)</span>}
            </p>
          ) : (
            <p className="text-xs font-body text-text-muted/40 leading-tight mt-0.5 italic">
              No agent
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
