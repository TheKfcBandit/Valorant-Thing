import { getMaps } from "../valApiSkins";

// Maps that exist in the asset catalog but are never picked by the
// instalock UI — training rooms, range, etc.
export const EXCLUDED_MAPS = ["The Range", "Basic Training"];

// Deathmatch-only maps. Instalock splits the grid by mode.
export const DM_MAPS = new Set(["Kasbah", "Glitch", "Drift", "Piazza", "District"]);

// Skirmish-only maps. Each one only allows specific abilities — see
// SKIRMISH_ALLOWED in utils/agents.js.
export const SKIRMISH_MAPS = new Set(["Skirmish A", "Skirmish B", "Skirmish C"]);

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
