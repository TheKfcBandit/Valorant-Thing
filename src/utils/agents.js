// Agent metadata, role taxonomy, and the static lookups used by the
// instalock and match-info pages.

// Render order for role tabs in the instalock grid.
export const ROLE_ORDER = { Duelist: 0, Initiator: 1, Controller: 2, Sentinel: 3 };
export const ROLES = ["Duelist", "Initiator", "Controller", "Sentinel"];

// Role icons from valorant-api.com. Pinned by UUID so they don't shift
// when Riot republishes role art.
export const ROLE_ICONS = {
  Duelist:
    "https://media.valorant-api.com/agents/roles/dbe8757e-9e92-4ed4-b39f-9dfc589691d4/displayicon.png",
  Initiator:
    "https://media.valorant-api.com/agents/roles/1b47567f-8f7b-444b-aae3-b0c634622d10/displayicon.png",
  Controller:
    "https://media.valorant-api.com/agents/roles/4ee40330-ecdd-4f2f-98a8-eb1243428373/displayicon.png",
  Sentinel:
    "https://media.valorant-api.com/agents/roles/5fc02f99-4091-4486-a531-98459a3e95e9/displayicon.png",
};

// Sentinel value rendered when the user explicitly picks "no agent"
// in the instalock per-map grid. Shape matches the real agent objects
// from valorant-api.com so it can flow through the same rendering.
export const NONE_AGENT = { uuid: "none", displayName: "None", displayIcon: null };

// Custom community-added agents not in valorant-api.com.
export const CUSTOM_AGENTS = [
  {
    uuid: "7c8a4701-4de6-9355-b254-e09bc2a34b72",
    displayName: "Miks",
    displayIcon: "/agents/miks.png",
    role: {
      displayName: "Controller",
      displayIcon:
        "https://media.valorant-api.com/agents/roles/4ee40330-ecdd-4f2f-98a8-eb1243428373/displayicon.png",
    },
    isPlayableCharacter: true,
  },
];

// Skirmish maps restrict each agent to a single named ability. The
// instalock UI surfaces the allowed ability name when a player picks
// an agent for a skirmish map.
export const SKIRMISH_ALLOWED = {
  jett: "Tailwind",
  waylay: "Refract",
  chamber: "Rendezvous",
  cypher: "Cyber Cage",
  omen: "Shrouded Step",
  phoenix: "Curveball",
  yoru: "FAKEOUT",
  iso: "Contingency",
  sage: "Barrier Orb",
  raze: "Blast Pack",
  vyse: "Arc Rose",
  "kay/o": "FLASH/drive",
  breach: "Flashpoint",
  veto: "Crosscut",
};

// Look up the displayIcon for a custom agent by its UUID (case-
// insensitive). Returns undefined for unknown UUIDs. Use this when
// rendering a match-history row whose `agent` field is a UUID.
export function customAgentIconByUuid(uuid) {
  const key = String(uuid || "").toLowerCase();
  const match = CUSTOM_AGENTS.find((a) => a.uuid.toLowerCase() === key);
  return match?.displayIcon;
}
