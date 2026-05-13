let weaponsPromise = null;
let levelLookup = null;

export async function getLevelLookup() {
  if (levelLookup) return levelLookup;
  if (!weaponsPromise) {
    weaponsPromise = fetch("https://valorant-api.com/v1/weapons")
      .then(r => r.json())
      .then(d => d.data);
  }
  const weapons = await weaponsPromise;
  const out = {};
  for (const w of weapons) {
    for (const skin of w.skins || []) {
      const tier = skin.contentTierUuid?.toLowerCase();
      const baseLevel = (skin.levels || [])[0];
      for (const lvl of skin.levels || []) {
        out[lvl.uuid.toLowerCase()] = {
          levelUuid: lvl.uuid.toLowerCase(),
          skinUuid: skin.uuid.toLowerCase(),
          name: skin.displayName,
          icon: lvl.displayIcon || skin.displayIcon || baseLevel?.displayIcon || "",
          tier,
          weapon: w.displayName,
        };
      }
    }
  }
  levelLookup = out;
  return out;
}
