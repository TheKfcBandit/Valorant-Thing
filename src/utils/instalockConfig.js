import { NONE_AGENT, SKIRMISH_ALLOWED } from "./agents";
import { SKIRMISH_MAPS } from "./maps";

export const CONFIG_KEY = "instalock-config";
export const PROFILES_KEY = "instalock-profiles";
export const ACTIVE_PROFILE_KEY = "instalock-active-profile";

// Agents are stored on disk as the smallest envelope that can survive a
// reload — just the fields the UI actually reads back. Keeps the json
// blob small and resilient to upstream schema additions.
export const slimAgent = (a) =>
  a ? { uuid: a.uuid, displayName: a.displayName, displayIcon: a.displayIcon } : null;

export function saveConfig(selectedAgent, perMapSelections, active) {
  const perMap = {};
  for (const [mapId, agent] of Object.entries(perMapSelections)) {
    perMap[mapId] = slimAgent(agent);
  }
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ defaultAgent: slimAgent(selectedAgent), perMap, active })
  );
}

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null;
  } catch {
    return null;
  }
}

export function loadProfiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProfilesLS(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

// Look up a previously-saved agent in a fresh agents list. The saved
// entry is a `slimAgent` shape; on reload we need to swap in the live
// reference (so abilities, role, full icon URLs are populated).
export function resolveAgent(sorted, saved) {
  if (!saved) return null;
  if (saved.uuid === "none") return NONE_AGENT;
  return sorted.find((a) => a.uuid === saved.uuid) || null;
}

export function restorePerMap(sorted, perMap) {
  const restored = {};
  if (perMap) {
    for (const [mapId, saved] of Object.entries(perMap)) {
      const agent = resolveAgent(sorted, saved);
      if (agent) restored[mapId] = agent;
      else if (saved?.uuid === "none") restored[mapId] = NONE_AGENT;
    }
  }
  return restored;
}

function normalizeAbilityName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function isSkirmishMap(map) {
  return !!map && SKIRMISH_MAPS.has(map.displayName);
}

export function getSkirmishAbilityName(agent) {
  if (!agent) return null;
  return SKIRMISH_ALLOWED[agent.displayName.toLowerCase()] || null;
}

export function getAllowedAgentsForMap(agents, map) {
  if (!isSkirmishMap(map)) return agents;
  return agents.filter((agent) => !!getSkirmishAbilityName(agent));
}

// Skirmish maps restrict the agent pool AND each agent to one specific
// ability — this returns only the ability the map allows, so the card
// can show that one icon instead of the full kit.
export function getAbilityIconsForAgent(agent, map) {
  if (!agent || agent.uuid === "none") return [];
  const abilities = Array.isArray(agent.abilities)
    ? agent.abilities.filter((ability) => ability?.displayIcon)
    : [];
  if (!isSkirmishMap(map)) return abilities.slice(0, 4);

  const wanted = normalizeAbilityName(getSkirmishAbilityName(agent));
  if (!wanted) return [];
  const match = abilities.find((ability) => normalizeAbilityName(ability.displayName) === wanted);
  return match ? [match] : [];
}

export function isAgentAllowedForMap(agent, map) {
  if (!agent || agent.uuid === "none") return true;
  if (!isSkirmishMap(map)) return true;
  return !!getSkirmishAbilityName(agent);
}

export const FREE_AGENTS = new Set(["brimstone", "jett", "phoenix", "sage", "sova"]);
