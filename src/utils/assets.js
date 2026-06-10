// Pure filtering for the Assets browser (#28). Items come from the
// valApiSkins catalogs: { id, kind, name, image, tier, weapon }.

export const ASSET_KINDS = [
  { id: "skin", label: "Skins" },
  { id: "buddy", label: "Buddies" },
  { id: "spray", label: "Sprays" },
  { id: "card", label: "Cards" },
  { id: "title", label: "Titles" },
];

export function filterAssets(items, { query = "", kind = "skin", weapon = "all", tier = "all" }) {
  const q = query.trim().toLowerCase();
  return (items || []).filter((it) => {
    if (it.kind !== kind) return false;
    if (weapon !== "all" && it.weapon !== weapon) return false;
    if (tier !== "all" && it.tier !== tier) return false;
    if (q && !`${it.name || ""} ${it.weapon || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// Distinct weapon names present in the catalog, sorted, for the filter
// dropdown. Only skins carry a weapon.
export function weaponOptions(items) {
  const set = new Set();
  for (const it of items || []) {
    if (it.kind === "skin" && it.weapon) set.add(it.weapon);
  }
  return [...set].sort();
}
