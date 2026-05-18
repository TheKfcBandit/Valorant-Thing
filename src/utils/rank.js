const TIER_UUID = "03621f52-342b-cf4e-4f86-9350a49c6d04";

export const RANKS = [
  { tier: 0, name: "Unranked" },
  { tier: 3, name: "Iron 1" },
  { tier: 4, name: "Iron 2" },
  { tier: 5, name: "Iron 3" },
  { tier: 6, name: "Bronze 1" },
  { tier: 7, name: "Bronze 2" },
  { tier: 8, name: "Bronze 3" },
  { tier: 9, name: "Silver 1" },
  { tier: 10, name: "Silver 2" },
  { tier: 11, name: "Silver 3" },
  { tier: 12, name: "Gold 1" },
  { tier: 13, name: "Gold 2" },
  { tier: 14, name: "Gold 3" },
  { tier: 15, name: "Platinum 1" },
  { tier: 16, name: "Platinum 2" },
  { tier: 17, name: "Platinum 3" },
  { tier: 18, name: "Diamond 1" },
  { tier: 19, name: "Diamond 2" },
  { tier: 20, name: "Diamond 3" },
  { tier: 21, name: "Ascendant 1" },
  { tier: 22, name: "Ascendant 2" },
  { tier: 23, name: "Ascendant 3" },
  { tier: 24, name: "Immortal 1" },
  { tier: 25, name: "Immortal 2" },
  { tier: 26, name: "Immortal 3" },
  { tier: 27, name: "Radiant" },
];

export const rankIcon = (tier) =>
  `https://media.valorant-api.com/competitivetiers/${TIER_UUID}/${tier}/smallicon.png`;
export const rankName = (tier) => RANKS.find((r) => r.tier === tier)?.name || "Unranked";
