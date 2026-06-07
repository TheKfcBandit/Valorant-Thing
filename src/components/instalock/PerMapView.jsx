import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { NONE_AGENT, ROLES, ROLE_ICONS } from "../../utils/agents";
import { DM_MAPS, SKIRMISH_MAPS } from "../../utils/maps";
import { isAgentAllowedForMap, isSkirmishMap } from "../../utils/instalockConfig";
import { ArrowLeft, Crosshair, MapFold, SkirmishSun } from "../../icons";
import AgentCard from "./AgentCard";
import MapCard from "./MapCard";
import NoneButton from "./NoneButton";

// Per-map view. Two states:
//   - No map selected → render the map gallery (Standard / Skirmish /
//     Deathmatch sections). Each card shows the resolved agent for
//     that map, with a "default" or "override" badge.
//   - Map selected → render the agent grid for that map, with a Back
//     affordance, role filter, and a "None" sentinel at the top of the
//     grid (so the user can pin "no agent" per-map).
export default function PerMapView({
  filteredAgents,
  selectedMapAgents,
  maps,
  search,
  selectedMap,
  selectedAgent,
  onMapSelect,
  onMapBack,
  perMapSelections,
  onAgentClick,
  onNoneClick,
  getAgentForMap,
  getMapAgent,
  isOwned,
  roleFilter,
}) {
  if (!selectedMap) {
    return (
      <MapGallery
        maps={maps}
        search={search}
        perMapSelections={perMapSelections}
        getMapAgent={getMapAgent}
        getAgentForMap={getAgentForMap}
        onMapSelect={onMapSelect}
      />
    );
  }

  const currentSelection = perMapSelections[selectedMap.uuid];
  const isNoneSelected = currentSelection?.uuid === "none";
  const selectableAgents = isSkirmishMap(selectedMap) ? selectedMapAgents : filteredAgents;
  const currentMapAgent = isAgentAllowedForMap(currentSelection || selectedAgent, selectedMap)
    ? currentSelection || selectedAgent
    : NONE_AGENT;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onMapBack}
          className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-xs font-display transition-colors"
        >
          <ArrowLeft />
          Back
        </button>
        <span className="text-text-secondary text-xs">—</span>
        <span className="text-text-primary text-xs font-display font-medium">
          {selectedMap.displayName}
        </span>
        {isSkirmishMap(selectedMap) && (
          <span className="text-[10px] font-display uppercase tracking-wider text-text-muted ml-2">
            Restricted pool
          </span>
        )}
        {currentSelection && (
          <span
            className={`text-xs font-display ml-auto ${isNoneSelected ? "text-text-muted" : "text-accent-blue"}`}
          >
            {currentMapAgent?.displayName || currentSelection.displayName}
          </span>
        )}
      </div>
      {roleFilter !== "all" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
          <NoneButton selected={isNoneSelected} onClick={onNoneClick} />
          {selectableAgents.map((agent) => (
            <AgentCard
              key={agent.uuid}
              agent={agent}
              map={selectedMap}
              selected={currentSelection?.uuid === agent.uuid}
              onClick={() => onAgentClick(agent)}
              owned={isOwned(agent)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
            <NoneButton selected={isNoneSelected} onClick={onNoneClick} />
          </div>
          {ROLES.map((role) => {
            const roleAgents = selectableAgents.filter((a) => a.role?.displayName === role);
            if (!roleAgents.length) return null;
            return (
              <div key={role}>
                <div className="flex items-center gap-2 mb-2">
                  <img src={ROLE_ICONS[role]} alt="" className="w-3.5 h-3.5 opacity-60" />
                  <span className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
                    {role}s
                  </span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
                  {roleAgents.map((agent) => (
                    <AgentCard
                      key={agent.uuid}
                      agent={agent}
                      map={selectedMap}
                      selected={currentSelection?.uuid === agent.uuid}
                      onClick={() => onAgentClick(agent)}
                      owned={isOwned(agent)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MapGallery({ maps, search, perMapSelections, getMapAgent, getAgentForMap, onMapSelect }) {
  const q = search.toLowerCase();
  const filtered = search.trim()
    ? maps.filter((m) => m.displayName.toLowerCase().includes(q))
    : maps;

  const standard = filtered.filter(
    (m) => !DM_MAPS.has(m.displayName) && !SKIRMISH_MAPS.has(m.displayName)
  );
  const dm = filtered.filter((m) => DM_MAPS.has(m.displayName));
  const skirmish = filtered.filter((m) => SKIRMISH_MAPS.has(m.displayName));

  // startIdx drives the staggered animation delay. Explicit math so
  // sibling order isn't load-bearing.
  const skirmishStart = standard.length;
  const dmStart = standard.length + skirmish.length;

  return (
    <div className="space-y-4">
      {standard.length > 0 && (
        <MapSection
          title="Standard Maps"
          icon={<MapFold size={14} className="text-text-muted/60" />}
          items={standard}
          startIdx={0}
          getMapAgent={getMapAgent}
          perMapSelections={perMapSelections}
          onMapSelect={onMapSelect}
        />
      )}
      {skirmish.length > 0 && (
        <MapSection
          title="Skirmish"
          icon={<Crosshair size={14} className="text-text-muted/60" />}
          items={skirmish}
          startIdx={skirmishStart}
          getMapAgent={getMapAgent}
          perMapSelections={perMapSelections}
          onMapSelect={onMapSelect}
        />
      )}
      {dm.length > 0 && (
        <MapSection
          title="Deathmatch Maps"
          icon={<SkirmishSun size={14} className="text-text-muted/60" />}
          items={dm}
          startIdx={dmStart}
          // DM maps fall back to the default agent — they don't get
          // skirmish-restricted, just hide the per-map override badge.
          getMapAgent={(m) => getAgentForMap(m.uuid)}
          perMapSelections={perMapSelections}
          onMapSelect={onMapSelect}
        />
      )}
    </div>
  );
}

function MapSection({ title, icon, items, startIdx, getMapAgent, perMapSelections, onMapSelect }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
          {title}
        </span>
        <div className="flex-1 h-px bg-border/50" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {items.map((map, i) => {
          const idx = startIdx + i;
          const agent = getMapAgent(map);
          return (
            <motion.div
              key={map.uuid}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={noAnim() ? T0 : { duration: 0.15, delay: Math.min(idx * 0.03, 0.3) }}
            >
              <MapCard
                map={map}
                selectedAgent={agent}
                isDefault={!perMapSelections[map.uuid] && !!agent}
                onClick={() => onMapSelect(map)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
