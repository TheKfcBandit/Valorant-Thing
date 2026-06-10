// valorant-api.com contentTierUuid → accent color. Shared by the loadout
// editor, the storefront cards and the assets browser.
export const RARITY_COLORS = {
  "0cebb8be-46d7-c12a-d306-e9907bfc5a25": "#5a9fe2",
  "60bca009-4182-7998-dee7-b8a2558dc369": "#009587",
  "12683d76-48d7-84a3-4e09-6985794f0445": "#d1548d",
  "411e4a55-4e59-7757-41f0-86a53f101bb5": "#f5955b",
  "e046854e-406c-37f4-6607-19a9ba8426fc": "#fad663",
};

// Same UUIDs with their in-game edition names, cheapest first — drives the
// rarity filter dropdown in the assets browser.
export const RARITY_TIERS = [
  { id: "0cebb8be-46d7-c12a-d306-e9907bfc5a25", name: "Select" },
  { id: "60bca009-4182-7998-dee7-b8a2558dc369", name: "Deluxe" },
  { id: "12683d76-48d7-84a3-4e09-6985794f0445", name: "Premium" },
  { id: "e046854e-406c-37f4-6607-19a9ba8426fc", name: "Ultra" },
  { id: "411e4a55-4e59-7757-41f0-86a53f101bb5", name: "Exclusive" },
];
