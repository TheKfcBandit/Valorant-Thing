import { getMaps } from "../valApiSkins";

// Maps that exist in the asset catalog but are never picked by the
// instalock UI — training rooms, range, etc.
export const EXCLUDED_MAPS = ["The Range", "Basic Training"];

// Deathmatch-only maps. Instalock splits the grid by mode.
export const DM_MAPS = new Set(["Kasbah", "Glitch", "Drift", "Piazza", "District"]);

// Skirmish-only maps. Each one only allows specific abilities — see
// SKIRMISH_ALLOWED in utils/agents.js.
export const SKIRMISH_MAPS = new Set(["Skirmish A", "Skirmish B", "Skirmish C"]);

// Riot internal map codenames (the last path segment of a custom-game map
// asset URL) → player-facing names. Used when valorant-api metadata
// hasn't loaded or doesn't know the asset yet.
export const MAP_CODENAMES = {
  Duality: "Bind",
  Triad: "Haven",
  Bonsai: "Split",
  Port: "Icebox",
  Foxtrot: "Breeze",
  Canyon: "Fracture",
  Pitt: "Pearl",
  Jam: "Lotus",
  Juliett: "Sunset",
  Infinity: "Abyss",
  HURM_Yard: "District",
  HURM_Alley: "Kasbah",
  HURM_Bowl: "Piazza",
  HURM_Helix: "Drift",
  HURM_ShipLong: "Glitch",
};

// Memoized URL-fragment → metadata lookup. The home and live pages
// need a fast { mapUrl → { name, splash, listIcon } } table. Built
// once on first call.
let mapMetadataCache = null;
export async function getMapMetadataByUrl() {
  if (mapMetadataCache) return mapMetadataCache;
  try {
    const maps = await getMaps();
    const lookup = {};
    for (const m of maps) {
      const key = m.mapUrl?.split("/").pop();
      if (key) lookup[key] = { name: m.displayName, splash: m.splash, listIcon: m.listViewIcon };
    }
    mapMetadataCache = lookup;
  } catch {
    mapMetadataCache = {};
  }
  return mapMetadataCache;
}
