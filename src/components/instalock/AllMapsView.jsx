import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { ROLES, ROLE_ICONS } from "../../utils/agents";
import AgentCard from "./AgentCard";

// Agent grid for the "All Maps" sub-tab. When a role filter is active,
// renders a flat grid; otherwise groups by role with a Duelist →
// Sentinel header order matching the live agent-select screen.
export default function AllMapsView({ agents, selectedAgent, onAgentClick, isOwned, roleFilter }) {
  if (roleFilter !== "all") {
    return (
      <div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.uuid}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={noAnim() ? T0 : { duration: 0.15, delay: Math.min(i * 0.02, 0.4) }}
            >
              <AgentCard
                agent={agent}
                selected={selectedAgent?.uuid === agent.uuid}
                onClick={() => onAgentClick(agent)}
                owned={isOwned(agent)}
              />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  const groups = ROLES.map((role) => ({
    role,
    agents: agents.filter((a) => a.role?.displayName === role),
  })).filter((g) => g.agents.length > 0);

  let idx = 0;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.role}>
          <div className="flex items-center gap-2 mb-2">
            <img src={ROLE_ICONS[g.role]} alt="" className="w-3.5 h-3.5 opacity-60" />
            <span className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
              {g.role}s
            </span>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
            {g.agents.map((agent) => {
              const i = idx++;
              return (
                <motion.div
                  key={agent.uuid}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={noAnim() ? T0 : { duration: 0.15, delay: Math.min(i * 0.02, 0.4) }}
                >
                  <AgentCard
                    agent={agent}
                    selected={selectedAgent?.uuid === agent.uuid}
                    onClick={() => onAgentClick(agent)}
                    owned={isOwned(agent)}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
